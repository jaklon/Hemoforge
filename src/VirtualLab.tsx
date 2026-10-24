import { useCallback, useEffect, useRef, useState } from "react"
import BiostatScene, { type FpsStatus, type LabAsset, type LabAssetState } from "./BiostatScene"
import { instrumentPresentation } from "./biopat-instrument"
import { canInspect } from "./operator-hands"
import BiostatTelemetry from "./BiostatTelemetry"
import ProcessMotionPanel from "./ProcessMotionPanel"
import TransferReadout from "./TransferReadout"
import LabAlerts from "./LabAlerts"
import LabNotifications from "./LabNotifications"
import LabAmbience from "./LabAmbience"
import ScenarioPanel from "./ScenarioPanel"
import DatasetPanel from "./DatasetPanel"
import SavedDatasets from "./SavedDatasets"
import type {DatasetStatus} from "./lab-session"
import {alarmPresentation} from "./lab-alerts"
import { transferPresentation, transferFrameDelta } from "./transfer-visual"
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
  const [executionMode,setExecutionMode]=useState<"dataset"|"guided">("dataset")
  const [savedDatasets,setSavedDatasets]=useState<DatasetStatus[]>([])
  const loadDatasets=useCallback(()=>{void fetch('/api/v1/lab/datasets').then(r=>r.ok?r.json():{campaigns:[]}).then(v=>setSavedDatasets(v.campaigns??[])).catch(()=>{})},[])
  useEffect(()=>{if(!id)loadDatasets()},[id,loadDatasets])
  const [station, setStation] =
    useState<"overview" | "bioreactor" | "trace" | "viamass" | "transfer">("overview")
  const [graphicsError, setGraphicsError] = useState("")
  const [expandedScene, setExpandedScene] = useState(false)
  const [slowTransfers, setSlowTransfers] = useState(true)
  const [inspectionRequest, setInspectionRequest] = useState(0)
  const [handState, setHandState] = useState("Siap")
  const [walkMode, setWalkMode] = useState(false)
  const [resetWalkRequest, setResetWalkRequest] = useState(0)
  const [navigation, setNavigation] = useState<FpsStatus>({ locked: false, dragOnly: false, target: "overview", inRange: false, hint: "Klik ruangan untuk kendali mouse" })
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  const [assetState, setAssetState] = useState<Record<LabAsset, LabAssetState>>({ biostat: "loading", trace: "loading", viamass: "loading", laboratory: "loading", hands: "loading" })
  const onAssetState = useCallback((asset: LabAsset, state: LabAssetState) => setAssetState(previous => previous[asset] === state ? previous : { ...previous, [asset]: state }), [])
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
  const displayReady=connection==="connected"&&!!snapshot
  const transferView = transferPresentation(snapshot,displayReady)
  const alarmView=alarmPresentation(snapshot,displayReady)
  const showAlarm=alarmView.current.length>0
  const blenderCount = Object.values(assetState).filter(value => value === "blender").length
  const fallbackAssets = Object.entries(assetState).filter(([,value]) => value === "fallback").map(([name]) => name).join(", ")
  const inspectionStation = walkMode ? navigation.target : station === "transfer" ? "overview" : station
  const showTransfer = !!transferView && (station === "transfer" || !!snapshot?.active_intervention)
  const instrument = inspectionStation === "trace" || inspectionStation === "viamass" ? instrumentPresentation(snapshot, inspectionStation, ready) : null
  const inspectionReady = canInspect(snapshot, ready, inspectionStation) && (!walkMode || navigation.inRange)
  const validSeed = Number.isInteger(seed) && seed >= 0 && seed <= 2147483647
  useEffect(() => {
    document.title = "BIOSTAT Gen 2 · Monitor 01 · HemoForge"
  }, [])
  useEffect(() => {
    if (!expandedScene) return
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setExpandedScene(false) }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [expandedScene])
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
          execution_mode:executionMode,
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
      if(latest.current?.dataset){
        const active=latest.current.active_intervention
        if(active?.status==="executing"&&attemptedIntervention.current!==active.id){attemptedIntervention.current=active.id;setStation("transfer")}
        return
      }
      const intervention = latest.current?.active_intervention
      if (
        intervention?.status === "queued" &&
        document.visibilityState === "visible" &&
        attemptedIntervention.current !== intervention.id &&
        command("execute", { intervention_id: intervention.id })
      ) {
        attemptedIntervention.current = intervention.id
        clock.current.reset()
        setStation("transfer")
        if (slowTransfers) setExpandedScene(true)
      }
      const seconds = clock.current.frame(
        transferFrameDelta(delta,intervention?.status === "executing",slowTransfers),
        ready && !!latest.current?.running && document.visibilityState === "visible",
      )
      if (seconds) command("advance", { seconds })
    },
    [command, latest, ready, slowTransfers],
  )
  useEffect(() => {
    const hidden = () => {
      clock.current.reset()
      if (document.visibilityState === "hidden"&&!latest.current?.dataset) command("pause")
    }
    document.addEventListener("visibilitychange", hidden)
    return () => document.removeEventListener("visibilitychange", hidden)
  }, [command,latest])
  useEffect(() => {
    if (graphicsError&&!latest.current?.dataset) command("pause")
  }, [graphicsError, command,latest])
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
    (!graphicsError||!!snapshot?.dataset) &&
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
        <button className="vl-expand-scene" aria-expanded={expandedScene} aria-controls="biostat-stage" onClick={() => setExpandedScene(value => !value)}>
          {expandedScene ? "Kembali ke kontrol" : "Perluas 3D"}
        </button>
        <a className="vl-stage-label" href="#poc">
          PoC & Simulation ↗
        </a>
      </header>
      <main className={`vl-layout${expandedScene ? " is-expanded" : ""}`}>
        <section
          className={`vl-stage${showTransfer ? " is-transfer-view" : ""}${showAlarm ? " is-alarm-view" : ""}`}
          id="biostat-stage"
          aria-label="Laboratorium BIOSTAT 3D orang pertama"
        >
          <BiostatScene
            station={station}
            snapshot={snapshot}
            connected={displayReady}
            onAssetState={onAssetState}
            onPerformance={onPerformance}
            inspectionRequest={inspectionRequest}
            reducedMotion={reducedMotion}
            slowTransfers={slowTransfers&&!snapshot?.dataset}
            onHandState={setHandState}
            walkMode={walkMode}
            resetWalkRequest={resetWalkRequest}
            onNavigation={setNavigation}
            onFrame={onFrame}
            onInteract={() => {
              if (canRun) command(snapshot?.running ? "pause" : "play")
            }}
            onError={setGraphicsError}
          />
          <LabNotifications snapshot={snapshot} connected={displayReady}/>
          <div className="vl-scene-top">
            <span className="vl-room-label">
              CELL CULTURE / SINGLE-USE STR 50
            </span>
            <span className="vl-scene-evidence">
              {blenderCount === 5 ? "BLENDER LAB + OPERATOR 5/5 · CC0 MATERIALS" : fallbackAssets ? `BLENDER ${blenderCount}/5 · FALLBACK: ${fallbackAssets}` : `LOADING BLENDER MODELS ${blenderCount}/5…`}
            </span>
          </div>
          <div className="vl-scene-caption">
            <small>CONNECTED BIOPROCESS LAB</small>
            <h1>Inside the process.</h1>
            <p>BIOSTAT Gen 2 + BioPAT Trace + ViaMass</p>
          </div>
          <div className={`biostat-scene-legend${showTransfer||showAlarm ? " has-transfer" : ""}`}>
            {snapshot&&showAlarm&&<LabAlerts snapshot={snapshot} connected={displayReady} compact/>}
            {showTransfer && transferView ? <TransferReadout view={transferView} compact /> : instrument ? <>
              <strong>{inspectionStation === "trace" ? "BioPAT Trace" : "BioPAT ViaMass"} · Virtual readout</strong>
              {instrument.values.map(value => <span key={value}>{value}</span>)}
              <small>{instrument.status} · {instrument.receipt}</small>
              <small>{instrument.times}</small>
            </> : <>
            <span>
              <i /> Gas & DO cascade
            </span>
            <span>
              <i /> Trace · kilau cairan mengikuti aliran
            </span>
            <span>
              <i /> Feed / retensi · isi selang transparan
            </span>
            <small>
              Pulsa putih = data PAT · gerakan mengikuti command simulasi
            </small>
            </>}
            <small aria-live="off">
              {renderStats.fps > 0 ? `${renderStats.fps} FPS · ${renderStats.quality === "high" ? "High" : "Balanced"} quality` : "Measuring render performance…"}
            </small>
            {expandedScene && snapshot && <small>{snapshot.culture_hours.toFixed(3)} h · {ready ? snapshot.running ? "Running" : "Paused" : "Disconnected"}</small>}
            {transferView?.status === "executing" && <button className="vl-transfer-pause" disabled={!ready} onClick={()=>command(snapshot?.running ? "pause" : "play")}>{snapshot?.running ? "Jeda transfer" : "Lanjutkan transfer"}</button>}
          </div>
          <div className="vl-hand-controls">
            <button aria-pressed={walkMode} onClick={() => setWalkMode(value => !value)}>{walkMode ? "Keluar mode FPS" : "Jalan FPS · WASD"}</button>
            {walkMode && <><button onClick={() => setResetWalkRequest(value => value+1)}>Reset posisi</button><small>{navigation.locked ? "Mouse aktif · Esc untuk melepas" : navigation.dragOnly ? "Mouse: tahan dan drag untuk melihat" : "Klik ruangan untuk mouse · drag juga tersedia"}</small></>}
            <button disabled={assetState.hands !== "blender" || reducedMotion || handState !== "Siap" || !inspectionReady} onClick={() => setInspectionRequest(value => value+1)}>Periksa layar</button>
            <label><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Kurangi gerakan</label>
            {!snapshot?.dataset&&<label><input type="checkbox" checked={slowTransfers} onChange={event=>setSlowTransfers(event.target.checked)} /> Transfer presentasi ⅓×</label>}
            <LabAmbience snapshot={snapshot} connected={displayReady}/>
            <span role="status">{handState !== "Siap" ? handState : reducedMotion ? "Interaksi dimatikan · gerakan minimum" : walkMode && !navigation.inRange ? "Dekati dan bidik layar alat" : inspectionStation === "overview" ? "Pilih alat untuk inspeksi" : !snapshot?.running ? "Jalankan kultur untuk interaksi" : !inspectionReady ? "Menunggu sensor valid / tindakan selesai" : "Inspeksi visual · kendali proses di Monitor 02"}</span>
          </div>
          {walkMode && <div className={`vl-fps-reticle${navigation.inRange ? " is-target" : ""}`} aria-live="polite"><i aria-hidden="true" /><span>{navigation.hint}</span></div>}
          <div className="vl-station-nav" aria-label="Posisi kamera">
            {(["overview", "bioreactor", "trace", "viamass", "transfer"] as const).map(
              (value, i) => (
                <button
                  key={value}
                  aria-pressed={!walkMode && station === value}
                  onClick={() => { setWalkMode(false); setStation(value) }}
                >
                  <span>0{i + 1}</span>
                  {["Ruangan", "BIOSTAT STR", "BioPAT Trace", "ViaMass", "Transfer"][i]}
                </button>
              ),
            )}
          </div>
          <div className="vl-camera-hint">
            {walkMode ? "Klik ruangan · WASD berjalan · mouse melihat · E inspeksi · Esc lepas mouse" : snapshot?.dataset?"Dataset Live · jam server terus berjalan · 3D menampilkan keadaan terbaru":"Drag untuk melihat sekitar · panah mengaktifkan / menjeda kultur · waktu hanya maju setelah frame dirender"}
          </div>
          {graphicsError && (
            <div role="alert" className="vl-graphics-error">
              {graphicsError}
              <br />
              {snapshot?.dataset?"Aktifkan WebGL untuk melihat 3D. Dataset tetap berjalan di backend.":"Aktifkan WebGL. Jam kultur dijeda."}
            </div>
          )}
        </section>
        <aside className="vl-control-panel" hidden={expandedScene}>
          <div className="vl-panel-heading">
            <span className="vl-eyebrow">ONLINE PROCESS MONITORING</span>
            <h2>One culture. Live signals.</h2>
            <p>
              Mulai kultur; sensor inti, Trace, dan ViaMass mengirim hasil
              otomatis. Tidak ada langkah sampling FLEX2.
            </p>
          </div>
          <div className="vl-session-row">
            <span className={`vl-status ${displayReady ? "is-online" : ""}`}>
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
                ? snapshot?.dataset ? "Dataset Live · jam backend terus berjalan" : "Mengikuti animasi 3D"
                : "Paused · tidak ada waktu yang maju"}
            </span>
          </div>
          {!id && (
            <>
              <fieldset className="vl-model-config" disabled={creating}>
                <legend>Profil sesi baru · STR 50 Gen 2</legend>
                <label>Mode simulasi<select value={executionMode} onChange={e=>setExecutionMode(e.target.value as "dataset"|"guided")}><option value="dataset">Dataset Live · otomatis berkelanjutan</option><option value="guided">Terpandu · kontrol manual</option></select></label>
                <label>
                  {executionMode==="dataset"?"Profil medium otomatis per batch":"Skenario kultur"}
                  <select
                    value={scenario} disabled={executionMode==="dataset"}
                    onChange={(e) =>
                      setScenario(e.target.value as CultureScenario)
                    }
                  >
                    <option value="balanced">{executionMode==="dataset"?"Otomatis · tiga profil medium":"Nutrisi seimbang"}</option>
                    <option value="nutrient_limited">Nutrisi terbatas</option>
                    <option value="metabolite_stress">Stres metabolit</option>
                  </select>
                </label>
                <label>
                  {executionMode==="dataset"?"Seed kampanye":"Seed sensor"}
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
                {creating ? "Menghubungkan…" : executionMode==="dataset"?"Mulai Dataset Live otomatis →":"Buat sesi BIOSTAT →"}
              </button>
              {savedDatasets.length>0&&<SavedDatasets campaigns={savedDatasets} onRefresh={loadDatasets}/>}
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
                {snapshot?.dataset?"Pindahkan dashboard ke monitor kedua. Dataset tetap berjalan saat browser ditutup; API harus tetap hidup.":"Pindahkan jendela baru ke monitor kedua dan biarkan kedua jendela terlihat. Menyembunyikan tab 3D menjeda kultur."}
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
              <DatasetPanel snapshot={snapshot}/>
              {snapshot.dataset&&!token&&<p className="vl-footnote">Akses baca. Kontrol pause/kecepatan hanya tersedia di tab pembuat sesi yang menyimpan token sementara. Dataset tetap berjalan dan dapat diekspor.</p>}
              {!snapshot.dataset&&<ScenarioPanel snapshot={snapshot} connected={ready} onRun={kind=>{if(command("disturbance",{disturbance:kind})){setStation("bioreactor")}}}/>}
              <LabAlerts snapshot={snapshot} connected={displayReady}/>
              <ProcessMotionPanel snapshot={snapshot} connected={displayReady} />
              <form
                className="vl-model-config"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (validSetpoints) command("setpoints", setpoints)
                }}
              >
                <fieldset disabled={!ready || !!snapshot.active_intervention || !!snapshot.dataset}>
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
              {token && !snapshot.dataset && (
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
            untuk skala BIOSTAT. Dataset Live tersimpan di disk; sesi terpandu hilang saat API restart. Tidak ada alat
            fisik, NVIDIA, LLM, atau layanan berbayar yang dipanggil.
          </p>
        </aside>
      </main>
    </div>
  )
}
