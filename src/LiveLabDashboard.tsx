import { useEffect, useMemo, useState } from "react"
import Guard from "./BioreactorGuard"
import { DataProvider } from "./workspace-context"
import {
  labSessionFromHash,
  liveCultureFile,
  pocMonitorHash,
  type LiveModule,
} from "./lab-session"
import useLabSession from "./use-lab-session"
import GuardDecisions from "./GuardDecisions"
import LivePilot from "./LivePilot"
import LiveCulturePlan from "./LiveCulturePlan"
import LiveProcessDashboard from "./LiveProcessDashboard"
import PocShell, { liveModuleNames } from "./PocShell"
import { Badge, Details, PageTitle } from "./workspace-ui"
import useLiveAnalytics from "./use-live-analytics"
import type { LiveAnalysisSettings } from "./lab-live-analytics"
import "./virtual-lab.css"
import "./poc.css"

export default function LiveLabDashboard({ module }: { module: LiveModule }) {
  const id = labSessionFromHash(location.hash)
  const { snapshot, connection, error, reconnect } = useLabSession(id)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [message, setMessage] = useState("")
  const [settings, setSettings] = useState<LiveAnalysisSettings>({
    horizon: 24,
    target_million: 1000,
  })
  const analytics = useLiveAnalytics(
    snapshot,
    settings,
    connection === "connected",
  )
  const navigate = (next: LiveModule) => {
    if (id) {
      setMessage("")
      location.hash = pocMonitorHash(id, next)
    }
  }
  const culture = useMemo(
    () => (snapshot ? liveCultureFile(snapshot) : null),
    [snapshot?.measurements_sha256],
  )
  const latest = snapshot?.measurements.at(-1)
  const report = snapshot?.assays.at(-1)
  useEffect(() => {
    document.title = `${liveModuleNames[module]} · Monitor 02 · HemoForge`
  }, [module])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [module])
  const shared = snapshot
    ? {
        snapshot,
        analysis: analytics.data,
        settings,
        setSettings,
        loading: analytics.loading,
        error: analytics.error,
        refresh: analytics.refresh,
        connected: connection === "connected",
        openGuard: () => navigate("guard"),
      }
    : null
  return (
    <PocShell
      sessionId={id}
      module={module}
      status={
        <span className="service-status" data-testid="live-connection">
          <span>
            <i
              className={`status-dot ${
                connection === "connected" ? "is-online" : "is-offline"
              }`}
            />
            {connection}
          </span>
          <Badge tone="warning">MONITOR 02 · PoC</Badge>
        </span>
      }
    >
      <section className="poc-live-bar" aria-label="Live simulation connection">
        <div>
          <small>SIMULATION SESSION</small>
          <strong>{snapshot?.batch_id ?? "Connecting to session…"}</strong>
        </div>
        <div>
          <small>CULTURE TIME</small>
          <strong data-testid="live-hour">
            {snapshot?.culture_hours.toFixed(3) ?? "0.000"} h
          </strong>
        </div>
        <div>
          <small>FLEX2 RESULTS</small>
          <strong data-testid="live-result-count">
            {snapshot?.measurements.length ?? 0} published samples
          </strong>
        </div>
        <div>
          <small>MONITOR 01</small>
          <strong>
            {snapshot?.running ? "3D clock running" : "3D clock paused"}
          </strong>
        </div>
        <div className="poc-live-actions">
          <button className="button" onClick={reconnect}>
            Reconnect
          </button>
          <a className="button" href="#poc" target="_blank" rel="noopener">
            PoC launcher ↗
          </a>
        </div>
      </section>
      <p className="poc-live-note">
        PoC session · synthetic FLEX2 data. Culture time follows Monitor 01.{" "}
        {snapshot?.phase === "analyzing"
          ? `Analyzing · ${snapshot.assay_stage.replace(/_/g, " ")} · ${Math.round(snapshot.analysis_progress * 100)}%`
          : latest
            ? `Latest release: ${latest.sample_id} · collected ${latest.collected_at_hour.toFixed(3)}h · released ${latest.available_at_hour.toFixed(3)}h.`
            : "Collect, load and analyze a sample on Monitor 01 to publish measurements."}
      </p>
      {error && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      {connection !== "connected" && snapshot && (
        <p className="poc-live-note is-warning">
          Disconnected · showing last known observations. Forecasts and
          decisions are paused until reconnection.
        </p>
      )}
      {report?.quality.status === "rejected" && (
        <div
          className="poc-live-note is-warning"
          role="status"
          data-testid="live-qc-rejection"
        >
          <b>{report.sample_id} · QC rejected</b>
          <p>
            {report.quality.flags.join(", ")}. No new observation was sent to
            the live modules. Previous releases are retained.
          </p>
        </div>
      )}
      {snapshot && module === "dashboard" ? (
        <LiveProcessDashboard
          snapshot={snapshot}
          connected={connection === "connected"}
          navigate={navigate}
        />
      ) : snapshot && module === "pilot" ? (
        <LivePilot {...shared!} />
      ) : snapshot && module === "plan" ? (
        <LiveCulturePlan {...shared!} />
      ) : culture?.rows.length ? (
        <DataProvider liveCulture={culture}>
          <Guard
            live
            hour={snapshot!.culture_hours}
            replicate={1}
            setReplicate={() => {}}
            navigate={(view) =>
              view === "pilot"
                ? navigate("pilot")
                : setMessage(
                    "Use the main HemoForge workspace for independent imports and exports.",
                  )
            }
            eventNotes={notes}
            setEventNotes={setNotes}
            replayControls={
              <p className="poc-live-note">
                Live mode · samples retain collection time and appear after
                assay release. Replay controls are on Monitor 01.
              </p>
            }
          />
        </DataProvider>
      ) : (
        <>
          <PageTitle
            title={liveModuleNames[module]}
            description="Live analysis from a dedicated simulation session."
          />
          <div className="empty-state">
            <strong>Waiting for FLEX2</strong>
            <p>
              On Monitor 01, collect a sample, load the analyzer, then start
              analysis. No demo rows or hidden reactor values are used.
            </p>
          </div>
        </>
      )}
      {snapshot && module === "guard" && (
        <GuardDecisions
          key={snapshot.session_id}
          snapshot={snapshot}
          connected={connection === "connected"}
        />
      )}
      {message && (
        <p role="status" className="panel-note">
          {message}
        </p>
      )}
      {snapshot && (
        <div className="poc-live-provenance">
          <Details title="Simulation source & measurement provenance">
            <dl>
              <div>
                <dt>Session</dt>
                <dd>{snapshot.session_id}</dd>
              </div>
              <div>
                <dt>Scenario · seed</dt>
                <dd>
                  {snapshot.scenario} · {snapshot.seed}
                </dd>
              </div>
              <div>
                <dt>Current reactor volume</dt>
                <dd>{snapshot.working_volume_ml.toFixed(1)} mL</dd>
              </div>
              <div>
                <dt>Published source SHA-256</dt>
                <dd>
                  <code>{snapshot.measurements_sha256}</code>
                </dd>
              </div>
            </dl>
            {latest && (
              <p data-testid="measurement-receipt">
                <b>{latest.sample_id}</b> · {latest.count.toFixed(2)} million
                viable cells = measured density{" "}
                {latest.viable_cell_density_million_ml.toFixed(3)} million/mL ×{" "}
                {latest.volume_ml.toFixed(1)} mL after withdrawal. QC{" "}
                {latest.quality.status}.
              </p>
            )}
            <p>
              Uncalibrated teaching culture and analytical variation, not Nova
              accuracy specifications or BEL-A validation. No physical device,
              paid inference, or remote database is connected. Checkpoint and
              prediction adapters use released measurements only. Credentials
              and hidden reactor state stay out of exports.
            </p>
          </Details>
        </div>
      )}
    </PocShell>
  )
}
