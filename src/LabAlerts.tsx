import type { LabSnapshot, LabAlert } from "./lab-session"
import { alarmPresentation, correctionPending } from "./lab-alerts"

export default function LabAlerts({
  snapshot,
  connected,
  compact = false,
  onAction,
  onReviewFeed,
  busy = false,
}: {
  snapshot: LabSnapshot
  connected: boolean
  compact?: boolean
  busy?: boolean
  onAction?: (
    id: string,
    action: "acknowledge" | "restore_buffer" | "restore_aeration",
  ) => void
  onReviewFeed?: () => void
}) {
  const view = alarmPresentation(snapshot, connected)
  const rows = compact ? view.current.slice(0, 1) : view.current
  function canRestore(a: LabAlert) {
    const kind =
      a.metric === "ph"
        ? "ph_drop"
        : a.metric === "do"
          ? "low_do"
          : "low_nutrients"
    return snapshot.training_scenarios?.runs.some(
      (r) => r.kind === kind && r.mitigated_at_hour === null,
    )
  }
  return (
    <section
      className={`vl-lab-alerts is-${view.tone}${compact ? " is-compact" : ""}`}
      aria-label="Alarm proses BIOSTAT"
    >
      <strong>{view.title}</strong>
      {rows.map((a) => (
        <article
          key={a.id}
          className={`vl-lab-alarm is-${
            a.status === "hold" ? "hold" : a.severity
          }`}
        >
          <b>
            {a.status === "hold"
              ? "HOLD / QC"
              : a.severity === "critical"
                ? "ALERT"
                : "WARNING"}{" "}
            · {a.label}
          </b>
          <div>
            {a.status === "hold"
              ? "Nilai tidak tersedia"
              : `${a.value?.toFixed(a.metric === "ph" ? 3 : 2)} ${a.unit}`}{" "}
            · {a.acknowledged ? "diakui" : "belum diakui"}
          </div>
          <small>
            {a.reading_id} · ukur {a.measured_at_hour.toFixed(2)}h · rilis{" "}
            {a.available_at_hour.toFixed(2)}h
          </small>
          {compact && correctionPending(snapshot, a) && (
            <small>Koreksi tercatat · menunggu sensor baru</small>
          )}
          {!compact && (
            <>
              <p>
                {a.status === "hold"
                  ? "Tunggu pembacaan baru yang segar dan lolos QC. Pemulihan belum dapat dikonfirmasi."
                  : a.advice}
              </p>
              {correctionPending(snapshot, a) && (
                <p>
                  Tindakan diterapkan · lanjutkan kultur dan tunggu sensor
                  berikutnya untuk verifikasi.
                </p>
              )}
              {onAction && !a.acknowledged && (
                <button
                  disabled={busy || !connected}
                  onClick={() => onAction(a.id, "acknowledge")}
                >
                  Akui {a.label}
                </button>
              )}
              {a.status === "active" &&
                onAction &&
                a.correction !== "review_feed" &&
                canRestore(a) && (
                  <button
                    disabled={
                      busy || !connected || !!snapshot.active_intervention
                    }
                    onClick={() =>
                      onAction(
                        a.id,
                        a.correction as "restore_buffer" | "restore_aeration",
                      )
                    }
                  >
                    {a.metric === "ph"
                      ? "Pulihkan buffer virtual"
                      : "Pulihkan jalur gas virtual"}
                  </button>
                )}
              {a.status === "active" &&
                a.correction === "review_feed" &&
                onReviewFeed && (
                  <button
                    disabled={
                      busy || !connected || !!snapshot.active_intervention
                    }
                    onClick={onReviewFeed}
                  >
                    Tinjau feed 1250 mL di Guard
                  </button>
                )}
            </>
          )}
        </article>
      ))}
      {!compact && (
        <>
          <p>
            Ambang latihan: pH &lt;7,15; DO &lt;25%; glukosa &lt;5 mmol/L.
            Pemulihan memakai histeresis dari sensor baru. Ambang ini asumsi
            PoC, bukan batas kultur tervalidasi.
          </p>
          {view.alerts.some((a) => a.status === "resolved") && (
            <details>
              <summary>Pemulihan terverifikasi</summary>
              {view.alerts
                .filter((a) => a.status === "resolved")
                .map((a) => (
                  <p key={a.id}>
                    {a.label} pulih · {a.reading_id} · {a.value?.toFixed(3)}{" "}
                    {a.unit}
                  </p>
                ))}
            </details>
          )}
        </>
      )}
    </section>
  )
}
