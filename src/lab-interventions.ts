import type { LabIntervention, LabSnapshot } from "./lab-session.ts"

export const interventionPresets = [
  {
    id: "feed-10",
    kind: "feed",
    amount: 10,
    label: "Tambah medium nutrisi · 10 mL",
  },
  {
    id: "feed-25",
    kind: "feed",
    amount: 25,
    label: "Tambah medium nutrisi · 25 mL",
  },
  {
    id: "exchange-25",
    kind: "medium_exchange",
    amount: 25,
    label: "Pertukaran medium · 25%",
  },
  {
    id: "exchange-50",
    kind: "medium_exchange",
    amount: 50,
    label: "Pertukaran medium · 50%",
  },
] as const

export function interventionLabel(
  action: Pick<LabIntervention, "kind" | "amount">,
) {
  return action.kind === "feed"
    ? `Tambah medium ${action.amount} mL`
    : `Pertukaran medium ${action.amount}%`
}

export function decisionBlockReason(
  snapshot: LabSnapshot,
  kind: string,
  amount: number,
) {
  const latest = snapshot.measurements.at(-1)
  if (!snapshot.controller_connected)
    return "Hubungkan layar 3D terlebih dahulu."
  if (snapshot.active_intervention)
    return "Selesaikan atau batalkan tindakan yang sedang berjalan."
  if (!["idle", "complete"].includes(snapshot.phase))
    return "Selesaikan proses sampel FLEX2 terlebih dahulu."
  if (
    snapshot.culture_hours +
      snapshot.intervention_protocol.culture_minutes / 60 >
    snapshot.end_hour
  )
    return "Waktu kultur tidak cukup. Buat sesi baru."
  if (!latest) return "Tunggu pengukuran FLEX2 pertama yang lolos QC."
  if (
    snapshot.culture_hours - latest.collected_at_hour >
    snapshot.intervention_protocol.decision_max_age_hours
  )
    return "Pengukuran lebih dari 24 jam kultur. Ambil sampel baru."
  if (
    snapshot.interventions.some(
      (item) =>
        item.status === "applied" && item.source_sample_id === latest.sample_id,
    )
  )
    return "Ambil dan analisis sampel FLEX2 baru untuk memeriksa dampak tindakan sebelumnya."
  if (snapshot.interventions.length >= 40)
    return "Batas tindakan tercapai. Buat sesi baru."
  if (snapshot.assays.length >= 100)
    return "Batas assay tercapai. Buat sesi baru agar dampak tindakan dapat diukur."
  if (
    kind === "feed" &&
    snapshot.working_volume_ml + amount >
      snapshot.intervention_protocol.max_volume_ml
  )
    return "Penambahan ini melewati batas volume 550 mL."
  if (kind === "medium_exchange" && snapshot.working_volume_ml < 400.1)
    return "Volume tidak cukup untuk sampling setelah pertukaran. Tambah medium atau buat sesi baru."
  return ""
}

// Credentials belong in headers, never in monitor URLs, snapshots or audit exports.
export async function labControlRequest(
  id: string,
  path: string,
  role: "controller" | "operator" | "pair",
  token: string,
  body = {},
) {
  const response = await fetch(
    `/api/v1/lab/sessions/${encodeURIComponent(id)}/${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-HemoForge-Action": "virtual-lab",
        ...(role === "pair" ? {} : { [`X-Lab-${role}`]: token }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    },
  )
  const value = await response.json()
  if (!response.ok)
    throw new Error(
      typeof value.detail === "string"
        ? value.detail
        : "Periksa input tindakan dan coba lagi.",
    )
  return value
}
