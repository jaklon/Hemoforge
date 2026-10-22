"""Business proposals from the Work with us page, kept in Supabase Postgres."""

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.db import Error, connect

router = APIRouter(prefix="/api", tags=["Proposals"])


class Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    company: str = Field(min_length=1, max_length=160)
    plan: Literal["Pilot", "Lab", "Enterprise", "Not sure yet"]
    proposal: str = Field(min_length=1, max_length=5000)


# ponytail: no rate limit or spam check; add one before exposing the API beyond the allowed hosts.
@router.post("/proposals", status_code=201)
def submit(proposal: Proposal):
    record = {"id": uuid.uuid4().hex, "received_at": datetime.now(timezone.utc).isoformat(), **proposal.model_dump()}
    try:
        with connect() as db:
            db.execute("INSERT INTO proposals VALUES (%(id)s, %(received_at)s, %(name)s, %(email)s, %(company)s, %(plan)s, %(proposal)s)",
                       record)
    except (Error, OSError) as error:
        raise HTTPException(status_code=503, detail="Proposal storage is unavailable. Please try again later.") from error
    return {"id": record["id"], "received_at": record["received_at"]}
