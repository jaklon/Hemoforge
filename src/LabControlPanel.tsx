import { useState } from "react"
import { labControlRequest } from "./lab-interventions"

export default function LabControlPanel({
  id,
  token,
  ready,
  paired,
}: {
  id: string
  token: string
  ready: boolean
  paired: boolean
}) {
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function control(revoke: boolean) {
    setBusy(true)
    setError("")
    try {
      const value = await labControlRequest(
        id,
        revoke ? "revoke-operator" : "pairing",
        "controller",
        token,
      )
      setCode(revoke ? "" : value.code)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Kontrol tidak dapat dihubungkan.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="vl-pairing-panel" aria-label="Otorisasi kontrol Guard">
      <span className="vl-eyebrow">KONTROL MONITOR 2</span>
      <p>
        {paired
          ? "Guard sudah dipasangkan untuk mengirim keputusan."
          : "Tautan monitor memberi akses baca. Pasangkan Guard untuk mengirim keputusan."}
      </p>
      <button
        className="vl-small-button"
        disabled={!ready || busy}
        onClick={() => void control(false)}
      >
        Buat kode pairing Guard
      </button>
      {code && (
        <label>
          Kode pairing Guard
          <input readOnly value={code} spellCheck={false} autoComplete="off" />
          <small>
            Masukkan di panel keputusan Guard. Sekali pakai, berlaku 2 menit.
            Kode memberi izin tindakan untuk sesi ini.
          </small>
        </label>
      )}
      {(paired || code) && (
        <button
          className="vl-small-button"
          disabled={!ready || busy}
          onClick={() => void control(true)}
        >
          Cabut izin kontrol Guard
        </button>
      )}
      {error && (
        <p role="alert" className="vl-error">
          {error}
        </p>
      )}
    </section>
  )
}
