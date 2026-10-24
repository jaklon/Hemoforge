import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react"
import { defaultMarkerSettings, type MarkerSettings } from "./marker-screening"
import {
  defaultGrowthSettings,
  defaultPlanSettings,
  defaultMonitoringSettings,
  type GrowthSettings,
  type PlanSettings,
  type MonitoringSettings,
} from "./research-settings"
import {
  initialInputs,
  getBatches,
  reportsForSamples,
  type InputFile,
  type WorkspaceInputs,
  type DataKind,
} from "./workspace-data"
import { type CultureForecast, type ForecastHorizon } from "./culture-forecast"
import type { ExperimentPlan } from "./experiment-model"
import {
  predictGrowth,
  predictExperiments,
  pythonHealth,
  PythonServiceError,
  type PredictionEnvelope,
} from "./python-api"
import type { ExperimentRow, ScenarioTable } from "./workspace-data"
import { analyzeMeasurements, type Measurement } from "./culture-monitoring"
import { defaultGuardView, type GuardView } from "./guard-insights"
import { accountApi } from "./account"
export interface SimulationResult {
  batchId: string
  sourceHash: string
  generatedAt: string
  result: CultureForecast
  horizon: ForecastHorizon
  engine: string
  modelVersion: string
  requestId: string
  settings: GrowthSettings
}
export interface RunRecord {
  id: string
  generatedAt: string
  plan: ExperimentPlan | null
  planError: string | null
  prediction: Omit<PredictionEnvelope<ExperimentPlan>, "result"> | null
  settings: PlanSettings
}
interface WorkspaceContextValue {
  inputs: WorkspaceInputs
  run: RunRecord | null
  simulation: SimulationResult | null
  growthSettings: GrowthSettings
  setGrowthSettings: Dispatch<SetStateAction<GrowthSettings>>
  planSettings: PlanSettings
  setPlanSettings: Dispatch<SetStateAction<PlanSettings>>
  markerSettings: MarkerSettings
  setMarkerSettings: Dispatch<SetStateAction<MarkerSettings>>
  monitoring: MonitoringSettings
  setMonitoring: Dispatch<SetStateAction<MonitoringSettings>>
  guardView: GuardView
  setGuardView: Dispatch<SetStateAction<GuardView>>
  reportInterval: number
  setReportInterval: Dispatch<SetStateAction<number>>
  roadmapDays: number
  setRoadmapDays: Dispatch<SetStateAction<number>>
  editor: ScenarioTable
  setEditor: Dispatch<SetStateAction<ScenarioTable>>
  backendStatus: "checking" | "online" | "offline"
  checkBackend: () => Promise<void>
  apply: (files: InputFile[]) => Promise<void>
  notice: Notice | null
  notify: (message: string | null, tone?: Notice["tone"]) => void
  // Every finished notification, newest first, saved to the signed-in account.
  activity: ActivityEntry[]
  clearActivity: () => void
  // Sidebar pages with results the user has not opened yet.
  updates: string[]
  flag: (...views: string[]) => void
  unflag: (view: string) => void
  simulate: (
    batchIndex: number,
    hour: number,
    settings: GrowthSettings,
  ) => Promise<void>
  refitPlan: (settings: PlanSettings) => Promise<void>
}
// A message ending in "…" is progress: it stays until replaced.
export interface Notice {
  id: number
  message: string
  tone: "info" | "success" | "error"
}
export interface ActivityEntry extends Notice {
  at: string
  // Workspace page open when it happened.
  page: string
}
// Matches NOTIFICATION_LIMIT in backend/accounts.py.
const activityLimit = 300
const updatesKey = "sidebar-updates"
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
export async function checksum(value: BufferSource) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
export function DataProvider({ children, liveCulture }: { children: ReactNode; liveCulture?: InputFile }) {
  const [inputs, setInputs] = useState(() => liveCulture ? { ...initialInputs, culture: liveCulture } : initialInputs)
  const [run, setRun] = useState<RunRecord | null>(null)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [growthSettings, setGrowthSettings] = useState(defaultGrowthSettings)
  const [planSettings, setPlanSettings] = useState(defaultPlanSettings)
  const [markerSettings, setMarkerSettings] = useState(defaultMarkerSettings)
  const [monitoring, setMonitoring] = useState(defaultMonitoringSettings)
  const [guardView, setGuardView] = useState(defaultGuardView)
  const [reportInterval, setReportInterval] = useState(3)
  const [roadmapDays, setRoadmapDays] = useState(21)
  // Empty rows tell the editor to load the active data for its kind.
  const [editor, setEditor] = useState<ScenarioTable>({ kind: "culture", columns: [], rows: [] })
  const [backendStatus, setBackendStatus] =
    useState<"checking" | "online" | "offline">("checking")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  function notify(message: string | null, tone: Notice["tone"] = "info") {
    const id = Date.now()
    setNotice(message ? { id, message, tone } : null)
    // Progress messages ("…") are replaced by their outcome, which is the one worth keeping.
    if (!message || message.endsWith("…")) return
    const page = location.hash.slice(1).split("/")[0] || "workspace"
    setActivity((old) =>
      [{ id, message, tone, at: new Date(id).toISOString(), page }, ...old].slice(0, activityLimit),
    )
    // ponytail: fire-and-forget; an entry made while the API is down stays only in this visit.
    if (!liveCulture) accountApi("notifications", "POST", { message, tone, page }).catch(() => {})
    if (page !== "activity") flag("activity")
  }
  function clearActivity() {
    setActivity([])
    if (!liveCulture) accountApi("notifications", "DELETE").catch(() =>
      notify("Could not clear notifications in the database", "error"),
    )
  }
  const [updates, setUpdates] = useState<string[]>([])
  // Saved only after the account's copy loads, so start-up cannot overwrite it.
  const [stateLoaded, setStateLoaded] = useState(false)
  useEffect(() => {
    // Merge: entries raised before the load finished are kept.
    if (liveCulture) return
    accountApi<ActivityEntry[]>("notifications")
      .then((saved) => setActivity((old) => [...old, ...saved].slice(0, activityLimit)))
      .catch(() => {})
    accountApi<Record<string, unknown>>("account/state")
      .then((state) => {
        const saved = state[updatesKey]
        if (Array.isArray(saved)) setUpdates((old) => [...new Set([...saved, ...old])])
      })
      .catch(() => {})
      .finally(() => setStateLoaded(true))
  }, [])
  useEffect(() => {
    if (stateLoaded && !liveCulture) accountApi(`account/state/${updatesKey}`, "PUT", updates).catch(() => {})
  }, [updates, stateLoaded])
  function flag(...views: string[]) {
    setUpdates((old) => [...new Set([...old, ...views])])
  }
  function unflag(view: string) {
    setUpdates((old) => old.filter((item) => item !== view))
  }
  const lastStatus = useRef(backendStatus)
  useEffect(() => {
    const previous = lastStatus.current
    lastStatus.current = backendStatus
    if (backendStatus === "offline" && previous !== "offline")
      notify("Python API is offline. Predictions are paused.", "error")
    // "checking" → "online" is the normal start-up, not news.
    if (backendStatus === "online" && previous === "offline")
      notify("Python API is back online", "success")
  }, [backendStatus])
  useEffect(() => {
    const downloaded = (event: Event) =>
      notify(`Downloaded ${(event as CustomEvent<string>).detail}`, "success")
    window.addEventListener("workspace-download", downloaded)
    return () => window.removeEventListener("workspace-download", downloaded)
  }, [])
  const activeInputs = useRef(inputs)
  const planSequence = useRef(0)
  const simulationSequence = useRef(0)
  useEffect(() => {
    if (!liveCulture) return
    const next = { ...activeInputs.current, culture: liveCulture }
    activeInputs.current = next
    simulationSequence.current++
    setSimulation(null)
    setInputs(next)
  }, [liveCulture])
  async function checkBackend() {
    setBackendStatus("checking")
    try {
      await pythonHealth()
      setBackendStatus("online")
    } catch {
      setBackendStatus("offline")
    }
  }
  useEffect(() => {
    void checkBackend()
  }, [])
  function recordFailure(error: unknown) {
    setBackendStatus(
      error instanceof PythonServiceError && error.status !== null
        ? "online"
        : "offline",
    )
  }
  async function apply(files: InputFile[]) {
    const sequence = ++planSequence.current
    simulationSequence.current++
    const names = files.map((file) => file.name).join(", ")
    notify(
      files.length
        ? `Applying ${names} to the workspace…`
        : "Re-running analyses…",
    )
    const next = { ...inputs }
    for (const file of files) next[file.kind] = file
    const id = await checksum(
      new TextEncoder().encode(
        JSON.stringify({
          inputs: next,
          version: "python-2",
          settings: planSettings,
        }),
      ),
    )
    const refit =
      !files.length || files.some((file) => file.kind === "experiments")
    let plan: RunRecord["plan"] = refit ? null : (run?.plan ?? null)
    let planError: string | null = refit ? null : (run?.planError ?? null)
    let prediction: RunRecord["prediction"] = refit
      ? null
      : (run?.prediction ?? null)
    try {
      if (refit) {
        const { result, ...metadata } = await predictExperiments(
          next.experiments.rows as ExperimentRow[],
          planSettings,
          next.experiments.sha256,
        )
        plan = result
        prediction = metadata
        setBackendStatus("online")
      }
    } catch (error) {
      recordFailure(error)
      planError =
        error instanceof Error ? error.message : "Experimental model failed."
    }
    if (sequence !== planSequence.current) {
      notify(null)
      throw new Error("Inputs changed during analysis. Run again.")
    }
    // Each data type feeds the pages listed under "Active inputs & connections".
    // Research Report lists checkpoint reports, which only culture data changes.
    if (files.some((file) => file.kind === "culture")) flag("guard", "pilot", "report")
    if (files.some((file) => file.kind === "markers")) flag("evo2")
    if (refit && !planError) flag("plan")
    if (planError)
      notify(`Data applied, but CulturePlan refit failed: ${planError}`, "error")
    else
      notify(
        files.length ? `Applied ${names} to all pages` : "Analyses re-run",
        "success",
      )
    activeInputs.current = next
    simulationSequence.current++
    setInputs(next)
    setRun({
      id,
      generatedAt: new Date().toISOString(),
      plan,
      planError,
      prediction,
      settings: refit
        ? { ...planSettings }
        : (run?.settings ?? { ...planSettings }),
    })
    if (files.some((file) => file.kind === "culture")) setSimulation(null)
    const markerFile = files.find((file) => file.kind === "markers")
    if (markerFile?.markers)
      setMarkerSettings((old) => ({
        ...old,
        targets: markerFile.markers!.map((marker) => {
          const previous = old.targets.find(
            (target) => target.rsId === marker.rsId,
          )
          return { ...marker, genotype: previous?.genotype ?? "*" }
        }),
      }))
  }
  async function simulate(
    batchIndex: number,
    hour: number,
    settings: GrowthSettings,
  ) {
    const batch = getBatches(inputs.culture)[batchIndex - 1]
    if (!batch) throw new Error("Select an available batch.")
    const sequence = ++simulationSequence.current
    let response: PredictionEnvelope<CultureForecast>
    try {
      response = await predictGrowth(
        batch.measurements,
        hour,
        settings,
        inputs.culture.sha256,
      )
      setBackendStatus("online")
    } catch (error) {
      // Runs follow the replay cursor, so failures show inline instead of as toasts.
      recordFailure(error)
      throw error
    }
    if (
      activeInputs.current !== inputs ||
      sequence !== simulationSequence.current
    )
      return
    flag("pilot")
    setSimulation({
      batchId: batch.id,
      sourceHash: inputs.culture.sha256,
      generatedAt: response.generatedAt,
      result: response.result,
      horizon: settings.horizon,
      settings: { ...settings },
      engine: response.engine,
      modelVersion: response.modelVersion,
      requestId: response.requestId,
    })
  }
  async function refitPlan(settings: PlanSettings) {
    const sequence = ++planSequence.current
    let response: PredictionEnvelope<ExperimentPlan>
    try {
      response = await predictExperiments(
        inputs.experiments.rows as ExperimentRow[],
        settings,
        inputs.experiments.sha256,
      )
      setBackendStatus("online")
    } catch (error) {
      recordFailure(error)
      notify("CulturePlan fit failed", "error")
      throw error
    }
    if (activeInputs.current !== inputs || sequence !== planSequence.current)
      return
    notify("CulturePlan fit finished · conditions re-ranked", "success")
    flag("plan")
    const { result: plan, ...prediction } = response
    const id = await checksum(
      new TextEncoder().encode(
        JSON.stringify({
          inputs,
          version: "python-1",
          settings,
          method: plan.method,
        }),
      ),
    )
    if (activeInputs.current !== inputs || sequence !== planSequence.current)
      return
    setRun({
      id,
      generatedAt: response.generatedAt,
      plan,
      planError: null,
      prediction,
      settings: { ...settings },
    })
  }
  return (
    <WorkspaceContext.Provider
      value={{
        inputs,
        run,
        simulation,
        growthSettings,
        setGrowthSettings,
        planSettings,
        setPlanSettings,
        markerSettings,
        setMarkerSettings,
        monitoring,
        setMonitoring,
        guardView,
        setGuardView,
        reportInterval,
        setReportInterval,
        roadmapDays,
        setRoadmapDays,
        editor,
        setEditor,
        apply,
        notice,
        notify,
        activity,
        clearActivity,
        updates,
        flag,
        unflag,
        simulate,
        refitPlan,
        backendStatus,
        checkBackend,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error("Workspace provider is missing.")
  return context
}
export function useCultureData() {
  const { inputs, monitoring, reportInterval } = useWorkspace()
  const batches = useMemo(() => getBatches(inputs.culture), [inputs.culture])
  const batchIndexes = batches.map((_, index) => index + 1)
  const replayEndHour = Math.max(
    1,
    ...batches.flatMap((batch) =>
      batch.measurements.map((sample) => sample.hour),
    ),
  )
  const source = inputs.culture
  const batchId = (index: number) => batches[index - 1]?.id ?? "No batch"
  const batchMeasurements = (index: number) =>
    batches[index - 1]?.measurements ?? []
  const checkpointReports = (index: number, hour: number) =>
    reportsForSamples(
      batchMeasurements(index),
      hour,
      batchId(index),
      source,
      undefined,
      reportInterval,
      monitoring,
    )
  const demoSource = {
    dataset_id: source.sha256 || "software_test_only",
    study_id: source.name,
    source_id: source.name,
    source_sha256: source.sha256 || null,
    quality_flag: source.evidence,
    unit: "million cells",
    source_verified: false,
  }
  return {
    batches,
    batchIndexes,
    batchId,
    batchMeasurements,
    checkpointReports,
    replayEndHour,
    demoSource,
    source,
    analyze: (samples: Measurement[], hour: number) =>
      analyzeMeasurements(samples, hour, monitoring),
    monitoring,
    reportInterval,
  }
}
