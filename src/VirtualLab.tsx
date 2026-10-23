import { useCallback, useEffect, useRef, useState } from "react"
import BiostatScene from "./BiostatScene"
import BiostatTelemetry from "./BiostatTelemetry"
import LabControlPanel from "./LabControlPanel"
import LabInterventionStatus from "./LabInterventionStatus"
import {
  AnimationClock,
  labSessionFromHash,
  pocLabHash,
  pocMonitorHash,
  type CultureScenario,
} from "./lab-session"
import useLabSession from "./use-lab-session"
import "./virtual-lab.css"

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
  const [station, setStation] =
    useState<"overview" | "bioreactor" | "trace" | "viamass">("overview")
  const [graphicsError, setGraphicsError] = useState("")
  const [assetState, setAssetState] = useState<"loading" | "blender" | "fallback">("loading")
  const [renderStats, setRenderStats] = useState({ fps: 0, quality: "high" as "high" | "balanced" })
  const onPerformance = useCallback((fps: number, quality: "high" | "balanced") => setRenderStats({ fps, quality }), [])
  const [setpoints, setSetpoints] = useState({
    ph_setpoint: 7.3,
    do_setpoint: 40,
    temperature_setpoint: 37,
  })
  const { snapshot, latest, connection, error, command, reconnect } =
    useLabSession(id, token)
  const clock = useRef(new AnimationClock())
  const attemptedIntervention = useRef<string | null>(null)
  const ready = connection === "connected" && !!snapshot && !!token
  const validSeed = Number.isInteger(seed) && seed >= 0 && seed <= 2147483647
  useEffect(() => {
    document.title = "BIOSTAT Gen 2 · Monitor 01 · HemoForge"
  }, [])
  useEffect(() => {
    attemptedIntervention.current = null
  }, [connection, id])
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
        body: JSON.stringify({
          scenario,
          seed,
          device_profile: "biostat-str-gen2",
        }),
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
      location.hash = pocLabHash(value.session_id)
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
      const intervention = latest.current?.active_intervention
      if (
        intervention?.status === "queued" &&
        document.visibilityState === "visible" &&
        attemptedIntervention.current !== intervention.id &&
        command("execute", { intervention_id: intervention.id })
      ) {
        attemptedIntervention.current = intervention.id
        clock.current.reset()
        setStation("bioreactor")
      }
      const seconds = clock.current.frame(
        delta,
        ready && !!latest.current?.running && document.visibilityState === "visible",
      )
      if (seconds) command("advance", { seconds })
    },
    [command, latest, ready],
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
  function exportRun() {
    if (!snapshot) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    )
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${snapshot.batch_id}-biostat.json`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const canRun =
    ready &&
    !graphicsError &&
    snapshot!.active_intervention?.status !== "queued" &&
    (snapshot!.culture_hours < snapshot!.end_hour ||
      snapshot!.phase === "intervening")
  const validSetpoints =
    Number.isFinite(setpoints.ph_setpoint) &&
    setpoints.ph_setpoint >= 6.8 &&
    setpoints.ph_setpoint <= 7.6 &&
    Number.isFinite(setpoints.do_setpoint) &&
    setpoints.do_setpoint >= 20 &&
    setpoints.do_setpoint <= 60 &&
    Number.isFinite(setpoints.temperature_setpoint) &&
    setpoints.temperature_setpoint >= 35 &&
    setpoints.temperature_setpoint <= 38
  return (
    <div className="virtual-lab biostat-lab">
      <header className="vl-header">
        <a className="vl-brand" href="#poc">
          H<span>HemoForge</span>
        </a>
        <span className="vl-kicker">BIOSTAT STR GEN 2 / MONITOR 01</span>
        <a className="vl-stage-label" href="#poc">
          PoC & Simulation ↗
        </a>
      </header>
      <main className="vl-layout">
        <section
          className="vl-stage"
          aria-label="Laboratorium BIOSTAT 3D orang pertama"
        >
          <BiostatScene
            station={station}
            snapshot={snapshot}
            connected={ready}
            onAssetState={setAssetState}
            onPerformance={onPerformance}
            onFrame={onFrame}
            onInteract={() => {
              if (canRun) command(snapshot?.running ? "pause" : "play")
            }}
            onError={setGraphicsError}
          />
          <div className="vl-scene-top">
            <span className="vl-room-label">
              CELL CULTURE / SINGLE-USE STR 50
            </span>
            <span className="vl-scene-evidence">
              {assetState === "blender" ? "BLENDER MODEL · ORIGINAL CC0 MATERIALS" : assetState === "loading" ? "LOADING BLENDER MODEL…" : "PROCEDURAL FALLBACK · MODEL UNAVAILABLE"}
            </span>
          </div>
          <div className="vl-scene-caption">
            <small>CONNECTED BIOPROCESS LAB</small>
            <h1>Inside the process.</h1>
            <p>BIOSTAT Gen 2 + BioPAT Trace + ViaMass</p>
          </div>
          <div className="biostat-scene-legend">
            <span>
              <i /> Gas & DO cascade
            </span>
            <span>
              <i /> Trace fluid circuit
            </span>
            <span>
              <i /> Feed / retention skid
            </span>
            <small>
              Illustrative cutaway · geometry is not a certified device replica
            </small>
            <small aria-live="off">
              {renderStats.fps > 0 ? `${renderStats.fps} FPS · ${renderStats.quality === "high" ? "High" : "Balanced"} quality` : "Measuring render performance…"}
            </small>
          </div>
          <div className="vl-station-nav" aria-label="Posisi kamera">
            {(["overview", "bioreactor", "trace", "viamass"] as const).map(
              (value, i) => (
                <button
                  key={value}
                  aria-pressed={station === value}
                  onClick={() => setStation(value)}
                >
                  <span>0{i + 1}</span>
                  {["Ruangan", "BIOSTAT STR", "BioPAT Trace", "ViaMass"][i]}
                </button>
              ),
            )}
          </div>
          <div className="vl-camera-hint">
            Drag untuk melihat sekitar · panah mengaktifkan / menjeda kultur ·
            waktu hanya maju setelah frame dirender
          </div>
          {graphicsError && (
            <div role="alert" className="vl-graphics-error">
              {graphicsError}
              <br />
              Aktifkan WebGL. Jam kultur dijeda.
            </div>
          )}
        </section>
        <aside className="vl-control-panel">
          <div className="vl-panel-heading">
            <span className="vl-eyebrow">ONLINE PROCESS MONITORING</span>
            <h2>One culture. Live signals.</h2>
            <p>
              Mulai kultur; sensor inti, Trace, dan ViaMass mengirim hasil
              otomatis. Tidak ada langkah sampling FLEX2.
            </p>
          </div>
          <div className="vl-session-row">
            <span className={`vl-status ${ready ? "is-online" : ""}`}>
              {id ? connection : "Belum ada sesi"}
            </span>
            <span>{snapshot?.batch_id ?? "Local only"}</span>
          </div>
          <div className="vl-clock">
            <span>WAKTU KULTUR · {snapshot?.stage ?? "expansion"} MODEL</span>
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
          {!id && (
            <>
              <fieldset className="vl-model-config" disabled={creating}>
                <legend>Profil sesi baru · STR 50 Gen 2</legend>
                <label>
                  Skenario kultur
                  <select
                    value={scenario}
                    onChange={(e) =>
                      setScenario(e.target.value as CultureScenario)
                    }
                  >
                    <option value="balanced">Nutrisi seimbang</option>
                    <option value="nutrient_limited">Nutrisi terbatas</option>
                    <option value="metabolite_stress">Stres metabolit</option>
                  </select>
                </label>
                <label>
                  Seed sensor
                  <input
                    type="number"
                    min={0}
                    max={2147483647}
                    step={1}
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                  />
                </label>
                <small>
                  Volume awal 12,5 L · kapasitas profil 50 L. Kinetika, waktu
                  sensor, dan transisi fase adalah asumsi edukatif.
                </small>
              </fieldset>
              <button
                className="vl-primary"
                disabled={creating || !validSeed}
                onClick={() => void createSession()}
              >
                {creating ? "Menghubungkan…" : "Buat sesi BIOSTAT →"}
              </button>
            </>
          )}
          {id && (
            <>
              <a
                className="vl-primary"
                data-testid="open-live-guard"
                href={pocMonitorHash(id)}
                target="_blank"
                rel="noopener"
              >
                Buka dashboard di monitor 2 ↗
              </a>
              <p className="vl-footnote">
                Pindahkan jendela baru ke monitor kedua dan biarkan kedua
                jendela terlihat. Menyembunyikan tab 3D menjeda kultur.
              </p>
              <div className="vl-clock-controls">
                <button
                  disabled={!canRun}
                  onClick={() => command(snapshot?.running ? "pause" : "play")}
                >
                  {snapshot?.running ? "Ⅱ Pause" : "▶ Mulai / lanjutkan"}
                </button>
                <label>
                  Kecepatan kultur
                  <select
                    aria-label="Kecepatan kultur"
                    disabled={!ready || !!snapshot?.active_intervention}
                    value={snapshot?.speed ?? 0.25}
                    onChange={(e) =>
                      command("speed", { speed: Number(e.target.value) })
                    }
                  >
                    <option value={0.05}>0,05 h / detik</option>
                    <option value={0.25}>0,25 h / detik</option>
                    <option value={1}>1 h / detik</option>
                    <option value={6}>6 h / detik · cepat</option>
                    <option value={12}>12 h / detik · cepat</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {snapshot && (
            <>
              <BiostatTelemetry snapshot={snapshot} compact />
              <form
                className="vl-model-config"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (validSetpoints) command("setpoints", setpoints)
                }}
              >
                <fieldset disabled={!ready || !!snapshot.active_intervention}>
                  <legend>Setpoint controller virtual · AUTO</legend>
                  {([
                    ["ph_setpoint", "pH", 6.8, 7.6, 0.05],
                    ["do_setpoint", "DO (% air sat.)", 20, 60, 1],
                    ["temperature_setpoint", "Temperatur (°C)", 35, 38, 0.1],
                  ] as const).map(([key, label, min, max, step]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={setpoints[key]}
                        onChange={(e) =>
                          setSetpoints({
                            ...setpoints,
                            [key]: Number(e.target.value),
                          })
                        }
                        required
                      />
                    </label>
                  ))}
                  <button
                    className="vl-small-button"
                    disabled={!validSetpoints}
                  >
                    Terapkan setpoint virtual
                  </button>
                  <small>
                    Batas adalah batas skenario edukatif, bukan resep kultur
                    atau spesifikasi Sartorius.
                  </small>
                </fieldset>
              </form>
              <details className="vl-config-disclosure">
                <summary>Jadwal sensor & uji gangguan</summary>
                <p className="vl-assay-context">
                  Sensor inti setiap 0,5 h; ViaMass setiap 1 h, jeda 0,02 h;
                  Trace setiap 2 h, jeda 0,1 h kultur. Jadwal dipercepat untuk
                  demo, bukan spesifikasi vendor. Tunggu jadwal berikutnya
                  setelah uji gangguan.
                </p>
                {(["core", "trace", "viamass"] as const).map((sensor) => (
                  <button
                    key={sensor}
                    className="vl-small-button"
                    disabled={!ready}
                    onClick={() => command("sensor_fault", { sensor })}
                  >
                    {snapshot.sensor_faults?.includes(sensor)
                      ? "Pulihkan"
                      : "Uji fault"}{" "}
                    {sensor}
                  </button>
                ))}
              </details>
              <div className="vl-volume-card" data-testid="lab-volume">
                <span className="vl-eyebrow">NERACA VOLUME</span>
                <strong>
                  {(snapshot.working_volume_ml / 1000).toFixed(3)} L
                </strong>
                <p>
                  {(snapshot.added_volume_ml / 1000).toFixed(3)} L ditambahkan ·{" "}
                  {(snapshot.exchanged_volume_ml / 1000).toFixed(3)} L ditukar.
                </p>
                <p>
                  Trace: loop dialisis tertutup tanpa penarikan volume bersih.
                  Skid retensi virtual opsional: retensi sel 98%, bukan bagian
                  bawaan STR atau data tervalidasi.
                </p>
              </div>
              {token && (
                <LabControlPanel
                  key={id}
                  id={id!}
                  token={token}
                  ready={ready}
                  paired={snapshot.operator_paired}
                />
              )}
              <LabInterventionStatus
                items={snapshot.interventions}
                testId="lab-intervention-status"
              />
              <p className="vl-assay-context" data-testid="lab-result-count">
                {snapshot.sensor_readings?.length ?? 0} keluaran sensor ·{" "}
                {snapshot.measurements.length} estimasi ViaMass dipublikasikan.
              </p>
              <p className="vl-assay-context" role="status">
                {snapshot.reason}
              </p>
            </>
          )}
          {(createError || error) && (
            <p role="alert" className="vl-error">
              {createError || error}
            </p>
          )}
          <div className="vl-secondary-actions">
            {id && <button onClick={reconnect}>Sambungkan ulang</button>}
            <button disabled={!snapshot} onClick={exportRun}>
              Unduh bukti sesi
            </button>
            <a href="#poc/lab">Sesi baru</a>
            <a href="/VIRTUAL_LAB.md" target="_blank" rel="noopener">
              Panduan & sumber
            </a>
          </div>
          <p className="vl-footnote">
            PoC lokal dan aset gratis. Model belum dikalibrasi biologis atau
            untuk skala BIOSTAT. Sesi hilang saat API restart. Tidak ada alat
            fisik, NVIDIA, LLM, atau layanan berbayar yang dipanggil.
          </p>
        </aside>
      </main>
    </div>
  )
}
