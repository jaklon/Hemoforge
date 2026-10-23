import { useState } from "react"
import type { LabSnapshot } from "./lab-session"
import {
  decisionBlockReason,
  interventionLabel,
  interventionPresets,
  labControlRequest,
} from "./lab-interventions"
import LabInterventionStatus from "./LabInterventionStatus"

interface Decision {
  request_id: string
  kind: "feed" | "medium_exchange"
  amount: 10 | 25 | 50
  source_sample_id: string
  note: string
}

export default function GuardDecisions({
  snapshot,
  connected,
}: {
  snapshot: LabSnapshot
  connected: boolean
}) {
  const id = snapshot.session_id
  const storageKey = `vl-operator-${id}`
  const [token, setToken] = useState(
    () => sessionStorage.getItem(storageKey) ?? "",
  )
  const [code, setCode] = useState("")
  const [presetId, setPresetId] = useState("feed-10")
  const [note, setNote] = useState("Review sensor BIOSTAT dan BioPAT terbaru")
  const [review, setReview] = useState<Decision | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const latest = snapshot.measurements.at(-1)
  const preset = interventionPresets.find((item) => item.id === presetId)!
  const block = decisionBlockReason(
    snapshot,
    preset.kind,
    preset.amount,
    review?.source_sample_id,
  )
  const multiplier = snapshot.device_profile?.feed_multiplier_ml ?? 1
  const label = (item: { kind: string amount: number }) =>
    item.kind === "feed"
      ? `Tambah medium ${item.amount * multiplier} mL`
      : `Pertukaran medium ${item.amount}%`
  const paired = !!token && snapshot.operator_paired
  const unavailable =
    !connected || !paired || busy || !!block || note.trim().length < 3

  async function pair() {
    setBusy(true)
    setError("")
    try {
      const value = await labControlRequest(id, "pair", "pair", "", {
        code: code.trim().toLowerCase(),
      })
      sessionStorage.setItem(storageKey, value.operator_token)
      setToken(value.operator_token)
      setCode("")
      setMessage(
        "Guard terhubung. Tinjau pengukuran, lalu pilih tindakan simulasi.",
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Pairing gagal.")
    } finally {
      setBusy(false)
    }
  }

  async function send(cancelId?: string) {
    if (!cancelId && !review) return
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await labControlRequest(
        id,
        cancelId
          ? `interventions/${encodeURIComponent(cancelId)}/cancel`
          : "interventions",
        "operator",
        token,
        cancelId ? {} : review!,
      )
      setReview(null)
      setMessage(
        cancelId
          ? "Pembatalan dicatat."
          : "Keputusan dikirim. Tunggu animasi layar 3D, lalu lanjutkan kultur untuk pembacaan sensor berikutnya.",
      )
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Tindakan belum dapat dikonfirmasi. Coba lagi dengan permintaan yang sama.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="vl-decision-panel"
      aria-label="Keputusan Guard untuk bioreaktor"
    >
      <div className="vl-decision-heading">
        <div>
          <span className="vl-eyebrow">CLOSED LOOP · KEPUTUSAN PENGGUNA</span>
          <h2>Terapkan ke bioreaktor 3D</h2>
        </div>
        <span className="vl-status">
          {paired ? "Kontrol terhubung" : "Akses baca"}
        </span>
      </div>
      <p>
        Keputusan dikonfirmasi pengguna. Dampak kultur terlihat pada pengukuran
        berikutnya. Hasil yang telah dirilis tidak diubah. Jumlah sel adalah
        estimasi ViaMass, bukan pengukuran RBC matang.
      </p>
      {!paired && (
        <div className="vl-pairing-form">
          <label>
            Kode dari layar 3D
            <input
              value={code}
              maxLength={12}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setCode(event.target.value)}
              placeholder="12 karakter kode pairing"
            />
          </label>
          <button
            className="vl-small-button"
            disabled={
              busy || !connected || !/^[a-fA-F0-9]{12}$/.test(code.trim())
            }
            onClick={() => void pair()}
          >
            Hubungkan kontrol Guard
          </button>
        </div>
      )}
      {paired && (
        <button
          className="vl-small-button"
          disabled={busy}
          onClick={() => {
            sessionStorage.removeItem(storageKey)
            setToken("")
            setReview(null)
          }}
        >
          Pasangkan ulang kontrol
        </button>
      )}
      {latest && (
        <p className="vl-decision-source">
          Dasar keputusan: <b>{latest.sample_id}</b> ·{" "}
          {latest.collected_at_hour.toFixed(3)} h · glukosa{" "}
          {latest.channels.glucose_mmol_l} mmol/L · laktat{" "}
          {latest.channels.lactate_mmol_l} mmol/L
        </p>
      )}
      <div className="vl-decision-inputs">
        <label>
          Tindakan simulasi
          <select
            value={presetId}
            disabled={busy || !!snapshot.active_intervention}
            onChange={(event) => {
              setPresetId(event.target.value)
              setReview(null)
            }}
          >
            {interventionPresets.map((item) => (
              <option key={item.id} value={item.id}>
                {snapshot.device_profile ? label(item) : item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Alasan keputusan
          <input
            value={note}
            maxLength={160}
            disabled={busy}
            onChange={(event) => {
              setNote(event.target.value)
              setReview(null)
            }}
          />
        </label>
      </div>
      <p className="vl-decision-assumptions">
        Penambahan medium mengencerkan densitas tanpa membuang sel. Pertukaran
        memakai skid retensi virtual opsional, retensi{" "}
        {snapshot.device_profile ? "98%" : "100%"}, dan volume tetap. Bukan
        fitur bawaan STR atau instruksi alat nyata.
      </p>
      {block && (
        <p className="vl-decision-block" role="status">
          {block}
        </p>
      )}
      <button
        className="vl-small-button"
        disabled={unavailable}
        onClick={() => {
          if (latest) {
            setError("")
            setReview({
              request_id: crypto.randomUUID().replace(/-/g, ""),
              kind: preset.kind,
              amount: preset.amount,
              source_sample_id: latest.sample_id,
              note: note.trim(),
            })
          }
        }}
      >
        Pratinjau keputusan
      </button>
      {review && (
        <div
          className="vl-decision-confirm"
          role="region"
          aria-label="Konfirmasi keputusan"
        >
          <b>
            {snapshot.device_profile
              ? label(review)
              : interventionLabel(review)}
          </b>
          <p>
            {review.source_sample_id} · {review.note}.{" "}
            {review.kind === "feed"
              ? `Volume diperkirakan ${snapshot.working_volume_ml.toFixed(1)} → ${(snapshot.working_volume_ml + review.amount * multiplier).toFixed(1)} mL.`
              : `Tukar ${((snapshot.working_volume_ml * review.amount) / 100).toFixed(1)} mL dengan volume reaktor tetap.`}
          </p>
          <p>
            {snapshot.intervention_protocol.animation_seconds} detik animasi
            mewakili {snapshot.intervention_protocol.culture_minutes} menit
            kultur. Jaga layar 3D terlihat. Transfer medium diterapkan sekali
            setelah animasi selesai.
          </p>
          {!snapshot.device_profile &&
            review.source_sample_id !== latest?.sample_id && (
              <p role="alert">Ada pengukuran baru. Tinjau ulang keputusan.</p>
            )}
          <button
            className="vl-small-button"
            disabled={
              unavailable ||
              (!snapshot.device_profile &&
                review.source_sample_id !== latest?.sample_id)
            }
            onClick={() => void send()}
          >
            Konfirmasi & kirim ke bioreaktor
          </button>
          <button
            className="vl-small-button"
            disabled={busy}
            onClick={() => setReview(null)}
          >
            Kembali meninjau
          </button>
        </div>
      )}
      {snapshot.active_intervention && paired && (
        <button
          className="vl-small-button"
          disabled={busy || !connected}
          onClick={() => void send(snapshot.active_intervention!.id)}
        >
          Batalkan tindakan yang belum selesai
        </button>
      )}
      {error && (
        <p className="vl-error" role="alert">
          {error} Jika izin dicabut, buat kode baru di layar 3D dan pasangkan
          ulang.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <LabInterventionStatus
        items={snapshot.interventions}
        testId="guard-intervention-status"
      />
    </section>
  )
}
