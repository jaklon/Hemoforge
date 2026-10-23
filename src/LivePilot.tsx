import { useMemo } from "react"
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
  return (
    <section className="vl-live-module" aria-label="ErythroPilot live">
      <div className="vl-module-heading">
        <div>
          <span className="vl-eyebrow">LIVE · ERYTHROPILOT</span>
          <h1>ErythroPilot</h1>
          <p>
            Proyeksi lokal dan checkpoint dari hasil FLEX2 yang sudah dirilis.
          </p>
        </div>
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
          Unduh analisis & checkpoint
        </button>
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
          <h2>Proyeksi pertumbuhan</h2>
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
            Butuh sedikitnya 3 pengukuran valid yang membentang ≥6 jam kultur
            pada segmen setelah intervensi terakhir. Tidak ada fallback ke kurva
            demo atau laju literatur.
          </p>
        </div>
      )}
      <div className="panel">
        <div className="vl-module-heading">
          <h2>Checkpoint tiap 3 jam</h2>
          <b data-testid="pilot-report-count">{reports.length} checkpoint</b>
        </div>
        <p>
          Setiap laporan hanya memakai hasil yang sudah dirilis pada waktu
          checkpoint tersebut. Sampel yang diambil sebelum checkpoint tetapi
          assay-nya belum selesai tetap tidak masuk.
        </p>
        <div className="vl-table-scroll">
          <table className="vl-live-table">
            <thead>
              <tr>
                <th>Checkpoint</th>
                <th>Baru dirilis</th>
                <th>Sampel terakhir</th>
                <th>Jumlah (juta)</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {[...reports].reverse().map((report) => (
                <tr key={report.checkpoint_hour}>
                  <td>{report.checkpoint_hour} h</td>
                  <td>
                    {report.newly_released_ids.join(", ") ||
                      "Tidak ada pengukuran baru"}
                  </td>
                  <td>
                    {report.latest_collected_at === null
                      ? "Belum tersedia"
                      : `${report.latest_collected_at.toFixed(3)} h`}
                  </td>
                  <td>{report.latest_count?.toFixed(2) ?? "—"}</td>
                  <td>
                    {report.warnings.length} peringatan ·{" "}
                    {report.applied_action_ids.length} tindakan diterapkan
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!reports.length && (
          <p>Checkpoint pertama muncul ketika animasi mencapai 3 jam kultur.</p>
        )}
      </div>
      <p className="vl-evidence-note">
        Fitting dimulai ulang setelah setiap tindakan diterapkan. Proyeksi
        mengasumsikan pola log-growth berlanjut; tidak mengantisipasi feeding,
        sampling berikutnya, atau perubahan kinetika. Hasil sintetik ini bukan
        prakiraan panen atau RBC matang.
      </p>
      <button className="vl-small-button" onClick={props.openGuard}>
        Tinjau keputusan di Guard
      </button>
    </section>
  )
}
