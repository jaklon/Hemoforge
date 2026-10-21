"""Optional offline Chroma retrieval, with Ollama embeddings and explicit source manifests.

No embedding model is auto-downloaded by Chroma. The empty repository corpus is not literature.
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path

import httpx

from backend.agent_config import get_settings
from backend.agent_llm import headers
from backend.agent_store import fingerprint


def chroma_client(settings):
    import chromadb
    from chromadb.config import Settings
    return chromadb.PersistentClient(path=settings.rag_path, settings=Settings(anonymized_telemetry=False))


def embed(settings, texts):
    with httpx.Client(timeout=httpx.Timeout(settings.timeout_seconds, connect=5), headers=headers(settings), trust_env=False) as client:
        response = client.post(settings.ollama_url + "/api/embed", json={"model": settings.embedding_model,
                               "input": texts, "truncate": False, "keep_alive": "0"})
        response.raise_for_status()
        vectors = response.json()["embeddings"]
    if len(vectors) != len(texts) or not vectors or not vectors[0] or any(
        len(v) != len(vectors[0]) or any(not math.isfinite(n) for n in v) for v in vectors
    ):
        raise ValueError("Embedding service returned invalid vectors.")
    return vectors


def embedding_identity(settings):
    with httpx.Client(timeout=5, headers=headers(settings), trust_env=False) as client:
        response = client.get(settings.ollama_url + "/api/tags")
        response.raise_for_status()
    for model in response.json()["models"]:
        if model.get("name") in {settings.embedding_model, settings.embedding_model + ":latest"}:
            return model["digest"]
    raise ValueError("Embedding model is not installed.")


def ingest(settings, manifest_path):
    root = Path(settings.corpus_path).resolve()
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8-sig"))
    if not isinstance(manifest, list) or not 1 <= len(manifest) <= 100:
        raise ValueError("Manifest must contain one to one hundred documents.")
    records = []
    for entry in manifest:
        path = (root / entry["path"]).resolve()
        if not path.is_relative_to(root) or path.suffix.lower() not in {".txt", ".md"}:
            raise ValueError("Corpus documents must be TXT/Markdown files inside the configured corpus directory.")
        content = path.read_bytes()
        if not content or len(content) > 1024 * 1024:
            raise ValueError("Use non-empty documents up to one MB.")
        digest = hashlib.sha256(content).hexdigest()
        if entry.get("sha256") != digest:
            raise ValueError("Document SHA-256 does not match the reviewed manifest.")
        if not all(isinstance(entry.get(key), str) and 1 <= len(entry[key]) <= 300 for key in ["title", "study_id", "reference"]):
            raise ValueError("Each document requires title, study_id, and reference metadata.")
        text = content.decode("utf-8-sig")
        if not text.isascii():
            # Unicode typography is allowed; no language inference or scientific validation is claimed.
            text = text.replace("\u00a0", " ")
        for start in range(0, len(text), 700):
            chunk = text[start:start + 900].strip()
            if chunk:
                records.append({"id": fingerprint({"hash": digest, "offset": start}), "text": chunk,
                                "metadata": {"title": entry["title"], "study_id": entry["study_id"],
                                             "reference": entry["reference"], "sha256": digest, "offset": start}})
    if not 1 <= len(records) <= 2000:
        raise ValueError("Use one to two thousand document chunks per index.")
    identity = embedding_identity(settings)
    name = "hemobot-" + fingerprint({"records": records, "embedding": identity})[:24]
    client = chroma_client(settings)
    collection = client.get_or_create_collection(name=name, embedding_function=None, metadata={"hnsw:space": "cosine"})
    for start in range(0, len(records), 16):
        batch = records[start:start + 16]
        collection.upsert(ids=[r["id"] for r in batch], documents=[r["text"] for r in batch],
                          metadatas=[r["metadata"] for r in batch], embeddings=embed(settings, [r["text"] for r in batch]))
    descriptor = {"collection": name, "embedding_model": settings.embedding_model,
                  "embedding_digest": identity, "chunk_count": len(records)}
    target = Path(settings.rag_path) / "index.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(descriptor), encoding="utf-8")
    os.replace(temporary, target)
    return descriptor


def retrieve(settings, query):
    if not settings.rag_enabled:
        return "disabled", []
    descriptor_path = Path(settings.rag_path) / "index.json"
    if not descriptor_path.is_file():
        return "no_corpus", []
    descriptor = json.loads(descriptor_path.read_text(encoding="utf-8"))
    if descriptor["embedding_model"] != settings.embedding_model or descriptor["embedding_digest"] != embedding_identity(settings):
        raise ValueError("Embedding model changed; reindex the reviewed corpus.")
    collection = chroma_client(settings).get_collection(descriptor["collection"], embedding_function=None)
    response = collection.query(query_embeddings=embed(settings, [query]), n_results=min(3, descriptor["chunk_count"]),
                                include=["documents", "metadatas", "distances"])
    excerpts = []
    for index, id in enumerate(response["ids"][0]):
        distance = response["distances"][0][index]
        if distance > 0.55:
            continue
        excerpts.append({"citation_id": "literature-" + id, "excerpt": response["documents"][0][index],
                         "distance": distance, **response["metadatas"][0][index]})
    return "retrieved" if excerpts else "no_relevant_documents", excerpts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Index reviewed English literature for HemoBot.")
    parser.add_argument("manifest", help="Path to the reviewed JSON manifest")
    args = parser.parse_args()
    print(json.dumps(ingest(get_settings(), args.manifest), indent=2))
