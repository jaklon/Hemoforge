"""Workspace sign-in, the profile, notifications and per-account UI state, kept in Supabase Postgres."""

import hashlib
import hmac
import json
import os
import secrets
from typing import Any, Literal

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Path, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from backend.db import Error, connect

router = APIRouter(prefix="/api", tags=["Accounts"])
COOKIE = "hemoforge_session"
SESSION_DAYS = 14
NOTIFICATION_LIMIT = 300
ITERATIONS = 600_000


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SignIn(Strict):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class Profile(Strict):
    username: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(max_length=120)
    email: str = Field(max_length=254, pattern=r"^([^@\s]+@[^@\s]+\.[^@\s]+)?$")
    company: str = Field(max_length=160)
    role: str = Field(max_length=120)


class PasswordChange(Strict):
    current: str = Field(min_length=1, max_length=256)
    next: str = Field(min_length=8, max_length=256)


class Notification(Strict):
    message: str = Field(min_length=1, max_length=500)
    tone: Literal["info", "success", "error"]
    page: str = Field(min_length=1, max_length=40)


def hash_password(password, salt=None, iterations=ITERATIONS):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def password_matches(password, stored):
    _, iterations, salt, _ = stored.split("$")
    return hmac.compare_digest(hash_password(password, salt, int(iterations)), stored)


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def unavailable(error):
    raise HTTPException(status_code=503, detail="Account storage is unavailable. Please try again later.") from error


def account_id(hemoforge_session: str | None = Cookie(default=None)):
    """Dependency: the signed-in account's id, or 401."""
    if not hemoforge_session:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    try:
        with connect() as db:
            row = db.execute(
                "SELECT account_id FROM account_sessions WHERE token_sha256 = %s"
                " AND created_at > clock_timestamp() - make_interval(days => %s)",
                (token_hash(hemoforge_session), SESSION_DAYS)).fetchone()
    except (Error, OSError) as error:
        unavailable(error)
    if not row:
        raise HTTPException(status_code=401, detail="Your session ended. Sign in again.")
    return row[0]


def profile(db, id):
    row = db.execute("SELECT username, name, email, company, role FROM accounts WHERE id = %s", (id,)).fetchone()
    return dict(zip(("username", "name", "email", "company", "role"), row))


@router.get("/health/db")
def database_health():
    try:
        with connect() as db:
            db.execute("SELECT 1")
    except (Error, OSError) as error:
        raise HTTPException(status_code=503, detail="Database unreachable.") from error
    return {"status": "ok"}


# ponytail: no sign-in rate limit or lockout; add one before real (non-demo) accounts exist.
@router.post("/auth/login")
def login(body: SignIn, request: Request, response: Response):
    try:
        with connect() as db:
            row = db.execute("SELECT id, password_hash FROM accounts WHERE username = %s", (body.username,)).fetchone()
            if not row or not password_matches(body.password, row[1]):
                raise HTTPException(status_code=401, detail="Wrong username or password.")
            token = secrets.token_urlsafe(32)
            db.execute("DELETE FROM account_sessions WHERE created_at < clock_timestamp() - make_interval(days => %s)",
                       (SESSION_DAYS,))
            db.execute("INSERT INTO account_sessions (token_sha256, account_id) VALUES (%s, %s)", (token_hash(token), row[0]))
            result = profile(db, row[0])
    except (Error, OSError) as error:
        unavailable(error)
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=https)
    return result


@router.post("/auth/logout", status_code=204)
def logout(response: Response, hemoforge_session: str | None = Cookie(default=None)):
    if hemoforge_session:
        try:
            with connect() as db:
                db.execute("DELETE FROM account_sessions WHERE token_sha256 = %s", (token_hash(hemoforge_session),))
        except (Error, OSError) as error:
            unavailable(error)
    response.delete_cookie(COOKIE)


