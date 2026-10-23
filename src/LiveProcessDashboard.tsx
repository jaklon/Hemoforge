import { useState } from "react"

import type { LabSnapshot, LiveModule } from "./lab-session"

import { Badge, Button, PageTitle, Panel } from "./workspace-ui"

import InteractivePlot from "./InteractivePlot"

import { liveProcessData } from "./live-process-data"

export default function LiveProcessDashboard({
  snapshot,

  connected,

  navigate,
}: {
  snapshot: LabSnapshot

  connected: boolean

  navigate: (module: LiveModule) => void
}) {
  const [selectedId, setSelectedId] = useState("lactate_mmol_l")

  const [windowHours, setWindowHours] = useState(48)

  const variables = liveProcessData(snapshot)

  const selected = variables.find((variable) => variable.id === selectedId)!

  const end = Math.max(1, snapshot.culture_hours)

  const start = Math.max(0, end - windowHours)

  const applied = snapshot.interventions.filter(
    (item) => item.status === "applied",
  )

  const latest = snapshot.measurements.at(-1)

  const stale = latest && snapshot.culture_hours - latest.collected_at_hour > (snapshot.device_profile ? 3 : 24)

  return (
    <>
      <PageTitle
        title="Dashboard"
        description="BIOSTAT Gen 2 + Trace + ViaMass: virtual sensor signals, model estimates and unavailable assays."
        action={<Badge tone="warning">Synthetic · simulation session</Badge>}
      />
      <div className="dash-summary">
        <span>
          <strong>
            {variables.filter((item) => item.latest).length}/{variables.length}
          </strong>{" "}
          available signals / estimates
        </span>
        <span>
          <strong>{snapshot.measurements.length}</strong> {snapshot.device_profile ? "released cell estimates" : "released samples"}
        </span>
        <span>
          <strong>
            {
              (snapshot.sensor_readings ?? snapshot.assays).filter(
                (item) => item.quality.status === "rejected",
              ).length
            }
          </strong>{" "}
          sensor QC rejected
        </span>
        <span>
          <strong>{applied.length}</strong> applied decisions
        </span>
      </div>
      {(!connected || stale) && (
        <p className="poc-live-note is-warning">
          {!connected
            ? "Disconnected · last known measurements. Reconnect to resume live monitoring."
            : "The latest cell estimate is stale. Resume the 3D culture and wait for fresh online signals."}
        </p>
      )}
      <div className="dash-timebar">
        <fieldset className="guard-segmented">
          <legend className="sr-only">Time window</legend>
          {[12, 24, 48, 168].map((span) => (
            <button
              key={span}
              aria-pressed={windowHours === span}
              onClick={() => setWindowHours(span)}
            >
              {span === 168 ? "All" : `Last ${span}h`}
            </button>
          ))}
        </fieldset>
        <span className="dash-range">
          {start.toFixed(1)}h – {end.toFixed(1)}h · following 3D culture time
        </span>
        <span className="dash-hint">
          Online signals · device-specific cadence and latency
        </span>
      </div>
      <div className="dash-grid" data-testid="live-process-grid">
        {variables.map((variable) => {
          const visible = variable.samples.filter(
            (sample) => sample.hour >= start,
          )

          const values = visible.map((sample) => sample.value)

          const lo = Math.min(...values),
            hi = Math.max(...values),
            span = hi - lo || Math.max(1, Math.abs(lo) * 0.1)

          const x = (hour: number) => 6 + ((hour - start) / (end - start)) * 288

          const y = (value: number) => 105 - ((value - lo) / span) * 90

          return (
            <button
              key={variable.id}
              className={`dash-card poc-sample-card biostat-origin-${variable.origin}`}
              aria-pressed={selectedId === variable.id}
              onClick={() => setSelectedId(variable.id)}
            >
              <span className="dash-card-head">
                <span className="dash-name">{variable.name}</span>
                <span className="dash-value">
                  {variable.latest?.value.toFixed(variable.digits) ?? "—"}
                  <small>{variable.unit}</small>
                </span>
              </span>
              <span className={`biostat-source-badge is-${variable.origin}`}>
                {variable.origin === "model_estimate"
                  ? "MODEL ESTIMATE"
                  : variable.origin === "unmeasured"
                    ? "NOT MEASURED"
                    : "VIRTUAL SENSOR"}{" "}
                · {variable.status}
              </span>
              {visible.length ? (
                <svg
                  className="poc-process-chart"
                  viewBox="0 0 300 120"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${variable.name} · ${variable.source}`}
                >
                  <polyline
                    points={visible

                      .map((sample) => `${x(sample.hour)},${y(sample.value)}`)

                      .join(" ")}
                  />
                  {visible.map((sample) => (
                    <circle
                      key={sample.sample_id}
                      cx={x(sample.hour)}
                      cy={y(sample.value)}
                      r="2.5"
                    />
                  ))}
                </svg>
              ) : (
                <span className="poc-no-data">
                  {variable.latest
                    ? "No samples in this time window"
                    : variable.status === "fault"
                      ? "Sensor fault · QC rejected"
                      : variable.status === "stale"
                        ? "Stale signal"
                        : "Not measured"}
                </span>
              )}
              <span className="dash-card-foot">
                {variable.latest
                  ? `${variable.latest.sample_id} · collected ${variable.latest.hour.toFixed(3)}h · released ${variable.latest.available_at_hour.toFixed(3)}h`
                  : variable.source}
              </span>
            </button>
          )
        })}
      </div>
      <Panel
        title={selected.name}
        caption={`${selected.source} · ${
          selected.origin === "model_estimate"
            ? "Uncalibrated model estimate"
            : "Device-timed output"
        }. Points appear only after release.`}
        action={<Badge>{selected.unit}</Badge>}
      >
        <div className="poc-process-detail">
          {selected.samples.length ? (
            <InteractivePlot
              key={selected.id}
              title={`${selected.name} live chart`}
              xExtent={[0, end]}
              fromZero={false}
              values={selected.samples.map((sample) => sample.value)}
              yLabel={`${selected.name} · ${selected.unit}`}
              points={selected.samples.map((sample) => ({
                x: sample.hour,

                y: sample.value,

                lines: [
                  sample.sample_id,

                  `${sample.hour.toFixed(3)}h`,

                  `${sample.value.toFixed(selected.digits)} ${selected.unit}`,
                ],
              }))}
            >
              {({ x, y }) => (
                <>
                  <polyline
                    className="dash-line"
                    points={selected.samples

                      .map((sample) => `${x(sample.hour)},${y(sample.value)}`)

                      .join(" ")}
                  />
                  {selected.samples.map((sample) => (
                    <circle
                      key={sample.sample_id}
                      cx={x(sample.hour)}
                      cy={y(sample.value)}
                      r="3.5"
                      className="dash-dot"
                    />
                  ))}
                </>
              )}
            </InteractivePlot>
          ) : (
            <div className="empty-state">
              <strong>No measured data</strong>
              <p>
                This channel requires an additional assay and is not supplied by
                the configured sensors.
              </p>
            </div>
          )}
        </div>
        <p className="panel-note">
          Measurements are synthetic, not a physical instrument feed. Ammonium
          is preserved as NH4; it is not renamed to ammonia. Decisions are
          reviewed and confirmed in Guard.
        </p>
        <div className="poc-process-detail">
          <Button onClick={() => navigate("guard")}>
            Review in Bioreactor Guard →
          </Button>
        </div>
      </Panel>
      <Panel
        title="Reactor decision log"
        caption="User-confirmed actions; no automatic process correction is generated by this dashboard."
      >
        {snapshot.interventions.length ? (
          <div className="table-scroll poc-table">
            <table>
              <thead>
                <tr>
                  <th>Source sample</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshot.interventions].reverse().map((item) => (
                  <tr key={item.id}>
                    <td>{item.source_sample_id}</td>
                    <td>
                      {item.kind === "feed"
                        ? `Feed ${item.amount * (item.feed_multiplier_ml ?? 1)} mL`
                        : `Exchange ${item.amount}%`}
                    </td>
                    <td>{item.status}</td>
                    <td>{item.completed_at_hour?.toFixed(3) ?? "—"}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel-note">No decisions recorded for this session.</p>
        )}
      </Panel>
    </>
  )
}
