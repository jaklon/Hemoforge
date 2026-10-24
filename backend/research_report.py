"""Analysis report stationery with a server-generated date and manual signatures."""

import os
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal
from uuid import uuid4
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field, model_validator
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from backend.accounts import account_id, unavailable
from backend.db import Error, connect
from backend.models import InputModel

router = APIRouter(prefix="/api/reports", tags=["Research reports"])


class ReportWarning(InputModel):
    id: str = Field(max_length=240)
    hour: float = Field(ge=0, le=100_000)
    variable: str = Field(max_length=120)
    value: float | None
    rule: str = Field(max_length=240)
    reason: str = Field(max_length=2000)
    status: Literal["warning", "needs_review"]


class ReportWindow(InputModel):
    from_hour: float = Field(ge=0, le=100_000)
    through_hour: float = Field(ge=0, le=100_000)


class CheckpointSnapshot(InputModel):
    generated_at: datetime
    checkpoint_hour: float = Field(ge=0, le=100_000)
    data_window: ReportWindow
    batch_id: str = Field(min_length=1, max_length=240)
    dataset_id: str = Field(max_length=240)
    quality_flag: Literal["software_test_only", "user_supplied"]
    source_name: str = Field(max_length=255)
    source_sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")
    last_measurement_hour: float | None = Field(ge=0, le=100_000)
    last_count: float | None
    change_since_previous: float | None
    new_measurements: int = Field(ge=0, le=10_000)
    status: Literal["normal", "warning", "needs_review"]
    open_warnings: list[ReportWarning] = Field(max_length=1000)
    summary: str = Field(max_length=5000)
    recommendation: str = Field(max_length=5000)

    @model_validator(mode="after")
    def checkpoint_timing(self):
        if not self.data_window.from_hour <= self.data_window.through_hour == self.checkpoint_hour:
            raise ValueError("The data window must end at the selected checkpoint.")
        if self.last_measurement_hour is not None and self.last_measurement_hour > self.checkpoint_hour:
            raise ValueError("A report cannot include future measurements.")
        if any(warning.hour > self.checkpoint_hour for warning in self.open_warnings):
            raise ValueError("A report cannot include future warnings.")
        return self


class ResearchReportRequest(InputModel):
    report: CheckpointSnapshot
    researcher: str = Field(default="", max_length=120)
    supervisor: str = Field(default="", max_length=120)
    institution: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=5000)
    source_added_at: datetime | None = None


# Embed installed Times New Roman; do not substitute a different serif font.
font_directories = [
    Path(os.environ.get("HEMOFORGE_REPORT_FONT_DIR", "backend/fonts")),
    Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts",
    Path("/usr/share/fonts/truetype/msttcorefonts"),
    Path("/usr/share/fonts/TTF"),
]
font_dir = next((directory for directory in font_directories
                 if all((directory / name).is_file() for name in ("times.ttf", "timesbd.ttf"))), None)
if font_dir is not None:
    pdfmetrics.registerFont(TTFont("ReportBody", str(font_dir / "times.ttf")))
    pdfmetrics.registerFont(TTFont("ReportBold", str(font_dir / "timesbd.ttf")))
    pdfmetrics.registerFontFamily("ReportBody", normal="ReportBody", bold="ReportBold")


def render_report(request: ResearchReportRequest, number: str, created: datetime) -> bytes:
    if font_dir is None:
        raise HTTPException(status_code=503, detail="Times New Roman is not installed on the report server. "
                            "Install Microsoft core fonts or set HEMOFORGE_REPORT_FONT_DIR, then restart the API.")
    output = BytesIO()
    margin = 72
    page_width, page_height = A4
    width = page_width - 2 * margin
    body = ParagraphStyle("body", fontName="ReportBody", fontSize=12, leading=18, textColor=colors.black,
                          alignment=TA_LEFT, splitLongWords=True)
    centered = ParagraphStyle("centered", parent=body, alignment=TA_CENTER)
    title = ParagraphStyle("title", parent=centered, fontName="ReportBold")
    issuer = ParagraphStyle("issuer", parent=body, alignment=TA_RIGHT)
    issuer_heading = ParagraphStyle("issuer_heading", parent=issuer, fontName="ReportBold")
    canvas = Canvas(output, pagesize=A4)
    canvas.setTitle(f"HemoForge Analysis Report {number}")
    canvas.setAuthor(request.researcher)
    canvas.setSubject(f"Report template / {request.report.batch_id}")

    def paragraph(value, style=body):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), style)

    def draw(value, x, top, available_width, style=body):
        text = paragraph(value, style)
        _, height = text.wrap(available_width, page_height)
        text.drawOn(canvas, x, top - height)
        return height

    # The date is static page text supplied by the export endpoint, never a form field.
    stamp = created.astimezone(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    metadata_top = page_height - margin
    metadata_height = draw(f"Report number: {number}\nDate: {stamp}", margin, metadata_top, width * 0.67)
    issuer_width = width * 0.45
    issuer_x = page_width - margin - issuer_width
    issuer_top = metadata_top - max(metadata_height, 36) - 9
    issuer_height = draw("Issuing institution", issuer_x, issuer_top, issuer_width, issuer_heading)
    issuer_height += draw(request.institution.strip() or "[Institution / laboratory]", issuer_x,
                          issuer_top - issuer_height, issuer_width, issuer)
    title_top = issuer_top - issuer_height - 18
    draw("ANALYSIS REPORT", margin, title_top, width, title)

    column_width = width / 2
    name_width = column_width - 24
    names = [request.researcher.strip() or "[Researcher name]", request.supervisor.strip() or "[Supervisor name]"]
    name_height = max(paragraph(name, centered).wrap(name_width, page_height)[1] for name in names)
    signature_y = margin + name_height + 24
    signature_top = signature_y + 78
    draw("[Report content placeholder]", margin, (title_top - 18 + signature_top) / 2, width, centered)

    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(0.5)
    for index, (role, name) in enumerate(zip(("Researcher", "Supervisor"), names)):
        center = margin + column_width * (index + 0.5)
        draw(role, center - name_width / 2, signature_top, name_width, title)
        canvas.line(center - 90, signature_y, center + 90, signature_y)
        draw(name, center - name_width / 2, signature_y - 6, name_width, centered)

    canvas.setFont("ReportBody", 12, leading=18)
    canvas.drawString(margin, 36, number)
    canvas.drawRightString(page_width - margin, 36, "Page 1")
    canvas.showPage()
    canvas.save()
    return output.getvalue()


def save_report(account: str, number: str, created: datetime, request: ResearchReportRequest, pdf: bytes):
    """Keep the exported report; the download fails rather than hand out a report the database lacks."""
    try:
        with connect() as db:
            db.execute("INSERT INTO reports (number, account_id, created_at, batch_id, checkpoint_hour, request_json, pdf)"
                       " VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)",
                       (number, account, created, request.report.batch_id, request.report.checkpoint_hour,
                        request.model_dump_json(), pdf))
    except (Error, OSError) as error:
        unavailable(error)


@router.post("/checkpoint.pdf")
def checkpoint_pdf(request: ResearchReportRequest, account: str = Depends(account_id)):
    created = datetime.now(timezone.utc)
    number = f"HF-RPT-{created:%Y%m%d}-{uuid4().hex[:12].upper()}"
    pdf = render_report(request, number, created)
    save_report(account, number, created, request, pdf)
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{number}.pdf"',
        "Cache-Control": "no-store",
    })