@router.get("/auth/me")
def me(id: str = Depends(account_id)):
    try:
        with connect() as db:
            return profile(db, id)
    except (Error, OSError) as error:
        unavailable(error)


@router.put("/account")
def update_profile(body: Profile, id: str = Depends(account_id)):
    try:
        with connect() as db:
            taken = db.execute("SELECT 1 FROM accounts WHERE username = %s AND id <> %s", (body.username, id)).fetchone()
            if taken:
                raise HTTPException(status_code=409, detail="That username is taken.")
            db.execute("UPDATE accounts SET username = %(username)s, name = %(name)s, email = %(email)s,"
                       " company = %(company)s, role = %(role)s WHERE id = %(id)s", {**body.model_dump(), "id": id})
            return profile(db, id)
    except (Error, OSError) as error:
        unavailable(error)


@router.put("/account/password", status_code=204)
def change_password(body: PasswordChange, id: str = Depends(account_id)):
    try:
        with connect() as db:
            stored = db.execute("SELECT password_hash FROM accounts WHERE id = %s", (id,)).fetchone()[0]
            if not password_matches(body.current, stored):
                raise HTTPException(status_code=403, detail="Current password is wrong.")
            db.execute("UPDATE accounts SET password_hash = %s WHERE id = %s", (hash_password(body.next), id))
    except (Error, OSError) as error:
        unavailable(error)


@router.get("/notifications")
def notifications(id: str = Depends(account_id)):
    try:
        with connect() as db:
            rows = db.execute("SELECT id, message, tone, page, at FROM notifications WHERE account_id = %s"
                              " ORDER BY id DESC LIMIT %s", (id, NOTIFICATION_LIMIT)).fetchall()
    except (Error, OSError) as error:
        unavailable(error)
    return [{"id": row[0], "message": row[1], "tone": row[2], "page": row[3], "at": row[4].isoformat()} for row in rows]


@router.post("/notifications", status_code=201)
def add_notification(body: Notification, id: str = Depends(account_id)):
    try:
        with connect() as db:
            row = db.execute("INSERT INTO notifications (account_id, message, tone, page) VALUES (%s, %s, %s, %s)"
                             " RETURNING id, at", (id, body.message, body.tone, body.page)).fetchone()
            # Keep the newest NOTIFICATION_LIMIT per account.
            db.execute("DELETE FROM notifications WHERE account_id = %(id)s AND id <= (SELECT id FROM notifications"
                       " WHERE account_id = %(id)s ORDER BY id DESC OFFSET %(limit)s LIMIT 1)", {"id": id, "limit": NOTIFICATION_LIMIT})
    except (Error, OSError) as error:
        unavailable(error)
    return {"id": row[0], **body.model_dump(), "at": row[1].isoformat()}


@router.delete("/notifications", status_code=204)
def clear_notifications(id: str = Depends(account_id)):
    try:
        with connect() as db:
            db.execute("DELETE FROM notifications WHERE account_id = %s", (id,))
    except (Error, OSError) as error:
        unavailable(error)


Key = Path(pattern=r"^[a-z0-9-]{1,64}$")


@router.get("/account/state")
def state(id: str = Depends(account_id)):
    try:
        with connect() as db:
            rows = db.execute("SELECT key, value_json FROM account_state WHERE account_id = %s", (id,)).fetchall()
    except (Error, OSError) as error:
        unavailable(error)
    return dict(rows)


@router.put("/account/state/{key}", status_code=204)
def save_state(key: str = Key, value: Any = Body(), id: str = Depends(account_id)):
    if len(json.dumps(value)) > 64_000:
        raise HTTPException(status_code=413, detail="State value is too large.")
    try:
        with connect() as db:
            db.execute("INSERT INTO account_state VALUES (%s, %s, %s::jsonb) ON CONFLICT (account_id, key)"
                       " DO UPDATE SET value_json = excluded.value_json", (id, key, json.dumps(value)))
    except (Error, OSError) as error:
        unavailable(error)
