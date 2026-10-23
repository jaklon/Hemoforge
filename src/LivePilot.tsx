import { useMemo, useState } from "react"

import ForecastChart from "./ForecastChart"

import LiveAnalysisControls from "./LiveAnalysisControls"

import type { LabSnapshot } from "./lab-session"

import {
  liveAnalysisHold,
  liveCheckpointReports,
  liveSettingsError,
  lastAppliedAction,
  type LiveAnalysis,
  type LiveAnalysisSettings,
} from "./lab-live-analytics"

import { downloadFile } from "./workspace-utils"

import { PageTitle, Badge, Icon, Panel, Button } from "./workspace-ui"

export interface LiveModuleProps {
  snapshot: LabSnapshot

  analysis: LiveAnalysis | null

  settings: LiveAnalysisSettings

  setSettings: (settings: LiveAnalysisSettings) => void

  loading: boolean

  error: string

  connected: boolean

  refresh: () => void

  openGuard: () => void
}

export default function LivePilot(props: LiveModuleProps) {
  const { snapshot, analysis, settings, loading, error } = props

  const reports = useMemo(
    () => liveCheckpointReports(snapshot),

    [
      snapshot.measurements_sha256,

      Math.floor(snapshot.culture_hours / 3),

      lastAppliedAction(snapshot)?.id,
    ],
  )

  const hold = !props.connected
    ? "Koneksi terputus. Sambungkan ulang sebelum membaca proyeksi live."
    : liveSettingsError(settings) || liveAnalysisHold(snapshot)

  const forecast = !hold ? analysis?.forecast : null

  const result = forecast?.result

  const last = result?.distribution.at(-1)

  const [reportPage, setReportPage] = useState(0)

  const [activeHour, setActiveHour] = useState<number | null>(null)

  const maxPage = Math.max(0, Math.ceil(reports.length / 8) - 1)

  const safePage = Math.min(reportPage, maxPage)

  const shown = [...reports].reverse().slice(safePage * 8, safePage * 8 + 8)

  const selected =
    reports.find((report) => report.checkpoint_hour === activeHour) ??
    reports.at(-1)

  return (
    <section className="vl-live-module" aria-label="ErythroPilot live">
      <PageTitle
        title="ErythroPilot"
        description="Project ViaMass-derived cell estimates and review online PAT checkpoint reports."
        action={
          <button
            className="vl-small-button"
            onClick={() =>
              downloadFile(
                `${snapshot.batch_id}-live-pilot.json`,

                JSON.stringify(
                  {
                    session_id: snapshot.session_id,

                    source_hash: snapshot.measurements_sha256,

                    settings,

                    analysis: hold ? null : analysis,

                    reports,
                  },

                  null,

                  2,
                ),

                "application/json",
              )
            }
          >
            <Icon name="download" /> Unduh analisis & checkpoint
          </button>
        }
      />
      <div className="workspace-overview">
        <div className="workspace-overview-message">
          <Icon name="pilot" />
          <div>
            <h2>Reading Guard through {snapshot.culture_hours.toFixed(3)}h</h2>
            <p>
              Released cell estimates only · fitting restarts after material
              interventions.
            </p>
          </div>
        </div>
        <Badge>{snapshot.batch_id}</Badge>
        <dl className="workspace-overview-stats">
          <div>
            <dt>Valid samples</dt>
            <dd>{snapshot.measurements.length}</dd>
          </div>
          <div>
            <dt>Fit samples</dt>
            <dd>{analysis?.source_sample_ids.length ?? 0}</dd>
          </div>
          <div>
            <dt>Checkpoints</dt>
            <dd>{reports.length}</dd>
          </div>
        </dl>
      </div>
      <LiveAnalysisControls {...props} />
      <div className="vl-analysis-provenance" data-testid="pilot-source">
        {analysis
          ? `${analysis.source_sample_ids.length} pengukuran untuk fitting · mulai ${analysis.segment_start_hour.toFixed(3)} h · ${analysis.source_sample_ids.join(", ") || "menunggu sampel"}`
          : "Menunggu analisis pada bukti terbaru."}
      </div>
      {(hold || analysis?.reason || error) && (
        <p className="vl-evidence-note" role="status">
          {hold || error || analysis?.reason}
        </p>
      )}
      {result && last ? (
        <div className="panel" data-testid="pilot-forecast">
          <h2>Proyeksi estimasi jumlah sel</h2>
          <div className="vl-live-metrics">
            <div>
              <span>Median pada {last.hour.toFixed(3)} h</span>
              <b>{last.median.toFixed(2)} juta</b>
            </div>
            <div>
              <span>Rentang simulasi 95%</span>
              <b>
                {last.lower95.toFixed(2)}–{last.upper95.toFixed(2)}
              </b>
            </div>
            <div>
              <span>Laju log-growth</span>
              <b>{result.logDrift.toFixed(5)} /h</b>
            </div>
          </div>
          <ForecastChart
            observedLabel="ViaMass cell estimate"
            key={forecast!.requestId}
            result={result}
            samples={analysis!.training_samples}
          />
          <p className="vl-assay-context">
            Origin proyeksi: {result.fromHour.toFixed(3)} h, waktu pengambilan
            sampel terakhir; jam simulasi sekarang{" "}
            {snapshot.culture_hours.toFixed(3)} h. {result.simulationCount}{" "}
            jalur CPU · {forecast!.modelVersion}. Rentang ini bukan cakupan
            prediksi biologis tervalidasi.
          </p>
        </div>
      ) : (
        <div className="vl-module-empty" data-testid="pilot-waiting">
          <h2>
            {loading ? "Menghitung proyeksi…" : "Proyeksi belum tersedia"}
          </h2>
          <p>
            Butuh sedikitnya 3 estimasi dari sinyal ViaMass valid yang
            membentang ≥6 jam kultur pada segmen setelah intervensi terakhir.
            Tidak ada fallback ke kurva demo atau laju literatur.
          </p>
        </div>
      )}
      <div className="pilot-grid poc-checkpoints">
        <Panel
          title="Checkpoint reports"
          caption={`${reports.length} checkpoints reached · 8 per page`}
          action={<Badge>Every 3h</Badge>}
        >
          <span className="sr-only" data-testid="pilot-report-count">
            {reports.length} checkpoint
          </span>
          <div className="report-timeline">
            {shown.length ? (
              shown.map((report) => (
                <button
                  key={report.checkpoint_hour}
                  className={
                    selected?.checkpoint_hour === report.checkpoint_hour
                      ? "active"
                      : ""
                  }
                  onClick={() => setActiveHour(report.checkpoint_hour)}
                >
                  <span className="checkpoint-time">
                    {report.checkpoint_hour}h
                  </span>
                  <span>
                    <strong>
                      {report.newly_released_ids.length
                        ? "New PAT estimate"
                        : "No new measurements"}
                    </strong>
                    <small>
                      Last sample{" "}
                      {report.latest_collected_at?.toFixed(3) ?? "—"}h ·{" "}
                      {report.warnings.length} warnings
                    </small>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <div className="empty-state">
                <strong>No checkpoints reached</strong>
                <p>Advance Monitor 01 to 3h to generate the first report.</p>
              </div>
            )}
          </div>
          <div className="pagination">
            <Button
              disabled={safePage === 0}
              onClick={() => setReportPage(safePage - 1)}
            >
              Newer
            </Button>
            <span>
              {reports.length
                ? `${safePage + 1} / ${maxPage + 1}`
                : "No reports"}
            </span>
            <Button
              disabled={safePage === maxPage}
              onClick={() => setReportPage(safePage + 1)}
            >
              Earlier
            </Button>
          </div>
        </Panel>
        <Panel
          title="Report detail"
          caption={
            selected
              ? `${snapshot.batch_id} · ${selected.checkpoint_hour}h checkpoint`
              : "Reports appear as culture time advances."
          }
        >
          <div className="poc-report-detail">
            {selected ? (
              <>
                <dl>
                  <div>
                    <dt>Latest estimate source time</dt>
                    <dd>{selected.latest_collected_at?.toFixed(3) ?? "—"}h</dd>
                  </div>
                  <div>
                    <dt>Released at</dt>
                    <dd>{selected.latest_available_at?.toFixed(3) ?? "—"}h</dd>
                  </div>
                  <div>
                    <dt>Estimated viable cells</dt>
                    <dd>{selected.latest_count?.toFixed(2) ?? "—"} million</dd>
                  </div>
                  <div>
                    <dt>Source IDs available then</dt>
                    <dd>{selected.source_sample_ids.join(", ") || "None"}</dd>
                  </div>
                  <div>
                    <dt>Applied actions by checkpoint</dt>
                    <dd>{selected.applied_action_ids.length}</dd>
                  </div>
                </dl>
                <p>
                  {selected.newly_released_ids.length
                    ? `New releases: ${selected.newly_released_ids.join(", ")}`
                    : "No new observation; earlier values are carried forward, not remeasured."}
                </p>
                {selected.warnings.map((event) => (
                  <p key={event.id}>{event.reason}</p>
                ))}
              </>
            ) : (
              <p>No report selected.</p>
            )}
            <p>
              Only results released at or before each checkpoint are included.
              Pending or QC-rejected assays never enter the report.
            </p>
          </div>
        </Panel>
      </div>
      <p className="vl-evidence-note">
        Fitting memakai estimasi ViaMass pada jendela 24 jam dengan jarak ≥2
        jam. Perubahan setpoint, fase, dan transfer medium memulai segmen baru;
        koreksi kecil controller tidak mereset fitting. Proyeksi mengasumsikan
        pola log-growth berlanjut; tidak mengantisipasi feeding, sampling
        berikutnya, atau perubahan kinetika. Hasil sintetik ini bukan prakiraan
        panen atau RBC matang.
      </p>
      <button className="vl-small-button" onClick={props.openGuard}>
        Tinjau keputusan di Guard
      </button>
    </section>
  )
}
