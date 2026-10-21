"""Deterministic tools over validated records, with a hard culture replay boundary."""

import math

from backend.agent_models import AnalyzeRequest, Citation, EvidenceClaim
from backend.agent_store import fingerprint
from backend.models import ExperimentRequest
from backend.predictions import predict_experiments
from backend.marker_calls import normalize_call

MODULE_NAMES = {"guard": "Bioreactor Guard", "pilot": "ErythroPilot", "plan": "CulturePlan", "match": "RareMatch"}
CHANNEL_UNITS = {"ph": "", "temperature_c": "degrees C", "do_percent": "%",
                 "glucose_mmol_l": "mmol/L", "glutamine_mmol_l": "mmol/L",
                 "lactate_mmol_l": "mmol/L", "ammonia_mmol_l": "mmol/L", "viability_percent": "%"}


def guard_state(samples, cursor):
    visible = [row for row in samples if row.hour <= cursor]
    valid, events = [], []
    for i, row in enumerate(visible):
        if row.count is None or row.count <= 0:
            events.append({"hour": row.hour, "rule": "valid_positive_measurement", "status": "needs_review",
                           "value": row.count, "reason": "Missing or non-positive cell count."})
            continue
        valid.append(row)
        if i >= 2 and all(s.count is not None and s.count > 0 for s in visible[i - 2:i + 1]):
            if visible[i - 2].count > visible[i - 1].count > row.count:
                events.append({"hour": row.hour, "rule": "two_consecutive_declines", "status": "warning",
                               "values": [r.count for r in visible[i - 2:i + 1]],
                               "hours": [r.hour for r in visible[i - 2:i + 1]]})
    invalid = any(e["status"] == "needs_review" for e in events)
    latest = valid[-1] if valid else None
    growth = None
    fold = None
    if valid and not invalid:
        fold = latest.count / valid[0].count
        if len(valid) >= 2:
            previous = valid[-2]
            growth = (math.log(latest.count) - math.log(previous.count)) / (latest.hour - previous.hour)
        if not all(math.isfinite(v) for v in [fold, growth if growth is not None else 0]):
            raise ValueError("Growth metrics exceeded the numeric range.")
    channel_values = {}
    for name, unit in CHANNEL_UNITS.items():
        measured = [r for r in visible if r.channels.get(name) is not None]
        channel_values[name] = ({"value": measured[-1].channels[name], "unit": unit, "measured_at": measured[-1].hour}
                                if measured else {"value": None, "unit": unit, "measured_at": None})
    return {"status": "needs_review" if invalid else "no_data" if not latest else "warning" if events else "normal",
            "cursor": cursor, "measurements": [r.model_dump() for r in visible],
            "latest_count": latest.count if latest else None, "measured_at": latest.hour if latest else None,
            "fold_change": fold, "growth_rate_per_hour": growth, "events": events, "channels": channel_values,
            "configured_rules": ["valid_positive_measurement", "two_consecutive_declines"],
            "additional_proposal_rules": "not_configured", "protocol_thresholds": "not_configured"}


def pilot_state(samples, cursor):
    end = min(cursor, samples[-1].hour)
    reports = []
    # Incremental boundaries avoid rescanning every source row for every checkpoint.
    visible_index = 0
    last_count = None
    last_hour = None
    for checkpoint in range(3, int(end) + 1, 3):
        fresh = 0
        while visible_index < len(samples) and samples[visible_index].hour <= checkpoint:
            row = samples[visible_index]
            if row.hour > checkpoint - 3:
                fresh += 1
            if row.count is not None and row.count > 0:
                last_count, last_hour = row.count, row.hour
            visible_index += 1
        reports.append({"checkpoint_hour": checkpoint, "new_measurements": fresh,
                        "last_count": last_count, "last_measurement_hour": last_hour,
                        "status": "new_measurements" if fresh else "no_new_measurement_data"})
    return {"status": reports[-1]["status"] if reports else "no_checkpoint",
            "checkpoint_count": len(reports), "latest_checkpoint": reports[-1] if reports else None,
            "reports": reports, "stage_classifier": {"status": "not_available", "reason": "No validated GSE53983 training/evaluation artifact is installed."}}


