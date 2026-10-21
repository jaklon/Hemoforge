import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import {
  initialInputs,
  getBatches,
  reportsForSamples,
  type InputFile,
  type WorkspaceInputs,
} from "./workspace-data"
import { type CultureForecast, type ForecastHorizon } from "./culture-forecast"
import type { fitExperimentPlan } from "./experiment-model"
import {
  predictGrowth,
  predictExperiments,
  pythonHealth,
  PythonServiceError,
  type PredictionEnvelope,
} from "./python-api"
import type { ExperimentRow } from "./workspace-data"
export interface SimulationResult {
  batchId: string
  sourceHash: string
  generatedAt: string
  result: CultureForecast
  horizon: ForecastHorizon
  engine: string
  modelVersion: string
  requestId: string
}
export interface RunRecord {
  id: string
  generatedAt: string
  plan: ReturnType<typeof fitExperimentPlan> | null
  planError: string | null
  prediction: Omit<PredictionEnvelope<ReturnType<typeof fitExperimentPlan>>, "result"> | null
}
interface WorkspaceContextValue {
  inputs: WorkspaceInputs
  run: RunRecord | null
  simulation: SimulationResult | null
  backendStatus: "checking" | "online" | "offline"
  checkBackend: () => Promise<void>
  apply: (files: InputFile[]) => Promise<void>
  simulate: (
    batchIndex: number,
    hour: number,
    horizon: ForecastHorizon,
    seed: number,
  ) => Promise<void>
  refitPlan: (objective: "maximize" | "minimize") => Promise<void>
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
export async function checksum(value: BufferSource) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
export function DataProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputs] = useState(initialInputs)
  const [run, setRun] = useState<RunRecord | null>(null)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [backendStatus, setBackendStatus] =
    useState<"checking" | "online" | "offline">("checking")
  const activeInputs = useRef(inputs)
  const planSequence = useRef(0)
  const simulationSequence = useRef(0)
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
    const next = { ...inputs }
    for (const file of files) next[file.kind] = file
    const id = await checksum(
      new TextEncoder().encode(
        JSON.stringify({ inputs: next, version: "python-1", seed: 42 }),
      ),
    )
    let plan: RunRecord["plan"] = null
    let planError: string | null = null
    let prediction: RunRecord["prediction"] = null
    try {
      const { result, ...metadata } = await predictExperiments(
        next.experiments.rows as ExperimentRow[],
        "maximize",
        next.experiments.sha256,
      )
      plan = result
      prediction = metadata
      setBackendStatus("online")
    } catch (error) {
      recordFailure(error)
      if (!(error instanceof PythonServiceError) || error.status !== 422)
        throw error
      planError =
        error instanceof Error ? error.message : "Experimental model failed."
    }
    if (sequence !== planSequence.current)
      throw new Error("Inputs changed during analysis. Run again.")
    activeInputs.current = next
    simulationSequence.current++
    setInputs(next)
    setRun({
      id,
      generatedAt: new Date().toISOString(),
      plan,
      planError,
      prediction,
    })
    setSimulation(null)
  }
  async function simulate(
    batchIndex: number,
    hour: number,
    horizon: ForecastHorizon,
    seed: number,
  ) {
    const batch = getBatches(inputs.culture)[batchIndex - 1]
    if (!batch) throw new Error("Select an available batch.")
    const sequence = ++simulationSequence.current
    let response: PredictionEnvelope<CultureForecast>
    try {
      response = await predictGrowth(
        batch.measurements,
        hour,
        horizon,
        seed,
        inputs.culture.sha256,
      )
      setBackendStatus("online")
    } catch (error) {
      recordFailure(error)
      throw error
    }
    if (
      activeInputs.current !== inputs ||
      sequence !== simulationSequence.current
    )
      return
    setSimulation({
      batchId: batch.id,
      sourceHash: inputs.culture.sha256,
      generatedAt: response.generatedAt,
      result: response.result,
      horizon,
      engine: response.engine,
      modelVersion: response.modelVersion,
      requestId: response.requestId,
    })
  }
  async function refitPlan(objective: "maximize" | "minimize") {
    const sequence = ++planSequence.current
    let response: PredictionEnvelope<ReturnType<typeof fitExperimentPlan>>
    try {
      response = await predictExperiments(
        inputs.experiments.rows as ExperimentRow[],
        objective,
        inputs.experiments.sha256,
      )
      setBackendStatus("online")
    } catch (error) {
      recordFailure(error)
      throw error
    }
    if (activeInputs.current !== inputs || sequence !== planSequence.current)
      return
    const { result: plan, ...prediction } = response
    const id = await checksum(
      new TextEncoder().encode(
        JSON.stringify({
          inputs,
          version: "python-1",
          objective,
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
    })
  }
  return (
    <WorkspaceContext.Provider
      value={{
        inputs,
        run,
        simulation,
        apply,
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
  const { inputs } = useWorkspace()
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
    reportsForSamples(batchMeasurements(index), hour, batchId(index), source)
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
  }
}
