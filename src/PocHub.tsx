import { useEffect, useState } from "react"
import PocShell from "./PocShell"
import { Badge, PageTitle, Panel } from "./workspace-ui"
import {
  labSessionFromHash,
  pocMonitorHash,
  sessionPattern,
} from "./lab-session"

export default function PocHub({ invalid = false }: { invalid?: boolean }) {
  const [reference, setReference] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    document.title = "PoC & Simulation · HemoForge"
  }, [])
  function join(event: React.FormEvent) {
    event.preventDefault()
    const value = reference.trim()
    let id = sessionPattern.test(value) ? value : null
    try {
      id ??= labSessionFromHash(new URL(value, location.origin).hash)
    } catch {
      /* Invalid input stays local. */
    }
    if (!id) {
      setError(
        "Masukkan ID sesi 32 karakter atau tautan monitor dari Virtual Lab.",
      )
      return
    }
    location.hash = pocMonitorHash(id)
  }
  return (
    <PocShell>
      <PageTitle
        title="PoC & Simulation"
        description="A dedicated space to demonstrate HemoForge with a virtual laboratory and a live dashboard."
        action={<Badge tone="warning">Local simulation</Badge>}
      />
      {invalid && (
        <p className="import-error" role="alert">
          Tautan simulasi tidak valid. Mulai sesi atau hubungkan Monitor 02 di
          bawah.
        </p>
      )}
      <div className="poc-intro">
        <span className="badge tone-brand">TWO MONITORS · ONE SESSION</span>
        <h2>Run the lab. Follow the evidence.</h2>
        <p>
          Monitor 01 menjalankan kultur, sampling, dan FLEX2. Monitor 02
          menggunakan hasilnya di Dashboard, Bioreactor Guard, ErythroPilot, dan
          CulturePlan.
        </p>
      </div>
      <div className="poc-launch-grid">
        <Panel
          title="Monitor 01 · Virtual Lab"
          caption="Create and control a 3D simulation"
        >
          <div className="poc-launch-body">
            <div className="poc-screen-preview is-lab">
              <span>01</span>
              <div className="poc-vessel">
                <i />
                <i />
                <i />
              </div>
              <b>Culture → sample → FLEX2</b>
            </div>
            <p>
              Pilih skenario, buat sesi, lalu jalankan proses di laboratorium
              3D. Buka tautan dashboard sesi tersebut pada monitor kedua.
            </p>
            <a className="button primary" href="#poc/lab">
              Buka Monitor 01 →
            </a>
          </div>
        </Panel>
        <Panel
          title="Monitor 02 · Live Dashboard"
          caption="Connect to an existing simulation session"
        >
          <div className="poc-launch-body">
            <div className="poc-screen-preview is-dashboard">
              <span>02</span>
              <div className="poc-preview-cards">
                <i />
                <i />
                <i />
              </div>
              <b>Dashboard · Guard · Pilot · Plan</b>
            </div>
            <form onSubmit={join}>
              <label className="number-field">
                ID atau tautan sesi
                <input
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value)
                    setError("")
                  }}
                  placeholder="Tempel tautan dari Monitor 01"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={250}
                />
              </label>
              <button className="button primary" disabled={!reference.trim()}>
                Hubungkan Monitor 02 →
              </button>
              {error && (
                <p className="import-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </div>
        </Panel>
      </div>
      <Panel title="How to run the PoC">
        <ol className="poc-steps">
          <li>
            Buka Monitor 01 dan buat sesi. Tidak ada sesi dibuat sebelum Anda
            memilihnya.
          </li>
          <li>
            Klik <b>Buka dashboard di monitor 2</b>, lalu pindahkan jendela
            dashboard ke monitor kedua.
          </li>
          <li>
            Jaga laboratorium 3D terlihat. Hasil FLEX2 yang lolos QC muncul
            otomatis di Monitor 02.
          </li>
          <li>
            Pasangkan Guard hanya bila ingin menguji tindakan pada bioreaktor
            virtual.
          </li>
        </ol>
        <p className="panel-note">
          Data simulasi berada dalam sesi tersendiri. Impor dan dashboard utama
          HemoForge tetap menggunakan workspace masing-masing. PoC saat ini
          berjalan di localhost; sesi hilang saat API dimulai ulang. Tidak ada
          alat fisik atau inferensi berbayar yang dipanggil.
        </p>
      </Panel>
    </PocShell>
  )
}