def cultureplan_state(source, objective):
    conditions = len({r.condition_id for r in source.rows})
    if conditions < 3:
        return {"status": "insufficient_conditions", "condition_count": conditions, "objective": objective}
    result = predict_experiments(ExperimentRequest(rows=source.rows, objective=objective, source_hash=source.sha256))
    plan = {"status": "fitted", "model_version": result["modelVersion"], "condition_count": conditions, **result["result"]}
    # Only compute a factorial contrast when the uploaded settings actually form a complete 2x2 design.
    ranked = plan["ranked"]
    lactate = sorted({r["lactate"] for r in ranked})
    ammonia = sorted({r["ammonia"] for r in ranked})
    if len(ranked) == 4 and len(lactate) == 2 and len(ammonia) == 2:
        cells = {(r["lactate"], r["ammonia"]): r["mean"] for r in ranked}
        if len(cells) == 4:
            ll, hl = cells[lactate[0], ammonia[0]], cells[lactate[1], ammonia[0]]
            lh, hh = cells[lactate[0], ammonia[1]], cells[lactate[1], ammonia[1]]
            plan["factorial_effects"] = {"lactate": (hl + hh - ll - lh) / 2,
                                        "ammonia": (lh + hh - ll - hl) / 2,
                                        "interaction": (ll - hl - lh + hh) / 2,
                                        "unit": ranked[0]["unit"], "significance_test": "not_performed"}
    return plan


def rarematch_state(source, active):
    from backend.evo2_service import marker_readiness
    results = []
    for row in source.rows:
        kel, slc = normalize_call(row.kel), normalize_call(row.slc)
        known = all(v in {"G/G", "G/A", "A/A"} for v in [kel, slc])
        status = "unknown" if not known else "match" if (kel, slc) == (active.kel, active.slc) else "excluded"
        results.append({"sample_id": row.sample_id, "kel": kel, "slc": slc, "status": status})
    return {"status": "pending_lab_verification", "target": {"kel": active.kel, "slc": active.slc},
            "profile_count": len(results), "counts": {s: sum(r["status"] == s for r in results) for s in ["match", "excluded", "unknown"]},
            "results": results, "verification_requests": active.verification_requests,
            "actual_lab_results": None, "evo2_status": "roadmap_preview_only",
            "evo2_readiness": marker_readiness(source)}


def collect_context(request: AnalyzeRequest):
    active, inputs = request.active_context, request.inputs
    samples = [r for r in inputs.culture.rows if r.batch_id == active.batch_id]
    if not samples:
        raise ValueError("The selected batch does not exist in the active culture input.")
    guard = guard_state(samples, active.replay_elapsed_hours)
    modules = {"guard": guard, "pilot": pilot_state(samples, active.replay_elapsed_hours),
               "plan": cultureplan_state(inputs.experiments, active.objective), "match": rarematch_state(inputs.markers, active)}
    citations = []
    for module, source, scope in [("guard", inputs.culture, "culture"), ("pilot", inputs.culture, "culture"),
                                  ("plan", inputs.experiments, "experiments"), ("match", inputs.markers, "markers")]:
        citations.append(Citation(id=module, module=MODULE_NAMES[module], study_id="independent-" + scope + "-input",
                                  reference=source.name, source_sha256=source.sha256,
                                  content_sha256=fingerprint([r.model_dump() for r in source.rows]),
                                  evidence=source.evidence, measured_at=guard["measured_at"] if scope == "culture" else None))
    return {"active_context": active.model_dump(), "modules": modules,
            "source_records": {"culture": [r.model_dump() for r in samples if r.hour <= active.replay_elapsed_hours],
                               "experiments": [r.model_dump() for r in inputs.experiments.rows],
                               "markers": [r.model_dump() for r in inputs.markers.rows]},
            "citations": [c.model_dump() for c in citations], "tool_version": "hemobot-tools-v1"}


