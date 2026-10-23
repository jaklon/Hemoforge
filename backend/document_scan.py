"""Images and PDFs a researcher queues for AI conversion into a data table.

The configured LLM reads text only, so no model is called yet: uploads are checked and
the endpoint answers 503 until a vision model is wired into convert().
"""

import base64
import binascii
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api", tags=["Document scan"])

# Raw bytes; base64 adds a third, which still fits the 8 MB request body limit.
MAX_TOTAL_BYTES = 6 * 1024 * 1024

# File signatures, so a renamed file cannot pass as an image or PDF.
SIGNATURES = {
    "application/pdf": [b"%PDF-"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/webp": [b"RIFF"],
}


class ScanFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    type: Literal["application/pdf", "image/png", "image/jpeg", "image/webp"]
    data: str = Field(min_length=1)


class ScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["culture", "experiments", "markers"]
    files: list[ScanFile] = Field(min_length=1, max_length=20)


def decode(files):
    decoded, total = [], 0
    for file in files:
        try:
            content = base64.b64decode(file.data, validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(status_code=422, detail=f"{file.name}: not valid base64.") from error
        if not any(content.startswith(magic) for magic in SIGNATURES[file.type]):
            raise HTTPException(status_code=422, detail=f"{file.name}: content does not match {file.type}.")
        if file.type == "image/webp" and content[8:12] != b"WEBP":
            raise HTTPException(status_code=422, detail=f"{file.name}: content does not match image/webp.")
        total += len(content)
        if total > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=413, detail="Files exceed 6 MB in total. Convert them in smaller batches.")
        decoded.append((file.name, file.type, content))
    return decoded


def convert(kind, files):
    """Return the extracted table as CSV text for the given data type."""
    raise HTTPException(
        status_code=503,
        detail="No vision model is configured for document scanning yet. Your files were checked but not sent to any AI.",
    )


@router.post("/documents/convert")
def convert_documents(request: ScanRequest):
    return {"kind": request.kind, "csv": convert(request.kind, decode(request.files))}
