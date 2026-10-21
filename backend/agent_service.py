"""Orchestration, scientific boundaries, bounded inference, and durable audit records."""

import html
import json
import re
import threading
from datetime import datetime, timezone
from uuid import uuid4

import httpx

from backend.agent_llm import SYSTEM_PROMPT, select_evidence
from backend.agent_models import AnalysisCard, AnalyzeResponse, EvidencePlan
from backend.agent_rag import retrieve
from backend.agent_store import AuditStore, fingerprint
from backend.agent_tools import MODULE_NAMES, claim_catalog, collect_context

INFERENCE_SLOT = threading.BoundedSemaphore(1)
DISCLAIMER = [
    "Bioreactor Guard warnings describe measurement trends; they do not diagnose contamination or physical vessel leakage.",
    "Culture, experiment, and marker sources are independent. They are not a linked donor-to-harvest study.",
    "Post-harvest status is pending_lab_verification; laboratory genotyping and serology are required. No clinical release is authorized.",
]
ACTIONS = {
    "review_counts": "Review source counts, sample times, measurement validity, and culture notes manually.",
    "review_metabolites": "Check available metabolite measurements and their units; obtain protocol thresholds before classifying them.",
    "repeat_condition": "Review the ranked observed condition and plan an independent repeat experiment.",
    "request_lab": "Request paired genotyping and phenotype/serology confirmation from the laboratory.",
}
ROADMAP = {"name": "RareMatch v2.0", "foundation_model": "Evo 2", "current_mvp_status": "roadmap_preview_only",
           "preparation_status": "available_offline", "inference_enabled": False, "external_providers_enabled": False,
           "optional_nvidia_trial": "separate_workspace_no_automatic_result_ingestion",
           "planned_capability": "Sequence-level variant scoring and post-harvest genomic investigation.",
           "result": None, "limitation": "A sequence likelihood score alone would not establish pathogenicity or genetic stability."}


def route_modules(request):
    if request.module != "all":
        return [request.module]
    terms = {"guard": r"guard|warning|drop|count|growth|metabolite|contamin|leak", "pilot": r"pilot|checkpoint|digest|stage|report",
             "plan": r"cultureplan|experiment|\bgp\b|\bei\b|lactate|ammonia|condition", "match": r"rarematch|marker|\bsnp\b|harvest|\bqc\b|evo|genotyp|serolog"}
    selected = [m for m, pattern in terms.items() if re.search(pattern, request.query_en, re.I)]
    if re.search(r"across|all modules|cross.module|workspace|summari[sz]e", request.query_en, re.I):
        return list(MODULE_NAMES)
    return selected or list(MODULE_NAMES)


def boundary_check(query):
    # High-risk requests never reach the model. Negated wording may conservatively trigger the same boundary.
    patterns = [r"(control|adjust|set|activate|operate).{0,40}(pump|valve|bioreactor|actuator|oxygen|temperature)",
                r"closed.loop|automatically.{0,30}(dose|harvest|release)",
                r"(safe|ready|eligible|compatible|approve|authorize|release).{0,35}(transfus|patient|clinical)",
                r"(merge|combine|join).{0,60}(studies|donor.to.harvest)"]
    return any(re.search(pattern, query, re.I) for pattern in patterns)


