"""Server-side configuration. Credentials and host addresses never reach the browser."""

import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, field_validator

from backend.models import InputModel

ROOT = Path(__file__).resolve().parents[1]


class AgentSettings(InputModel):
    mode: str = "auto"
    # "llamacpp" speaks llama-server's OpenAI-compatible API (e.g. http://127.0.0.1:8082).
    provider: str = "ollama"
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "hf.co/aaditya/OpenBioLLM-Llama3-8B-GGUF:Q4_K_M"
    ollama_token: str = Field(default="", max_length=2048, repr=False)
    ollama_token_file: str = ""
    timeout_seconds: float = Field(default=120, ge=1, le=300)
    num_thread: int = Field(default=8, ge=1, le=64)
    num_ctx: int = Field(default=8192, ge=4096, le=8192)
    database_path: str = str(ROOT / "data" / "hemobot.sqlite3")
    rag_enabled: bool = False
    rag_path: str = str(ROOT / "data" / "chroma")
    embedding_model: str = "nomic-embed-text"
    corpus_path: str = str(ROOT / "knowledge" / "corpus")

    @field_validator("ollama_url")
    @classmethod
    def valid_url(cls, value):
        url = urlsplit(value)
        if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError("Use an HTTP(S) Ollama base URL without embedded credentials.")
        return value.rstrip("/")

    @field_validator("provider")
    @classmethod
    def valid_provider(cls, value):
        if value not in {"ollama", "llamacpp"}:
            raise ValueError("Provider must be ollama or llamacpp.")
        return value

    @field_validator("mode")
    @classmethod
    def valid_mode(cls, value):
        if value not in {"auto", "template"}:
            raise ValueError("Mode must be auto or template.")
        return value


def get_settings():
    path = Path(os.environ.get("HEMOBOT_CONFIG", str(ROOT / "hemobot.local.json")))
    values = json.loads(path.read_text(encoding="utf-8-sig")) if path.is_file() else {}
    for name in AgentSettings.model_fields:
        value = os.environ.get("HEMOBOT_" + name.upper())
        if value is not None:
            values[name] = value
    if values.get("ollama_token_file"):
        values["ollama_token"] = Path(values["ollama_token_file"]).read_text(encoding="utf-8").strip()
    return AgentSettings(**values)
