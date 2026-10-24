"""Formal analysis reports: stored per account, rendered as signed PDFs with a server-generated date."""

import json
import os
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Literal
from uuid import uuid4
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, ValidationError
from reportlab.graphics.charts.lineplots import LinePlot
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.widgets.markers import makeMarker
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from backend.accounts import account_id, unavailable
from backend.agent_store import AuditStore
from backend.db import Error, connect
from backend.models import InputModel

names = {"guard": "Bioreactor Guard", "pilot": "ErythroPilot", "plan": "CulturePlan", "match": "RareMatch"}
status_labels = {"normal": "Normal", "warning": "Warning", "needs_review": "Needs review", "action": "Action taken"}

router = APIRouter(prefix="/api/reports", tags=["Research reports"])


Status = Literal["normal", "warning", "needs_review", "action"]


class AutomatedAction(InputModel):
    """One automated correction the Dashboard applied when a variable crossed its action limit."""
    batch_id: str = Field(min_length=1, max_length=240)
    hour: float = Field(ge=0, le=100_000)
    variable: str = Field(min_length=1, max_length=120)
    unit: str = Field(max_length=40)
    side: Literal["low", "high"]
    limit: float
    # The warning limit on the same side, when one is configured.
    warning: float | None = None
    action: str = Field(min_length=1, max_length=240)
    before: float
    after: float
    digits: int = Field(default=2, ge=0, le=6)
    # True when the value came from batch data rather than the Dashboard simulation.
    measured: bool = False
    # (hour, value) trajectory around the event, for the report's figure.
    points: list[tuple[float, float]] = Field(default_factory=list, max_length=500)


class AutomatedReports(InputModel):
    actions: list[AutomatedAction] = Field(max_length=2000)


class HemoBotReport(InputModel):
    response_id: str = Field(min_length=40, max_length=40, pattern=r"^hemobot-")


class SignOff(InputModel):
    """Names the account prints under the signature lines of every report."""
    researcher: str = Field(default="", max_length=120)
    supervisor: str = Field(default="", max_length=120)


class Signatories(SignOff):
    # The account's company, from its profile.
    institution: str = ""


class Section(BaseModel):
    heading: str
    paragraphs: list[str]


class Chart(BaseModel):
    caption: str
    y_label: str
    points: list[tuple[float, float]]
    # Horizontal reference lines, e.g. warning and action limits.
    limits: list[tuple[str, float]] = []
    marker: float | None = None


class Report(BaseModel):
    number: str
    created_at: datetime
    kind: Literal["automated", "hemobot"]
    source: str
    batch_id: str
    hour: float | None
    status: Status
    title: str
    summary: str
    # Key figures, shown as a short list.
    lines: list[str]
    sections: list[Section] = []
    chart: Chart | None = None


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


def figure(chart: Chart, width: float) -> Drawing:
    """Line chart of the trajectory, dashed reference lines for limits, and a vertical event marker."""
    height = 220
    drawing = Drawing(width, height)
    xs = [x for x, _ in chart.points]
    ys = [y for _, y in chart.points] + [value for _, value in chart.limits]
    low, high = min(ys), max(ys)
    pad = (high - low) * 0.12 or abs(high) * 0.1 or 1
    low, high = low - pad, high + pad
    start, end = min(xs), max(xs)
    if start == end:
        start, end = start - 1, end + 1
    plot = LinePlot()
    plot.x, plot.y, plot.width, plot.height = 48, 36, width - 64, height - 54
    series = [list(chart.points)] + [[(start, value), (end, value)] for _, value in chart.limits]
    if chart.marker is not None:
        series.append([(chart.marker, low), (chart.marker, high)])
    plot.data = series
    plot.lines[0].strokeColor = colors.black
    plot.lines[0].strokeWidth = 1.2
    if len(chart.points) <= 60:
        plot.lines[0].symbol = makeMarker("FilledCircle", size=2.5)
    for index in range(1, len(series)):
        plot.lines[index].strokeColor = colors.HexColor("#8a1c24") if index <= len(chart.limits) else colors.grey
        plot.lines[index].strokeWidth = 0.7
        plot.lines[index].strokeDashArray = [4, 3] if index <= len(chart.limits) else [1, 2]
    for axis in (plot.xValueAxis, plot.yValueAxis):
        axis.labels.fontName = "ReportBody"
        axis.labels.fontSize = 9
        axis.strokeWidth = 0.5
    plot.xValueAxis.valueMin, plot.xValueAxis.valueMax = start, end
    plot.yValueAxis.valueMin, plot.yValueAxis.valueMax = low, high
    plot.xValueAxis.labelTextFormat = "%gh"
    plot.yValueAxis.labelTextFormat = "%.4g"
    drawing.add(plot)
    drawing.add(String(4, height - 10, chart.y_label, fontName="ReportBody", fontSize=9))
    drawing.add(String(width / 2, 4, "Culture time (h)", fontName="ReportBody", fontSize=9, textAnchor="middle"))
    for label, value in chart.limits:
        y = plot.y + plot.height * (value - low) / (high - low)
        drawing.add(String(plot.x + 4, y + 2, label, fontName="ReportBody", fontSize=8,
                           fillColor=colors.HexColor("#8a1c24")))
    return drawing