def claim_catalog(context):
    modules = context["modules"]
    guard, pilot, plan, match = [modules[m] for m in ["guard", "pilot", "plan", "match"]]
    batch = context["active_context"]["batch_id"]
    claims = []

    def add(id, module, text):
        claims.append(EvidenceClaim(id=id, module=module, text=text, citation_id=module))

    add("guard_status", "guard", f"Batch {batch} at replay {guard['cursor']:g} h has status {guard['status']}.")
    if guard["latest_count"] is not None:
        add("guard_count", "guard", f"The latest valid count is {guard['latest_count']:.6g} million cells, measured at {guard['measured_at']:g} h.")
    if guard["fold_change"] is not None:
        text = f"Observed fold change is {guard['fold_change']:.6g}."
        if guard["growth_rate_per_hour"] is not None:
            text += f" The latest interval log growth rate is {guard['growth_rate_per_hour']:.6g} per hour."
        add("guard_growth", "guard", text)
    if guard["events"]:
        event = guard["events"][-1]
        text = (f"Two consecutive measured count declines triggered a trend warning at {event['hour']:g} h."
                if event["rule"] == "two_consecutive_declines" else "Missing or non-positive counts require data review; derived growth metrics are withheld.")
        add("guard_warning", "guard", text + " This does not establish contamination, a physical leak, or a biological cause.")
    measured = [(k, v) for k, v in guard["channels"].items() if v["value"] is not None]
    if measured:
        text = "; ".join(f"{k}: {v['value']:.6g} {v['unit']} at {v['measured_at']:g} h" for k, v in measured)
        add("guard_channels", "guard", "Latest available channel measurements: " + text + ". Protocol thresholds are not configured; these are not high/low classifications.")
    else:
        add("guard_channels", "guard", "No environmental or metabolite channel measurements are available at this replay cursor.")
    add("guard_rules", "guard", "Only count validity and consecutive-decline checks are configured. Additional proposal warning rules require protocol definitions.")
    checkpoint = pilot["latest_checkpoint"]
    if checkpoint:
        add("pilot_checkpoint", "pilot", f"The latest completed checkpoint is {checkpoint['checkpoint_hour']:g} h, with {checkpoint['new_measurements']} new source measurement(s) in that interval. " +
            ("No new measurement data; retained values are not new observations." if not checkpoint["new_measurements"] else "Review the source measurement and any count warnings."))
    else:
        add("pilot_checkpoint", "pilot", "No completed three-hour checkpoint is available at this replay cursor.")
    add("pilot_classifier", "pilot", "Stage classification and GSE53983 evaluation metrics are unavailable; no fitted classifier artifact is installed.")
    if plan["status"] == "fitted":
        best = plan["ranked"][0]
        add("plan_candidate", "plan", f"For objective {plan['objective']}, condition {best['id']} ranks first for remeasurement: GP mean {best['prediction']:.6g} {best['unit']}, uncertainty SD {best['uncertainty']:.6g}, expected improvement {best['ei']:.6g}. This ranking covers observed settings only.")
        add("plan_validation", "plan", f"Leave-one-condition-out mean absolute error is {plan['mae']:.6g}, versus mean-baseline error {plan['baselineMAE']:.6g}. Replicates are held out together; no significance claim is made.")
        if "factorial_effects" in plan:
            effects = plan["factorial_effects"]
            add("plan_doe", "plan", f"The complete two-by-two observed design has lactate effect {effects['lactate']:.6g}, ammonia effect {effects['ammonia']:.6g}, and interaction {effects['interaction']:.6g} {effects['unit']}. These contrasts are descriptive and are not causal evidence for the selected culture batch.")
    else:
        add("plan_candidate", "plan", "Fewer than three experiment conditions are available; GP fitting and rankings are withheld.")
    counts = match["counts"]
    add("match_screen", "match", f"Marker screening includes {match['profile_count']} profiles: {counts['match']} match, {counts['excluded']} excluded, and {counts['unknown']} unknown for the selected marker signature. Culture and marker inputs remain independent.")
    add("match_lab", "match", "Post-harvest status remains pending_lab_verification. Checklist selections record laboratory requests, never completed genotyping or serology.")
    add("match_evo2", "match", "Evo 2 input preparation is available offline, but two-marker calls do not provide reference/alternate DNA sequences. This marker analysis does not run Evo 2 or ingest sequence scores. Optional NVIDIA trial scoring of bundled public variants is configured separately in the Evo 2 workspace. Local model execution, downloads, GPU provisioning and paid fallback remain disabled. No donor genomic stability audit is established.")
    return claims
