"""Authenticated, bounded Ollama gateway. Model administration is never proxied."""

import asyncio
import hmac
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from backend.http_limits import BodyLimitMiddleware

CHAT_MODEL = os.environ.get("HEMOBOT_MODEL", "hf.co/aaditya/OpenBioLLM-Llama3-8B-GGUF:Q4_K_M")
EMBED_MODEL = os.environ.get("HEMOBOT_EMBEDDING_MODEL", "nomic-embed-text")
OLLAMA = os.environ.get("OLLAMA_INTERNAL_URL", "http://ollama:11434")
TOKEN_FILE = os.environ.get("HEMOBOT_GATEWAY_TOKEN_FILE", "/run/secrets/ollama_token")


@asynccontextmanager
async def lifespan(app):
    token = Path(TOKEN_FILE).read_text().strip()
    if len(token) < 32:
        raise RuntimeError("Configure a gateway secret of at least 32 characters.")
    app.state.gateway_token = token
    app.state.inference_slot = asyncio.Semaphore(1)
    async with httpx.AsyncClient(timeout=httpx.Timeout(150, connect=5), trust_env=False) as client:
        app.state.client = client
        yield


app = FastAPI(title="HemoBot model gateway", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(BodyLimitMiddleware, max_bytes=128 * 1024)


def authorize(request):
    supplied = request.headers.get("authorization", "")
    expected = "Bearer " + request.app.state.gateway_token
    if not hmac.compare_digest(supplied.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Authentication required.", headers={"WWW-Authenticate": "Bearer"})


@app.get("/health")
async def health(request: Request):
    try:
        response = await request.app.state.client.get(OLLAMA + "/api/tags", timeout=3)
        response.raise_for_status()
        names = {m["name"] for m in response.json()["models"]}
        if CHAT_MODEL not in names or not {EMBED_MODEL, EMBED_MODEL + ":latest"} & names:
            return JSONResponse({"status": "models_missing"}, status_code=503)
    except (httpx.HTTPError, ValueError, KeyError):
        return JSONResponse({"status": "unavailable"}, status_code=503)
    return {"status": "ok"}


@app.get("/api/tags")
async def tags(request: Request):
    authorize(request)
    try:
        response = await request.app.state.client.get(OLLAMA + "/api/tags", timeout=5)
        response.raise_for_status()
        models = response.json()["models"]
        return {"models": [m for m in models if m.get("name") in {CHAT_MODEL, EMBED_MODEL, EMBED_MODEL + ":latest"}]}
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise HTTPException(503, "Model service unavailable.") from error


@app.post("/api/{operation}")
async def inference(operation: str, request: Request):
    authorize(request)
    if operation not in {"chat", "embed"}:
        raise HTTPException(404, "Route not available.")
    try:
        body = await request.json()
    except (ValueError, UnicodeError) as error:
        raise HTTPException(422, "Use a JSON object.") from error
    if not isinstance(body, dict):
        raise HTTPException(422, "Use a JSON object.")
    model = CHAT_MODEL if operation == "chat" else EMBED_MODEL
    if body.get("model") != model:
        raise HTTPException(422, "Model is not allowed.")
    if operation == "chat":
        if body.get("stream") is not False or not isinstance(body.get("messages"), list) or not 1 <= len(body["messages"]) <= 4:
            raise HTTPException(422, "Use bounded non-streaming messages.")
        if any(not isinstance(m, dict) or set(m) != {"role", "content"} or m["role"] not in {"system", "user"}
               or not isinstance(m["content"], str) for m in body["messages"]):
            raise HTTPException(422, "Only system/user text messages are supported.")
        if len(json.dumps(body["messages"]).encode()) > 18000:
            raise HTTPException(422, "Prompt exceeds the model context budget.")
        if not isinstance(body.get("format"), dict):
            raise HTTPException(422, "A bounded structured output schema is required.")
        # Callers cannot request arbitrary token budgets, GPU allocation, tool execution, or model loads.
        outgoing = {"model": model, "messages": body["messages"], "format": body["format"], "stream": False,
                    "keep_alive": "10m", "options": {"temperature": 0, "seed": 42, "num_ctx": 8192,
                                                        "num_predict": 384, "num_thread": 8, "num_gpu": 0}}
    else:
        texts = body.get("input")
        if isinstance(texts, str):
            texts = [texts]
        if not isinstance(texts, list) or not 1 <= len(texts) <= 16 or any(not isinstance(t, str) or len(t) > 1600 for t in texts):
            raise HTTPException(422, "Use one to sixteen short embedding texts.")
        outgoing = {"model": model, "input": texts, "truncate": False, "keep_alive": "0", "options": {"num_thread": 8, "num_gpu": 0}}
    try:
        await asyncio.wait_for(request.app.state.inference_slot.acquire(), timeout=0.1)
    except TimeoutError as error:
        raise HTTPException(429, "Model is busy. Retry later.") from error
    try:
        response = await request.app.state.client.post(OLLAMA + "/api/" + operation, json=outgoing)
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(503, "Model inference unavailable or timed out.") from error
    finally:
        request.app.state.inference_slot.release()