def render_report(report: Report, people: Signatories) -> bytes:
    if font_dir is None:
        raise HTTPException(status_code=503, detail="Times New Roman is not installed on the report server. "
                            "Install Microsoft core fonts or set HEMOFORGE_REPORT_FONT_DIR, then restart the API.")
    output = BytesIO()
    margin = 72
    width = A4[0] - 2 * margin
    body = ParagraphStyle("body", fontName="ReportBody", fontSize=12, leading=18, alignment=TA_JUSTIFY,
                          splitLongWords=True, spaceAfter=8)
    small = ParagraphStyle("small", parent=body, fontSize=10, leading=14, alignment=TA_CENTER, spaceAfter=0)
    caption = ParagraphStyle("caption", parent=small, fontSize=10, spaceBefore=4, spaceAfter=12)
    cell = ParagraphStyle("cell", parent=body, fontSize=11, leading=15, alignment=0, spaceAfter=0)
    cell_bold = ParagraphStyle("cell_bold", parent=cell, fontName="ReportBold")
    centered = ParagraphStyle("centered", parent=body, alignment=TA_CENTER, spaceAfter=0)
    title = ParagraphStyle("title", parent=centered, fontName="ReportBold", fontSize=14, leading=20)
    heading = ParagraphStyle("heading", parent=body, fontName="ReportBold", spaceBefore=10, spaceAfter=6)
    right = ParagraphStyle("right", parent=cell, alignment=TA_RIGHT)

    def text(value, style=body):
        return Paragraph(escape(str(value)).replace("\n", "<br/>"), style)

    # The date is when the report was created, stored by the server, never a form field.
    stamp = report.created_at.astimezone(timezone.utc).strftime("%d %B %Y, %H:%M UTC")
    institution = people.institution.strip() or "[Institution / laboratory]"
    story = [
        Table([[text(f"Report number: {report.number}\nDate: {stamp}", cell),
                Paragraph(f"<b>Issuing institution</b><br/>{escape(institution)}", right)]],
              colWidths=[width * 0.55, width * 0.45],
              style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                     ("RIGHTPADDING", (0, 0), (-1, -1), 0)]),
        Spacer(0, 24), text("ANALYSIS REPORT", title), Spacer(0, 4), text(report.title, centered), Spacer(0, 18),
    ]
    kind = "Automated control action" if report.kind == "automated" else "HemoBot research analysis"
    details = [("Report type", kind), ("Source", report.source), ("Batch", report.batch_id or "—"),
               ("Culture time", "—" if report.hour is None else f"{report.hour:g} h"),
               ("Status", status_labels.get(report.status, report.status)), ("Prepared", stamp)]
    story.append(Table([[text(label, cell_bold), text(value, cell)] for label, value in details],
                       colWidths=[width * 0.3, width * 0.7],
                       style=TableStyle([("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                                         ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f2f2f2")),
                                         ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                         ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)])))
    story += [Spacer(0, 14), text("Summary", heading), text(report.summary)]

    sections = report.sections or [Section(heading="Details", paragraphs=[f"• {line}" for line in report.lines])]
    for index, section in enumerate(sections, start=1):
        story.append(text(f"{index}. {section.heading}", heading))
        story += [text(paragraph) for paragraph in section.paragraphs]
        # The figure follows the second section (the observation, or the executive summary).
        if index == min(2, len(sections)) and report.chart and report.chart.points:
            story.append(KeepTogether([Spacer(0, 6), figure(report.chart, width), text(report.chart.caption, caption)]))

    names_ = [people.researcher.strip() or "[Researcher name]", people.supervisor.strip() or "[Supervisor name]"]
    bold_centered = ParagraphStyle("bold_centered", parent=centered, fontName="ReportBold")
    # A gap column keeps the two signature lines apart.
    column = (width - 36) / 2
    signature = Table(
        [[text("Prepared by (Researcher)", bold_centered), "", text("Reviewed by (Supervisor)", bold_centered)],
         ["", "", ""],
         [text(names_[0], centered), "", text(names_[1], centered)],
         [text("Date: ____________________", small), "", text("Date: ____________________", small)]],
        colWidths=[column, 36, column], rowHeights=[None, 54, None, 24],
        style=TableStyle([("LINEBELOW", (0, 1), (0, 1), 0.5, colors.black),
                          ("LINEBELOW", (2, 1), (2, 1), 0.5, colors.black),
                          ("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    story.append(KeepTogether([
        text(f"{len(sections) + 1}. Review and approval", heading),
        text("By signing below, the researcher confirms that this report reflects the recorded data, and the "
             "supervisor confirms that the report has been reviewed. Signatures apply to the printed copy."),
        Spacer(0, 12), signature]))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("ReportBody", 10)
        canvas.drawString(margin, 36, report.number)
        canvas.drawRightString(A4[0] - margin, 36, f"Page {document.page}")
        canvas.setLineWidth(0.5)
        canvas.line(margin, 50, A4[0] - margin, 50)
        canvas.restoreState()

    document = SimpleDocTemplate(output, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=margin,
                                 bottomMargin=margin, title=f"HemoForge Analysis Report {report.number}",
                                 author=people.researcher, subject=f"{report.title} / {report.batch_id}")
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return output.getvalue()


def automated_content(item: AutomatedAction):
    """Summary, key figures, sections and chart for one automated correction."""
    d = item.digits
    unit = f" {item.unit}" if item.unit else ""
    value, after, limit = f"{item.before:.{d}f}{unit}", f"{item.after:.{d}f}{unit}", f"{item.limit:.{d}f}{unit}"
    warning = None if item.warning is None else f"{item.warning:.{d}f}{unit}"
    moved = "decreased" if item.side == "low" else "increased"
    hour = f"{item.hour:g} h"
    summary = (f"At {hour} of culture, {item.variable} {moved} to {value}, reaching the {item.side} action limit of "
               f"{limit}. The Dashboard's automated control applied {item.action}, after which {item.variable} was "
               f"{after}. This report documents the event for review and sign-off.")
    origin = ("The value was taken from the batch measurement data." if item.measured else
              "The value comes from the Dashboard's process simulation, not from a direct measurement of the vessel.")
    observation = (f"At {hour}, {item.variable} was recorded at {value}. The configured {item.side} action limit for "
                   f"this variable is {limit}" + (f", with a {item.side} warning limit of {warning}" if warning else "")
                   + ". The value had therefore reached the threshold at which the control strategy requires an "
                   "intervention. " + origin)
    change = item.after - item.before
    action = (f"In response, the automated controller applied {item.action}. Immediately after the correction, "
              f"{item.variable} was {after}, a change of {change:+.{d}f}{unit}. After acting, the controller waits a "
              "fixed interval before it may act on the same variable again, so that a single excursion does not "
              "trigger repeated corrections.")
    later = [(x, y) for x, y in item.points if x > item.hour]
    if later:
        end_hour, end_value = later[-1]
        bound = item.warning if item.warning is not None else item.limit
        inside = end_value > bound if item.side == "low" else end_value < bound
        assessment = (f"By {end_hour:g} h, the latest time available when this report was prepared, {item.variable} "
                      f"was {end_value:.{d}f}{unit}. This is {'within' if inside else 'still outside'} the "
                      f"{'warning' if item.warning is not None else 'action'} limit of "
                      f"{bound:.{d}f}{unit}, which indicates that the intervention "
                      f"{'restored the variable to its acceptable range' if inside else 'has not yet fully restored the variable, and further review is warranted'}.")
    else:
        assessment = ("No values after the correction were available when this report was prepared. The effect of the "
                      "intervention should be confirmed from subsequent data before the report is approved.")
    sections = [
        Section(heading="Purpose", paragraphs=[
            f"This report documents an automated process-control intervention recorded by the HemoForge Dashboard for "
            f"batch {item.batch_id}. A report of this kind is created whenever a monitored process variable reaches a "
            "configured action limit, so that every intervention has a reviewable and signed record."]),
        Section(heading="Observation", paragraphs=[observation]),
        Section(heading="Action taken", paragraphs=[action]),
        Section(heading="Assessment", paragraphs=[assessment]),
        Section(heading="Recommendation", paragraphs=[
            "The responsible researcher should confirm that the intervention was carried out as recorded, check the "
            "probe or assay that reported the value, and consider whether the action limit and the size of the "
            "correction remain appropriate for this culture. Any deviation from the expected process should be "
            "documented in the batch record."]),
        Section(heading="Limitations", paragraphs=[
            "Automated actions follow fixed rules and do not assess cell health, viability or product quality. "
            + origin + " This report does not replace review by qualified personnel."]),
    ]
    limits = [(f"{item.side.capitalize()} action limit", item.limit)]
    if item.warning is not None:
        limits.append((f"{item.side.capitalize()} warning limit", item.warning))
    chart = Chart(caption=f"Figure 1. {item.variable}{f' ({item.unit})' if item.unit else ''} for batch "
                          f"{item.batch_id}. Dashed lines mark the configured limits; the dotted line marks the "
                          f"intervention at {hour}.",
                  y_label=f"{item.variable}{f' ({item.unit})' if item.unit else ''}",
                  points=sorted(item.points), limits=limits, marker=item.hour) if item.points else None
    lines = [f"Value at intervention: {value}", f"{item.side.capitalize()} action limit: {limit}",
             f"Correction: {value} → {after}"]
    return summary, lines, sections, chart


def hemobot_content(bundle: dict, counts: list[tuple[float, float]]):
    analysis, context, request = bundle["analysis"], bundle["context"], bundle["request"]
    batch, hour = context.get("batch_id", ""), context.get("replay_elapsed_hours")
    modules = ", ".join(names.get(module, module) for module in analysis["active_modules_used"]) or "all modules"
    question = request.get("query_en", "")
    status = analysis["execution_status"]
    headline = analysis["summary_headline"].rstrip(".")
    summary = (f"{headline}. This analysis of batch {batch} at {hour:g} h of culture covered "
               f"{modules} and was prepared in response to the question: “{question}”") if hour is not None else (
        f"{headline}. Question: “{question}”")
    overview = (f"The analysis was executed with status “{status}”, and the evidence was classified as "
                f"“{analysis['evidence_quality'].replace('_', ' ')}”. Statements in this report are rendered from "
                "evidence computed by the workspace; "
                + ("the language model selected the relevant evidence and review actions." if status == "succeeded"
                   else "no statements authored by the language model are included."))
    if analysis.get("fallback_reason"):
        overview += f" {analysis['fallback_reason']}"
    findings = [f"{card['title']} (status: {card['status'].replace('_', ' ')}). " + " ".join(card["statements"])
                for card in analysis["cards"]] or ["No module produced findings for this question."]
    actions = [f"• {action}" for action in analysis["suggested_actions"]] or ["No review actions were suggested."]
    evidence = [f"{citation['module']}: {citation['reference']} ({citation['study_id']}); evidence classification "
                f"“{citation['evidence'].replace('_', ' ')}”"
                + (f", measured at {citation['measured_at']:g} h." if citation.get("measured_at") is not None else ".")
                for citation in analysis["citations"]] or ["No evidence sources were cited."]
    sections = [
        Section(heading="Purpose", paragraphs=[
            f"This report records an analysis prepared with HemoBot, the workspace's research assistant, for batch "
            f"{batch}. It was saved by the researcher so that the findings and the recommended review actions can be "
            f"examined and signed. The analysis answered the question: “{question}”"]),
        Section(heading="Executive summary", paragraphs=[f"{headline}.", overview]),
        Section(heading="Findings", paragraphs=findings),
        Section(heading="Recommended review actions", paragraphs=actions),
        Section(heading="Evidence and sources", paragraphs=evidence),
        Section(heading="Limitations", paragraphs=analysis["mandatory_scientific_disclaimers"] or [
            "This analysis supports, and does not replace, review by qualified personnel."]),
        Section(heading="Audit record", paragraphs=[
            f"Analysis {analysis['response_id']} was generated on {analysis['generated_at']} using the engine "
            f"“{analysis['llm_engine']}”. Its fingerprint is {analysis['analysis_fingerprint']}, which allows the "
            "analysis to be reconstructed from the stored audit record."]),
    ]
    chart = Chart(caption=f"Figure 1. Cell count for batch {batch} up to the analysis time"
                          f"{f' at {hour:g} h' if hour is not None else ''}.",
                  y_label="Cell count (million cells)", points=counts, marker=hour) if len(counts) > 1 else None
    lines = [f"Modules: {modules}", f"Execution status: {status}",
             f"Review actions: {len(analysis['suggested_actions'])}"]
    return summary, lines, sections, chart


REPORT_COLUMNS = "number, created_at, kind, source, batch_id, hour, status, title, summary, lines, sections, chart"
INSERT_REPORT = (f"INSERT INTO reports (account_id, dedupe_key, {REPORT_COLUMNS})"
                 " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)"
                 " ON CONFLICT (account_id, dedupe_key) DO NOTHING")


def as_report(row):
    values = dict(zip(REPORT_COLUMNS.split(", "), row))
    # Reports saved before sections and charts existed have nulls here.
    values["sections"] = values["sections"] or []
    return Report(**values)


def save(db, account: str, key: str, kind: str, source: str, batch_id: str, hour, status: str, title: str,
         content):
    """Insert one report; an existing report with the same key is kept. Returns whether it was new."""
    summary, lines, sections, chart = content
    created = datetime.now(timezone.utc)
    number = f"HF-RPT-{created:%Y%m%d}-{uuid4().hex[:12].upper()}"
    return db.execute(INSERT_REPORT, (
        account, key, number, created, kind, source, batch_id, hour, status, title, summary, json.dumps(lines),
        json.dumps([section.model_dump() for section in sections]),
        None if chart is None else chart.model_dump_json())).rowcount == 1


@router.get("", response_model=list[Report])
def list_reports(account: str = Depends(account_id)):
    try:
        with connect() as db:
            rows = db.execute(f"SELECT {REPORT_COLUMNS} FROM reports WHERE account_id = %s"
                              " ORDER BY created_at DESC LIMIT 500", (account,)).fetchall()
    except (Error, OSError) as error:
        unavailable(error)
    return [as_report(row) for row in rows]


@router.post("/automated")
def automated_reports(body: AutomatedReports, account: str = Depends(account_id)):
    """Each Dashboard correction becomes one report; sending the same correction again adds nothing."""
    created = 0
    try:
        with connect() as db:
            # Oldest first, so creation order follows the replay.
            for item in sorted(body.actions, key=lambda item: item.hour):
                created += save(
                    db, account, f"auto:{item.batch_id}:{item.variable}:{item.hour:g}:{item.action}", "automated",
                    "Dashboard", item.batch_id, item.hour, "action", f"{item.action} · {item.variable}",
                    automated_content(item))
    except (Error, OSError) as error:
        unavailable(error)
    return {"created": created}


@router.post("/hemobot", response_model=Report)
def hemobot_report(body: HemoBotReport, account: str = Depends(account_id)):
    """Builds the report from the stored analysis and its inputs, so its content is what HemoBot used and produced."""
    key = f"hemobot:{body.response_id}"
    try:
        bundle = AuditStore().get(body.response_id)
        if bundle is None:
            raise HTTPException(status_code=404, detail="Analysis not found.")
        context = bundle["context"]
        hour = context.get("replay_elapsed_hours")
        with connect() as db:
            inputs = db.execute("SELECT w.inputs_json FROM analyses a JOIN workspaces w ON w.id = a.workspace_id"
                                " WHERE a.response_id = %s", (body.response_id,)).fetchone()
            rows = json.loads(inputs[0])["culture"]["rows"] if inputs else []
            # Only data up to the analysis time, matching what HemoBot saw.
            counts = [(row["hour"], row["count"]) for row in rows
                      if row.get("batch_id") == context.get("batch_id") and row.get("count") is not None
                      and (hour is None or row["hour"] <= hour)]
            analysis = bundle["analysis"]
            modules = ", ".join(names.get(module, module) for module in analysis["active_modules_used"])
            warned = any(card["status"] in ("warning", "needs_review") for card in analysis["cards"])
            save(db, account, key, "hemobot", f"HemoBot · {modules or 'All modules'}", context.get("batch_id", ""),
                 hour, "warning" if warned else "normal", analysis["summary_headline"],
                 hemobot_content(bundle, counts[:500]))
            row = db.execute(f"SELECT {REPORT_COLUMNS} FROM reports WHERE account_id = %s AND dedupe_key = %s",
                             (account, key)).fetchone()
    except (Error, OSError) as error:
        unavailable(error)
    return as_report(row)


SIGN_OFF_KEY = "report-signatories"


def signatories(db, account: str) -> Signatories:
    row = db.execute("SELECT a.company, s.value_json FROM accounts a LEFT JOIN account_state s"
                     " ON s.account_id = a.id AND s.key = %s WHERE a.id = %s", (SIGN_OFF_KEY, account)).fetchone()
    try:
        names_ = SignOff.model_validate(row[1] or {}) if row else SignOff()
    except ValidationError:
        # The generic account-state route can write anything under this key.
        names_ = SignOff()
    return Signatories(institution=row[0] if row else "", **names_.model_dump())


@router.get("/signatories", response_model=Signatories)
def get_signatories(account: str = Depends(account_id)):
    try:
        with connect() as db:
            return signatories(db, account)
    except (Error, OSError) as error:
        unavailable(error)


@router.put("/signatories", response_model=Signatories)
def save_signatories(body: SignOff, account: str = Depends(account_id)):
    names_ = SignOff(researcher=body.researcher.strip(), supervisor=body.supervisor.strip())
    try:
        with connect() as db:
            db.execute("INSERT INTO account_state VALUES (%s, %s, %s::jsonb) ON CONFLICT (account_id, key)"
                       " DO UPDATE SET value_json = excluded.value_json", (account, SIGN_OFF_KEY, names_.model_dump_json()))
            return signatories(db, account)
    except (Error, OSError) as error:
        unavailable(error)


@router.get("/{number}/pdf")
def report_pdf(number: str, account: str = Depends(account_id)):
    try:
        with connect() as db:
            row = db.execute(f"SELECT {REPORT_COLUMNS} FROM reports WHERE account_id = %s AND number = %s",
                             (account, number)).fetchone()
            people = signatories(db, account)
    except (Error, OSError) as error:
        unavailable(error)
    if row is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return Response(render_report(as_report(row), people), media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{number}.pdf"',
        "Cache-Control": "no-store",
    })
