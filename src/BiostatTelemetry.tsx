import type { LabSnapshot } from "./lab-session"
import { biostatProcessData } from "./biostat-data"

export default function BiostatTelemetry({
  snapshot,
  compact = false,
}: {
  snapshot: LabSnapshot
  compact?: boolean
}) {
  const variables = biostatProcessData(snapshot)
  return (
    <section
      className={`biostat-telemetry ${compact ? "is-compact" : ""}`}
      aria-label="BIOSTAT sensor and estimate provenance"
    >
      <div className="biostat-telemetry-heading">
        <div>
          <small>PROCESS ANALYTICAL TECHNOLOGY</small>
          <h2>Sensor signals & model estimates</h2>
        </div>
        <span className="biostat-auto">AUTO · {snapshot.stage} model</span>
      </div>
      <p>
        Semua sinyal adalah sensor virtual. Estimasi sel memakai konversi
        ViaMass yang belum dikalibrasi biologis; bukan jumlah RBC matang.
      </p>
      {(["virtual_sensor", "model_estimate", "unmeasured"] as const).map(
        (origin) => (
          <div key={origin} className={`biostat-source-group is-${origin}`}>
            <h3>
              {origin === "virtual_sensor"
                ? "01 / SENSOR VIRTUAL"
                : origin === "model_estimate"
                  ? "02 / ESTIMASI MODEL"
                  : "03 / BELUM TERUKUR"}
            </h3>
            <div className="biostat-signal-grid">
              {variables
                .filter((v) => v.origin === origin)
                .map((v) => (
                  <div
                    className="biostat-signal"
                    key={v.id}
                    data-testid={`signal-${v.id}`}
                  >
                    <span>{v.name}</span>
                    <strong>
                      {v.latest?.value.toFixed(v.digits) ?? "—"}
                      <small>{v.unit}</small>
                    </strong>
                    <small>{v.source}</small>
                    <small>
                      {v.latest
                        ? `${v.latest.sample_id} · usia ${(snapshot.culture_hours - v.latest.hour).toFixed(2)} h`
                        : v.status === "fault"
                          ? "QC fault · menunggu sensor pulih"
                          : v.status === "stale"
                            ? "Stale · pembacaan kedaluwarsa"
                            : "Tidak tersedia"}
                    </small>
                  </div>
                ))}
            </div>
          </div>
        ),
      )}
    </section>
  )
}
