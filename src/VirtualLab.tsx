import { useCallback, useEffect, useRef, useState } from "react"
import LabScene from "./LabScene"
import {
  AnimationClock,
  labSessionFromHash,
  nextLabAction,
  type CultureScenario,
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
  const [scenario, setScenario] = useState<CultureScenario>("balanced")
  const [seed, setSeed] = useState(42)
  const [withdrawal, setWithdrawal] = useState(1)
  const [mixed, setMixed] = useState(true)
  const [station, setStation] = useState<"overview" | "bioreactor" | "flex2">(
    "overview",
  )
  const [graphicsError, setGraphicsError] = useState("")
  const { snapshot, latest, connection, error, command, reconnect } =
    useLabSession(id, token)
  const clock = useRef(new AnimationClock())
  const ready = connection === "connected" && !!snapshot && !!token
  const next = snapshot ? nextLabAction(snapshot.phase) : null
  const validSeed = Number.isInteger(seed) && seed >= 0 && seed <= 2147483647
  const cannotCollect =
    !!snapshot &&
    next === "collect" &&
    (snapshot.culture_hours > snapshot.end_hour ||
      snapshot.assays.length >= 100 ||
      snapshot.working_volume_ml - withdrawal < 400)

  useEffect(() => {
    document.title = "Virtual Lab · HemoForge"
  }, [])
  useEffect(() => {
    const sync = () => {
      const nextId = labSessionFromHash(location.hash)
      setId(nextId)
      setToken(
        nextId
          ? (sessionStorage.getItem(`vl-controller-${nextId}`) ?? undefined)
          : undefined,
      )
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
        body: JSON.stringify({ scenario, seed }),
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
    if (!ready || !next || cannotCollect) return
    if (
      command(next, next === "collect" ? { volume_ml: withdrawal, mixed } : {})
    )
      setStation(next === "collect" ? "bioreactor" : "flex2")
  }

  function exportRun() {
    if (!snapshot) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${snapshot.batch_id}-stage-c.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="virtual-lab">
      <header className="vl-header">
        <a className="vl-brand" href="#">
          H<span>HemoForge</span>
        </a>
        <span className="vl-kicker">VIRTUAL LAB / MONITOR 01</span>
        <span className="vl-stage-label">STAGE C · CULTURE ENGINE</span>
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
            volumeMl={snapshot?.working_volume_ml ?? 500}
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
          <details className="vl-config-disclosure" open={!id}>
            <summary>Pengaturan sesi baru</summary>
            <fieldset
              className="vl-model-config"
              disabled={creating || !!snapshot?.running}
            >
              <legend>Model kultur</legend>
              <label>
                Skenario kultur
                <select
                  value={scenario}
                  onChange={(event) =>
                    setScenario(event.target.value as CultureScenario)
                  }
                >
                  <option value="balanced">Nutrisi seimbang</option>
                  <option value="nutrient_limited">Nutrisi terbatas</option>
                  <option value="metabolite_stress">Stres metabolit</option>
                </select>
              </label>
              <label>
                Seed pengukuran
                <input
                  type="number"
                  min={0}
                  max={2147483647}
                  step={1}
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value))}
                />
              </label>
              <small>
                Berlaku saat membuat sesi. Skenario, seed, volume dan jadwal
                sampling yang sama menghasilkan pengukuran yang dapat diulang.
              </small>
            </fieldset>
          </details>
          {!id ? (
            <button
              className="vl-primary"
              disabled={creating || !validSeed}
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
                      snapshot &&
                      snapshot.culture_hours >= snapshot.end_hour &&
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
          {snapshot && (
            <div className="vl-volume-card" data-testid="lab-volume">
              <span className="vl-eyebrow">
                NERACA VOLUME · {snapshot.scenario}
              </span>
              <strong>
                {snapshot.working_volume_ml.toFixed(1)} mL tersisa
              </strong>
              <p>
                {snapshot.withdrawn_volume_ml.toFixed(1)} mL telah diambil ·
                seed {snapshot.seed}
              </p>
              <p>
                Sel dan zat terlarut ikut terambil. Count di Guard = densitas
                terukur × volume reaktor setelah sampling.
              </p>
            </div>
          )}
          <fieldset
            className="vl-model-config"
            disabled={
              !ready ||
              snapshot?.phase === "analyzing" ||
              snapshot?.phase === "collected" ||
              snapshot?.phase === "loaded"
            }
          >
            <legend>Persiapan sampel berikutnya</legend>
            <label>
              Volume yang diambil
              <select
                value={withdrawal}
                onChange={(event) => setWithdrawal(Number(event.target.value))}
              >
                <option value={1}>1 mL · standar demo</option>
                <option value={3}>3 mL · pengambilan lebih besar</option>
                <option value={0.1}>0,1 mL · uji sampel kurang</option>
              </select>
            </label>
            <label className="vl-check-label">
              <input
                type="checkbox"
                checked={mixed}
                onChange={(event) => setMixed(event.target.checked)}
              />
              Sampel sudah dihomogenkan
            </label>
            <small>
              Assay virtual membutuhkan 0,275 mL. Sisa aliquot tidak
              dikembalikan ke reaktor. Sampel kurang atau belum homogen ditolak
              oleh QC edukatif.
            </small>
          </fieldset>
          <details className="vl-config-disclosure">
            <summary>Alur sampling & FLEX2</summary>
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
                  `${snapshot?.protocol.animation_seconds ?? 8} detik animasi · ${snapshot?.protocol.culture_minutes ?? 4.5} menit kultur`,
                  snapshot?.phase === "loaded" ||
                    snapshot?.phase === "analyzing",
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
          </details>
          <button
            className="vl-primary vl-action"
            disabled={!ready || !next || !!graphicsError || cannotCollect}
            onClick={interact}
          >
            {snapshot?.phase === "analyzing"
              ? "FLEX2 sedang menganalisis…"
              : cannotCollect
                ? "Batas sesi tercapai · buat sesi baru"
                : next && next in actionLabels
                  ? actionLabels[(next as keyof typeof actionLabels)]
                  : "Buat sesi untuk mulai"}
          </button>
          {snapshot?.phase === "analyzing" && (
            <div className="vl-assay-progress" role="status">
              <span>
                {
                  {
                    aspiration: "Aspirasi sampel",
                    chemistry: "Panel kimia",
                    cell_count: "Hitung sel dan viabilitas",
                    quality_review: "Pemeriksaan kualitas",
                    complete: "Selesai",
                    idle: "Siap",
                  }[snapshot.assay_stage]
                }
              </span>
              <progress
                aria-label="Kemajuan assay FLEX2"
                max={1}
                value={snapshot.analysis_progress}
              />
            </div>
          )}
          <div className="vl-reading-summary" role="status">
            <span className="vl-eyebrow">PUBLISHED MEASUREMENTS</span>
            <strong data-testid="lab-result-count">
              {snapshot?.measurements.length ?? 0} sampel
            </strong>
            {snapshot && (
              <p>
                {snapshot.assays.length} assay selesai ·{" "}
                {
                  snapshot.assays.filter(
                    (report) => report.quality.status === "rejected",
                  ).length
                }{" "}
                ditolak QC
              </p>
            )}
            <p>
              {snapshot?.reason ?? "Buat sesi, buka Guard, lalu ikuti panah."}
            </p>
            {snapshot?.measurements.at(-1) && (
              <p>
                {snapshot.measurements.at(-1)!.sample_id} ·{" "}
                {snapshot.measurements.at(-1)!.count.toFixed(2)} juta sel viabel
              </p>
            )}
            {snapshot?.assays.at(-1)?.quality.status === "rejected" && (
              <p className="vl-error" data-testid="lab-qc-rejection">
                {snapshot.assays.at(-1)!.sample_id}:{" "}
                {snapshot.assays.at(-1)!.quality.flags.join(", ")}. Ambil sampel
                baru dengan persiapan yang sesuai.
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
                <button disabled={!snapshot} onClick={exportRun}>
                  Unduh audit JSON
                </button>
                <button
                  disabled={creating || !validSeed}
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
            Model kultur dan variasi pengukuran adalah asumsi edukatif, belum
            dikalibrasi untuk BEL-A atau akurasi Nova. FLEX2 dan bioreaktor
            berupa representasi virtual. Sesi disimpan di memori API; restart
            menghapusnya. Tidak ada panggilan NVIDIA atau LLM.
          </p>
        </aside>
      </main>
    </div>
  )
}
