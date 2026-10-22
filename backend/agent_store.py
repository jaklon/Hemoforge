"""Supabase Postgres snapshots. No raw data or prompts are written to application logs."""

import hashlib
import json

from backend.db import connect


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class AuditStore:
    def save(self, request, context, response):
        inputs = request.inputs.model_dump()
        workspace_id = fingerprint(inputs)
        metadata = request.model_dump(exclude={"inputs"})
        with connect() as db:
            db.execute("INSERT INTO workspaces VALUES (%s, %s) ON CONFLICT DO NOTHING", (workspace_id, canonical(inputs)))
            db.execute("INSERT INTO analyses VALUES (%s, %s, %s, %s, %s, %s)", (
                response.response_id, workspace_id, response.analysis_fingerprint,
                canonical(context), canonical(metadata), response.model_dump_json(),
            ))

    def get(self, response_id):
        with connect() as db:
            row = db.execute("SELECT context_json, request_json, response_json FROM analyses WHERE response_id = %s",
                             (response_id,)).fetchone()
        if row is None:
            return None
        # Exports respect the replay cutoff; future input measurements stay out of this view.
        return {"schema_version": "hemobot-audit-v1", "context": json.loads(row[0]),
                "request": json.loads(row[1]), "analysis": json.loads(row[2])}
