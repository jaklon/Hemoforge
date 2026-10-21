"""Local SQLite snapshots. No raw data or prompts are written to application logs."""

import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"), allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class AuditStore:
    def __init__(self, path):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(path, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(descriptor)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS workspaces (
                    id TEXT PRIMARY KEY, inputs_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analyses (
                    response_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
                    fingerprint TEXT NOT NULL, context_json TEXT NOT NULL,
                    request_json TEXT NOT NULL, response_json TEXT NOT NULL,
                    FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
                );
                CREATE INDEX IF NOT EXISTS analyses_fingerprint ON analyses(fingerprint);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            db.execute("PRAGMA foreign_keys=ON")
            with db:
                yield db
        finally:
            db.close()

    def save(self, request, context, response):
        inputs = request.inputs.model_dump()
        workspace_id = fingerprint(inputs)
        metadata = request.model_dump(exclude={"inputs"})
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO workspaces VALUES (?, ?)", (workspace_id, canonical(inputs)))
            db.execute("INSERT INTO analyses VALUES (?, ?, ?, ?, ?, ?)", (
                response.response_id, workspace_id, response.analysis_fingerprint,
                canonical(context), canonical(metadata), response.model_dump_json(),
            ))

    def get(self, response_id):
        with self.connect() as db:
            row = db.execute("SELECT context_json, request_json, response_json FROM analyses WHERE response_id = ?",
                             (response_id,)).fetchone()
        if row is None:
            return None
        # Exports respect the replay cutoff; future input measurements stay out of this view.
        return {"schema_version": "hemobot-audit-v1", "context": json.loads(row[0]),
                "request": json.loads(row[1]), "analysis": json.loads(row[2])}
