import type { LabIntervention } from "./lab-session"
import { interventionLabel } from "./lab-interventions"

const statuses = {
  queued: "Menunggu layar 3D",
  executing: "Sedang diterapkan",
  applied: "Sudah diterapkan",
  cancelled: "Dibatalkan",
}

export default function LabInterventionStatus({
  items,
  testId,
}: {
  items: LabIntervention[]
  testId: string
}) {
  const latest = items.at(-1)
  if (!latest) return null
  return (
    <section
      className="vl-intervention-status"
      aria-label="Status tindakan bioreaktor"
      data-testid={testId}
    >
      <span className="vl-eyebrow">GUARD → BIOREAKTOR</span>
      <strong>
        {interventionLabel(latest)} · {statuses[latest.status]}
      </strong>
      <p>
        Berdasarkan {latest.source_sample_id} · diminta{" "}
        {latest.requested_at_hour.toFixed(3)} h
        {latest.completed_at_hour !== null &&
          ` · selesai ${latest.completed_at_hour.toFixed(3)} h`}
      </p>
      {latest.status === "executing" && (
        <progress
          aria-label="Kemajuan tindakan bioreaktor"
          max={1}
          value={latest.progress}
        />
      )}
      {latest.outcome && (
        <p>
          Volume {latest.outcome.volume_before_ml.toFixed(1)} →{" "}
          {latest.outcome.volume_after_ml.toFixed(1)} mL
          {" · "}
          {latest.kind === "feed"
            ? `${latest.outcome.added_medium_ml} mL ditambahkan`
            : `${latest.outcome.exchanged_medium_ml.toFixed(1)} mL ditukar; retensi ${((latest.outcome.retention_fraction ?? 1) * 100).toFixed(0)}% (asumsi)`}
        </p>
      )}
      {latest.cancel_reason && <p>{latest.cancel_reason}</p>}
      <details>
        <summary>Riwayat tindakan ({items.length})</summary>
        <ol>
          {[...items].reverse().map((item) => (
            <li key={item.id}>
              <b>
                {interventionLabel(item)} · {statuses[item.status]}
              </b>
              <p>
                {item.source_sample_id} · {item.requested_at_hour.toFixed(3)} h
                {item.completed_at_hour !== null &&
                  ` → ${item.completed_at_hour.toFixed(3)} h`}{" "}
                · {item.note}
              </p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  )
}
