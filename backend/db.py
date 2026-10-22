"""Supabase Postgres. DATABASE_URL comes from the environment or the repo's .env file and never reaches the browser."""

import os
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
Error = psycopg.Error
ready = set()


def url():
    value = os.environ.get("DATABASE_URL")
    if not value and (ROOT / ".env").is_file():
        for line in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines():
            key, _, found = line.partition("=")
            if key.strip() == "DATABASE_URL":
                value = found.strip().strip("\"'")
    if not value:
        raise OSError("DATABASE_URL is not set.")
    return value


def connect():
    """Use as `with connect() as db:`; commits on success, rolls back on error, then closes."""
    # ponytail: one connection per call; add psycopg_pool if request latency matters.
    db = psycopg.connect(url(), connect_timeout=10)
    schema = os.environ.get("DATABASE_SCHEMA")
    if schema:
        db.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {0}; SET search_path TO {0}").format(sql.Identifier(schema)))
    if schema not in ready:
        db.execute(SCHEMA)
        db.commit()
        ready.add(schema)
    return db


def use_temporary_schema(test):
    """unittest helper: run `test` in its own empty schema, dropped on cleanup. Skips without DATABASE_URL."""
    try:
        url()
    except OSError:
        test.skipTest("DATABASE_URL is not set.")
    name = "test_" + uuid4().hex
    previous = os.environ.get("DATABASE_SCHEMA")
    os.environ["DATABASE_SCHEMA"] = name

    def cleanup():
        if previous is None:
            os.environ.pop("DATABASE_SCHEMA", None)
        else:
            os.environ["DATABASE_SCHEMA"] = previous
        ready.discard(name)
        with psycopg.connect(url()) as db:
            db.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(name)))

    test.addCleanup(cleanup)
