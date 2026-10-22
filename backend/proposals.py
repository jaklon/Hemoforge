"""Business proposals from the Work with us page, kept in a local SQLite file."""

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

DATABASE = Path(__file__).resolve().parents[1] / "data" / "proposals.sqlite3"

router = APIRouter(prefix="/api", tags=["Proposals"])


class Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    company: str = Field(min_length=1, max_length=160)
    plan: Literal["Pilot", "Lab", "Enterprise", "Not sure yet"]
    proposal: str = Field(min_length=1, max_length=5000)


def connect():
    DATABASE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    db = sqlite3.connect(DATABASE, timeout=10)
    db.execute("""
        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY, received_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
            company TEXT NOT NULL, plan TEXT NOT NULL, proposal TEXT NOT NULL
        )
    """)
    return db


# ponytail: no rate limit or spam check; add one before exposing the API beyond the allowed hosts.
@router.post("/proposals", status_code=201)
def submit(proposal: Proposal):
    record = {"id": uuid.uuid4().hex, "received_at": datetime.now(timezone.utc).isoformat(), **proposal.model_dump()}
    db = connect()
    try:
        with db:
            db.execute("INSERT INTO proposals VALUES (:id, :received_at, :name, :email, :company, :plan, :proposal)", record)
    finally:
        db.close()
    return {"id": record["id"], "received_at": record["received_at"]}
