import { useCallback, useEffect, useRef, useState } from "react"
import LabScene from "./LabScene"
import {
  AnimationClock,
  labSessionFromHash,
  nextLabAction,
} from "./lab-session"
import useLabSession from "./use-lab-session"
import "./virtual-lab.css"

const actionLabels = {
  collect: "Ambil sampel →",
  load: "Masukkan ke FLEX2 →",
  analyze: "Mulai analisis FLEX2 →",
}

export default function VirtualLab() {
  const [id, setId] = useState(() => labSessionFromHash(location.hash))
  const [token, setToken] = useState(() =>
    id
      ? (sessionStorage.getItem(`vl-controller-${id}`) ?? undefined)
      : undefined,
  )
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [station, setStation] = useState<"overview" | "bioreactor" | "flex2">(
    "overview",
  )
  const [graphicsError, setGraphicsError] = useState("")
  const { snapshot, latest, connection, error, command, reconnect } =
    useLabSession(id, token)
  const clock = useRef(new AnimationClock())
  const ready = connection === "connected" && !!snapshot && !!token
  const next = snapshot ? nextLabAction(snapshot.phase) : null

  useEffect(() => {
    document.title = "Virtual Lab · HemoForge"
  }, [])
  useEffect(() => {
    const sync = () => {
      const nextId = labSessionFromHash(location.hash)
      setId(nextId)
      setToken(nextId ? sessionStorage.getItem(`vl-controller-${nextId}`) ?? undefined : undefined)
    }
    addEventListener("hashchange", sync)
    return () => removeEventListener("hashchange", sync)
  }, [])

  async function createSession() {
    setCreating(true)
    setCreateError("")
    try {
      const response = await fetch("/api/v1/lab/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-HemoForge-Action": "virtual-lab",
        },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      })
      const value = await response.json()
      if (!response.ok)
        throw new Error(value.detail ?? "Could not create a local session.")
      sessionStorage.setItem(
        `vl-controller-${value.session_id}`,
        value.controller_token,
      )
      clock.current.reset()
      setToken(value.controller_token)
      setId(value.session_id)
      location.hash = `lab/${value.session_id}`
    } catch (failure) {
      setCreateError(
        failure instanceof Error
          ? failure.message
          : "Start the local Python API and retry.",
      )
    } finally {
      setCreating(false)
    }
  }

  const onFrame = useCallback(
    (delta: number) => {
      const active =
        !!latest.current?.running && document.visibilityState === "visible"
      const seconds = clock.current.frame(delta, active)
      if (seconds) command("advance", { seconds })
    },
    [command, latest],
  )

  useEffect(() => {
    const hidden = () => {
      clock.current.reset()
      if (document.visibilityState === "hidden") command("pause")
    }
    document.addEventListener("visibilitychange", hidden)
    return () => document.removeEventListener("visibilitychange", hidden)
  }, [command])

  useEffect(() => {
    if (graphicsError) command("pause")
  }, [graphicsError, command])

  function interact() {
    if (!ready || !next) return
    if (command(next)) setStation(next === "collect" ? "bioreactor" : "flex2")
  }

  return (
    <div className="virtual-lab">
      <header className="vl-header">
        <a className="vl-brand" href="#">
          H<span>HemoForge</span>
        </a>
        <span className="vl-kicker">VIRTUAL LAB / MONITOR 01</span>
        <span className="vl-stage-label">STAGE A + B · PROTOTYPE</span>
      </header>
      <main className="vl-layout">
        <section
          className="vl-stage"
          aria-label="Laboratorium 3D orang pertama"
        >
          <LabScene
            onFrame={onFrame}
            onInteract={interact}
            onError={setGraphicsError}
            station={station}
            phase={snapshot?.phase ?? "idle"}
            running={snapshot?.running ?? false}
            progress={snapshot?.analysis_progress ?? 0}
          />
          <div className="vl-scene-top">
            <span className="vl-room-label">HEMOFORGE / CULTURE LAB 01</span>
            <span className="vl-scene-evidence">
              SYNTHETIC TRAINING ENVIRONMENT
            </span>
          </div>
          <div className="vl-scene-caption">
            <h1>
              From culture
              <br />
              to insight.
            </h1>
            <p>Bioreaktor → sampel → FLEX2 → Guard</p>
          </div>
          <div className="vl-station-nav" aria-label="Posisi kamera">
            {(["overview", "bioreactor", "flex2"] as const).map(
              (value, index) => (
                <button
                  key={value}
                  aria-pressed={station === value}
                  onClick={() => setStation(value)}
                >
                  <span>0{index + 1}</span>
                  {["Ruangan", "Bioreaktor", "FLEX2"][index]}
                </button>
              ),
            )}
          </div>
          <div className="vl-camera-hint">
            Drag untuk melihat sekitar · klik panah di alat untuk langkah
            berikutnya
          </div>
          {graphicsError && (
            <div role="alert" className="vl-graphics-error">
              {graphicsError}
              <br />
              Gunakan browser dengan WebGL aktif. Waktu simulasi berhenti.
            </div>
          )}
        </section>
        <aside className="vl-control-panel">
          <div className="vl-panel-heading">
            <span className="vl-eyebrow">CONNECTED LABORATORY</span>
            <h2>Jalankan satu siklus.</h2>
            <p>
              Monitor pertama menjalankan proses. Monitor kedua membaca hasil
              pengukuran.
            </p>
          </div>
          <div className="vl-session-row">
            <span className={`vl-status ${ready ? "is-online" : ""}`}>
              {id ? connection : "Belum ada sesi"}
            </span>
            <span>{snapshot?.batch_id ?? "Local session"}</span>
          </div>
          <div className="vl-clock">
            <span>WAKTU KULTUR</span>
            <strong data-testid="lab-hour">
              {snapshot?.culture_hours.toFixed(3) ?? "0.000"}
              <small>h</small>
            </strong>
            <span>
              {snapshot?.running
                ? "Mengikuti animasi 3D"
                : "Paused · tidak ada waktu yang maju"}
            </span>
          </div>
          {!id ? (
            <button
              className="vl-primary"
              disabled={creating}
              onClick={() => void createSession()}
            >
              {creating ? "Menghubungkan…" : "Buat sesi simulasi →"}
            </button>
          ) : (
            <>
              <a
                className="vl-primary"
                href={`#guard/live/${id}`}
                target="_blank"
                rel="noopener"
                data-testid="open-live-guard"
              >
                Buka Guard di monitor 2 ↗
              </a>
              <div className="vl-clock-controls">
                <button
                  disabled={
                    !ready ||
                    !!graphicsError ||
                    snapshot?.phase === "collected" ||
                    snapshot?.phase === "loaded" ||
                    (!snapshot?.running &&
                      snapshot?.culture_hours === snapshot?.end_hour &&
                      snapshot?.phase !== "analyzing")
                  }
                  onClick={() => command(snapshot?.running ? "pause" : "play")}
                >
                  {snapshot?.running ? "Ⅱ Pause" : "▶ Lanjutkan waktu"}
                </button>
                <label>
                  Kecepatan
                  <select
                    aria-label="Kecepatan kultur"
                    value={snapshot?.speed ?? 6}
                    disabled={!ready || snapshot?.phase === "analyzing"}
                    onChange={(event) =>
                      command("speed", { speed: Number(event.target.value) })
                    }
                  >
                    <option value={1}>1 h / detik</option>
                    <option value={6}>6 h / detik</option>
                    <option value={12}>12 h / detik</option>
                  </select>
                </label>
              </div>
            </>
          )}
          <ol className="vl-workflow">
            {[
              [
                "Ambil sampel",
                "Bioreaktor · pengamatan dibekukan saat sampling",
                snapshot?.phase === "idle" || snapshot?.phase === "complete",
              ],
              [
                "Masukkan ke FLEX2",
                "Tangan membawa sampel ke analyzer",
                snapshot?.phase === "collected",
              ],
              [
                "Jalankan analisis",
                "5 detik animasi · interval kultur ilustratif 4,5 menit",
                snapshot?.phase === "loaded" || snapshot?.phase === "analyzing",
              ],
              [
                "Lihat hasil di Guard",
                "Pengukuran baru dirilis setelah assay selesai",
                snapshot?.phase === "complete",
              ],
            ].map(([title, detail, active], index) => (
              <li key={String(title)} className={active ? "is-active" : ""}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            className="vl-primary vl-action"
            disabled={!ready || !next || !!graphicsError}
            onClick={interact}
          >
            {snapshot?.phase === "analyzing"
              ? "FLEX2 sedang menganalisis…"
              : next && next in actionLabels
                ? actionLabels[(next as keyof typeof actionLabels)]
                : "Buat sesi untuk mulai"}
          </button>
          {snapshot?.phase === "analyzing" && (
            <progress
              aria-label="Kemajuan assay FLEX2"
              max={1}
              value={snapshot.analysis_progress}
            />
          )}
          <div className="vl-reading-summary" role="status">
            <span className="vl-eyebrow">PUBLISHED MEASUREMENTS</span>
            <strong data-testid="lab-result-count">
              {snapshot?.measurements.length ?? 0} sampel
            </strong>
            <p>
              {snapshot?.reason ?? "Buat sesi, buka Guard, lalu ikuti panah."}
            </p>
            {snapshot?.measurements.at(-1) && (
              <p>
                {snapshot.measurements.at(-1)!.sample_id} ·{" "}
                {snapshot.measurements.at(-1)!.count.toFixed(2)} juta sel viabel
              </p>
            )}
          </div>
          {(error || createError) && (
            <p className="vl-error" role="alert">
              {createError || error}
            </p>
          )}
          {id && !token && (
            <p className="vl-error">
              Kontrol hanya tersedia di tab pembuat sesi. Buat sesi baru di
              sini.
            </p>
          )}
          <div className="vl-secondary-actions">
            {id && (
              <>
                <button onClick={reconnect}>Reconnect</button>
                <button
                  disabled={creating}
                  onClick={() => void createSession()}
                >
                  Sesi baru
                </button>
              </>
            )}
            <a href="/VIRTUAL_LAB.md" target="_blank" rel="noopener">
              Panduan & batasan
            </a>
          </div>
          <p className="vl-footnote">
            Model edukatif belum dikalibrasi. FLEX2 dan bioreaktor berupa
            representasi virtual. Sesi disimpan di memori API; restart
            menghapusnya. Tidak ada panggilan NVIDIA atau LLM.
          </p>
        </aside>
      </main>
    </div>
  )
}
