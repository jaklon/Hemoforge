import { useEffect, useMemo, useState } from "react"
import Guard from "./BioreactorGuard"
import { DataProvider } from "./workspace-context"
import { labSessionFromHash, liveCultureFile } from "./lab-session"
import useLabSession from "./use-lab-session"
import "./virtual-lab.css"

export default function LiveGuard() {
  const id = labSessionFromHash(location.hash)
  const { snapshot, connection, error, reconnect } = useLabSession(id)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const culture = useMemo(
    () => (snapshot ? liveCultureFile(snapshot) : null),
    [snapshot?.measurements_sha256],
  )
  const latest = snapshot?.measurements.at(-1)
  const report = snapshot?.assays.at(-1)
  useEffect(() => {
    document.title = "Live Bioreactor Guard · HemoForge"
  }, [])
  return (
    <div className="live-guard-shell">
      <header className="vl-header">
        <a className="vl-brand" href="#">
          H<span>HemoForge</span>
        </a>
        <span className="vl-kicker">LIVE GUARD / MONITOR 02</span>
        <a className="vl-text-link" href="#lab" target="_blank" rel="noopener">
          Open Virtual Lab ↗
        </a>
      </header>
      <section
        className="vl-live-strip"
        aria-label="Live simulation connection"
      >
        <span
          className={`vl-status ${
            connection === "connected" ? "is-online" : ""
          }`}
          data-testid="live-connection"
        >
          {connection}
        </span>
        <strong>{snapshot?.batch_id ?? "Connecting to session…"}</strong>
        <span data-testid="live-hour">
          {snapshot?.culture_hours.toFixed(3) ?? "0.000"} h
        </span>
        <span>
          {snapshot?.running ? "3D clock running" : "3D clock paused"}
        </span>
        <span data-testid="live-result-count">
          {snapshot?.measurements.length ?? 0} published samples
        </span>
        <button className="vl-small-button" onClick={reconnect}>
          Reconnect
        </button>
      </section>
      <main className="live-guard-main">
        <div className="vl-evidence-note">
          Stage C · mechanistic teaching culture and virtual FLEX2 with
          simulated analytical variation. No physical instrument is connected.
          Only Guard is integrated in this prototype; other modules follow in
          later stages.
        </div>
        {snapshot && (
          <p className="vl-assay-context">
            Scenario: {snapshot.scenario} · seed {snapshot.seed} · reactor{" "}
            {snapshot.working_volume_ml.toFixed(1)} mL · withdrawn{" "}
            {snapshot.withdrawn_volume_ml.toFixed(1)} mL. Assumed analytical SD:
            density {snapshot.uncertainty_model.density_cv * 100}%, chemistry{" "}
            {snapshot.uncertainty_model.chemistry_cv * 100}%, pH{" "}
            {snapshot.uncertainty_model.ph_sd}, viability{" "}
            {snapshot.uncertainty_model.viability_sd_percentage_points}{" "}
            percentage points. These are simulation assumptions, not Nova
            accuracy specifications.
          </p>
        )}
        {error && (
          <p role="alert" className="vl-error">
            {error}
          </p>
        )}
        {snapshot && (
          <div className="vl-sample-state" role="status">
            <div>
              <span className="vl-eyebrow">ANALYZER</span>
              <strong>
                {snapshot.phase === "analyzing"
                  ? `Analyzing sample · ${snapshot.assay_stage.replace(/_/g, " ")} · ${Math.round(snapshot.analysis_progress * 100)}%`
                  : snapshot.reason}
              </strong>
            </div>
            <div>
              <span className="vl-eyebrow">LAST RELEASED OBSERVATION</span>
              <strong>
                {latest
                  ? `${latest.sample_id} · collected ${latest.collected_at_hour.toFixed(3)} h · released ${latest.available_at_hour.toFixed(3)} h`
                  : "Waiting for the first completed assay"}
              </strong>
            </div>
          </div>
        )}
        {report?.quality.status === "rejected" && (
          <div
            className="vl-qc-rejection"
            role="status"
            data-testid="live-qc-rejection"
          >
            <b>{report.sample_id} · QC rejected</b>
            <p>
              {report.quality.flags.join(", ")}. No new observation was sent to
              Guard. Previously released results are retained.
            </p>
          </div>
        )}
        {latest && (
          <div className="vl-result-receipt" data-testid="measurement-receipt">
            <b>{latest.sample_id}</b>
            <span>{latest.count.toFixed(2)} million viable cells</span>
            <span>
              {latest.viable_cell_density_million_ml.toFixed(3)} ×10⁶ viable
              cells/mL × {latest.volume_ml.toFixed(1)} mL after withdrawal
            </span>
            <span>Lactate {latest.channels.lactate_mmol_l} mmol/L</span>
            <span>
              QC: {latest.quality.status} · withdrawn {latest.withdrawal_ml} mL
              · analyzed {latest.analyzed_volume_ml} mL
            </span>
            <span>
              Count reconstructed from the measured density; not a direct
              total-cell instrument measurement.
            </span>
          </div>
        )}
        {culture && culture.rows.length ? (
          <DataProvider liveCulture={culture}>
            <Guard
              live
              hour={snapshot!.culture_hours}
              replicate={1}
              setReplicate={() => {}}
              navigate={() =>
                setMessage(
                  "Stage C connects FLEX2 to Guard. Open the regular workspace separately for other modules.",
                )
              }
              eventNotes={notes}
              setEventNotes={setNotes}
              replayControls={
                <div className="vl-evidence-note">
                  Live mode · the 3D window controls time. Samples are plotted
                  at collection time and appear only after assay completion.
                </div>
              }
            />
          </DataProvider>
        ) : (
          <section className="vl-waiting">
            <span className="vl-waiting-icon">⌁</span>
            <h1>Waiting for FLEX2</h1>
            <p>
              On monitor 1, collect a sample, load the analyzer, then start
              analysis. The result will appear here automatically.
            </p>
            <p>No demo rows or hidden reactor values are used while waiting.</p>
          </section>
        )}
        {message && <p role="status">{message}</p>}
      </main>
    </div>
  )
}
