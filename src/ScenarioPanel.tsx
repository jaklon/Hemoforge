import type { LabSnapshot, DisturbanceKind } from "./lab-session"

export default function ScenarioPanel({
  snapshot,
  connected,
  onRun,
}: {
  snapshot: LabSnapshot
  connected: boolean
  onRun: (kind: DisturbanceKind) => void
}) {
  const runs = snapshot.training_scenarios?.runs ?? []
  const blocked =
    !connected ||
    !snapshot.training_scenarios ||
    !!snapshot.active_intervention ||
    snapshot.culture_hours > snapshot.end_hour - 3 ||
    runs.length >= 12 ||
    runs.some((r) => r.mitigated_at_hour === null) ||
    (snapshot.lab_alerts ?? []).some((a) => a.status !== "resolved")
  return (
    <section className="vl-scenarios" aria-label="Skenario gangguan kultur">
      <h3>Skenario gangguan kultur</h3>
      <p>
        Satu latihan setiap kali. Nilai berubah di mesin kultur; alarm menunggu
        hasil sensor terjadwal. Koreksi dilakukan di Monitor 02 / Guard.
      </p>
      {([
        ["ph_drop", "Simulasikan pH turun"],
        ["low_do", "Simulasikan DO rendah"],
        ["low_nutrients", "Simulasikan nutrisi menipis"],
      ] as const).map(([kind, label]) => (
        <button key={kind} disabled={blocked} onClick={() => onRun(kind)}>
          {label}
        </button>
      ))}
      {runs.at(-1) && (
        <p>
          {runs.at(-1)!.id} · {runs.at(-1)!.kind} ·{" "}
          {runs.at(-1)!.mitigated_at_hour === null
            ? "gangguan aktif / menunggu koreksi"
            : "koreksi diterapkan; verifikasi sensor"}
        </p>
      )}
      {blocked && (
        <small>
          Selesaikan gangguan/transfer dan tunggu pembacaan pemulihan, atau buat
          sesi baru. Maksimum 12 latihan per sesi.
        </small>
      )}
    </section>
  )
}
