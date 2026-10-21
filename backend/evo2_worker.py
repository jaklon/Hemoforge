"""Future operator-run, local GPU adapter. Default execution only validates a manifest.

There is no provider URL, queue consumer, download helper, or automatic activation.
Do not execute inference until local hardware/weights and scientific evaluation are approved.
"""

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path

from backend.evo2_service import validate_bundle


def checkpoint_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def score_with_model(bundle, model, checkpoint_sha256, package_version):
    """Call a supplied local scorer only. Tests supply an explicitly synthetic fixture scorer."""
    rows = []
    for task in bundle.manifest.tasks:
        scores = model.score_sequences([task.reference_sequence, task.alternate_sequence], **bundle.manifest.scoring_options)
        if len(scores) != 2 or any(not math.isfinite(float(value)) or float(value) > 0 for value in scores):
            raise ValueError("Local scoring returned invalid log-likelihoods.")
        reference, alternate = map(float, scores)
        rows.append({"task_id": task.task_id, "reference_sha256": task.reference_sha256,
                     "alternate_sha256": task.alternate_sha256, "reference_log_likelihood": reference,
                     "alternate_log_likelihood": alternate, "delta_log_likelihood": alternate - reference})
    return {"schema_version": "hemoforge-evo2-local-result-v1", "preparation_id": bundle.preparation_id,
            "manifest_fingerprint": bundle.manifest_fingerprint, "model_name": bundle.manifest.model_name,
            "checkpoint_sha256": checkpoint_sha256, "evo2_package_version": package_version,
            "generated_at": datetime.now(timezone.utc).isoformat(), "execution_status": "local_execution_completed",
            "evidence_quality": "unverified_exploratory", "laboratory_status": "pending_lab_verification",
            "scoring_options": bundle.manifest.scoring_options, "scores": rows,
            "limitations": bundle.manifest.warnings,
            "verification": "Local execution metadata is not independent model or biological validation. This file is not automatically imported into HemoBot."}


def run_local(bundle, checkpoint, expected_hash, *, execute=False):
    bundle = validate_bundle(bundle.model_dump())
    if not execute or os.environ.get("EVO2_ENABLE_LOCAL_INFERENCE") != "1":
        return {"status": "disabled_budget_lock", "manifest_valid": True, "task_count": len(bundle.manifest.tasks),
                "score_status": "not_run", "delta_log_likelihood": None}
    # These checks all precede importing Torch/Evo2. There is no model-name-only fallback.
    path = Path(checkpoint) if checkpoint else None
    if path is None or not path.is_file() or path.suffix != ".pt" or not expected_hash or len(expected_hash) != 64:
        raise ValueError("Explicit local .pt weights and their reviewed SHA-256 are required; downloading is disabled.")
    if checkpoint_hash(path) != expected_hash:
        raise ValueError("Local checkpoint SHA-256 mismatch.")
    for key in ["HF_HUB_OFFLINE", "HF_DATASETS_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_HUB_DISABLE_TELEMETRY"]:
        os.environ[key] = "1"
    import torch
    if not torch.cuda.is_available():
        raise ValueError("A compatible, already available local CUDA GPU is required; no GPU will be provisioned.")
    from evo2 import Evo2
    model = Evo2(model_name=bundle.manifest.model_name, local_path=str(path.resolve()), use_kernels=False)
    return score_with_model(bundle, model, expected_hash, importlib.metadata.version("evo2"))


def main():
    parser = argparse.ArgumentParser(description="Validate a prepared Evo 2 bundle offline. Inference is disabled by default.")
    parser.add_argument("manifest")
    parser.add_argument("--checkpoint")
    parser.add_argument("--checkpoint-sha256")
    parser.add_argument("--execute-local", action="store_true", help="Future explicit local execution; also requires EVO2_ENABLE_LOCAL_INFERENCE=1")
    parser.add_argument("--output", help="Write a new result JSON file; an existing file is never overwritten")
    args = parser.parse_args()
    path = Path(args.manifest)
    if not path.is_file() or path.stat().st_size > 2 * 1024 * 1024:
        parser.error("Use a local prepared manifest up to two MB.")
    try:
        bundle = validate_bundle(json.loads(path.read_text(encoding="utf-8-sig")))
        result = run_local(bundle, args.checkpoint, args.checkpoint_sha256, execute=args.execute_local)
        output = json.dumps(result, indent=2, allow_nan=False)
        if args.output:
            with Path(args.output).open("x", encoding="utf-8") as file:
                file.write(output + "\n")
        else:
            print(output)
    except (ValueError, OSError, ImportError) as error:
        parser.exit(2, f"Evo 2 local adapter did not run: {error}\n")


if __name__ == "__main__":
    main()