def analyze(request, settings):
    context = collect_context(request)
    modules = route_modules(request)
    catalog = claim_catalog(context)
    selected = [c.id for c in catalog if c.module in modules]
    defaults = [action for module, action in [("guard", "review_counts"), ("pilot", "review_counts"),
                ("plan", "repeat_condition"), ("match", "request_lab")] if module in modules]
    plan = EvidencePlan(language="en", claim_ids=selected, action_ids=list(dict.fromkeys(defaults)))
    engine, digest, reason = "deterministic-template-v1", None, None
    execution = "fallback"
    rag_status, literature = "disabled", []
    blocked = boundary_check(request.query_en)
    if blocked:
        execution = "blocked"
        reason = "The requested action exceeds the research-only scientific boundary. Evidence is provided for manual review."
    elif settings.mode == "template":
        reason = "LLM inference is disabled in the server configuration; deterministic templates were used."
    elif request.mode == "template":
        reason = "Template mode was selected; no LLM inference was requested."
    elif not INFERENCE_SLOT.acquire(blocking=False):
        reason = "Inference capacity is occupied; deterministic evidence is available immediately."
    else:
        try:
            try:
                rag_status, literature = retrieve(settings, request.query_en)
            except Exception:
                # Optional retrieval failures (including native Chroma errors) must not hide structured evidence.
                rag_status = "unavailable"
            plan, digest = select_evidence(settings, request.query_en, catalog, modules, literature)
            execution, engine = "succeeded", settings.ollama_model
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            reason = "Ollama is unavailable, timed out, or returned invalid evidence selections; verified templates were used."
        finally:
            INFERENCE_SLOT.release()
    # Required evidence limits cannot be suppressed by a model selecting only flattering results.
    required = {"guard": ["guard_status", "guard_warning", "guard_rules"], "pilot": ["pilot_checkpoint", "pilot_classifier"],
                "plan": ["plan_candidate", "plan_validation"], "match": ["match_screen", "match_lab", "match_evo2"]}
    claim_ids = list(dict.fromkeys(plan.claim_ids + [id for m in modules for id in required[m] if id in selected]))
    chosen = [next(c for c in catalog if c.id == id) for id in claim_ids]
    cards = [AnalysisCard(module=m, title=MODULE_NAMES[m], status=context["modules"][m]["status"],
                          statements=[c.text for c in chosen if c.module == m], citation_ids=[m]) for m in modules]
    narrative = "\n\n".join(c.text for c in chosen)
    evidence = ("needs_review" if context["modules"]["guard"]["status"] == "needs_review" else
                "user_supplied_unverified" if any(s.evidence == "user_supplied" for s in [request.inputs.culture, request.inputs.experiments, request.inputs.markers]) else
                "software_test_only")
    context_hash = fingerprint(context)
    audit_manifest = {"query": request.query_en, "context": context_hash, "claims": [c.model_dump() for c in chosen],
                              "actions": plan.action_ids, "literature": literature, "rag_status": rag_status,
                              "engine": engine, "digest": digest, "seed": 42, "prompt_hash": fingerprint(SYSTEM_PROMPT),
                              "execution": execution, "renderer": "hemobot-renderer-v1",
                              "options": {"temperature": 0, "num_ctx": settings.num_ctx, "num_thread": settings.num_thread, "num_predict": 384, "num_gpu": 0}}
    audit_hash = fingerprint(audit_manifest)
    response = AnalyzeResponse(response_id="hemobot-" + uuid4().hex, generated_at=datetime.now(timezone.utc).isoformat(),
        llm_engine=engine, model_digest=digest, execution_status=execution, evidence_quality=evidence, fallback_reason=reason,
        active_modules_used=modules, summary_headline="Research evidence for manual review" if blocked else "Evidence review · " + ", ".join(MODULE_NAMES[m] for m in modules),
        biomedical_analysis_markdown=narrative, cards=cards, suggested_actions=[ACTIONS[a] for a in plan.action_ids],
        citations=[c for c in context["citations"] if c["id"] in modules], literature=literature, rag_status=rag_status,
        mandatory_scientific_disclaimers=DISCLAIMER, rarematch_roadmap_evo2_extension=ROADMAP,
        analysis_fingerprint="sha256:" + audit_hash, context_fingerprint="sha256:" + context_hash, audit_manifest=audit_manifest)
    AuditStore(settings.database_path).save(request, context, response)
    return response


def export_audit(bundle, format):
    if format == "json":
        return json.dumps(bundle, indent=2, ensure_ascii=True, allow_nan=False), "application/json"
    analysis = bundle["analysis"]
    if format == "html":
        content = "<!doctype html><html lang='en'><meta charset='utf-8'><title>HemoForge · HemoBot audit</title>"
        content += "<style>body{font:16px/1.6 system-ui;max-width:960px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>"
        content += "<h1>HemoForge · HemoBot audit</h1><p>" + html.escape(analysis["summary_headline"]) + "</p>"
        content += "<pre>" + html.escape(json.dumps(bundle, indent=2, ensure_ascii=True)) + "</pre></html>"
        return content, "text/html"
    # A fenced JSON snapshot avoids treating source identifiers or imported text as Markdown instructions/links.
    data = json.dumps(bundle, indent=2, ensure_ascii=True)
    fence = "`" * max(3, max((len(m.group()) + 1 for m in re.finditer(r"`+", data)), default=3))
    return "# HemoForge · HemoBot audit\n\n" + fence + "json\n" + data + "\n" + fence + "\n", "text/markdown"
