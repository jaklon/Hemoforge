import type { CultureRow, InputFile } from "./workspace-data.ts"

export interface Flex2Measurement {
  sample_id: string
  collected_at_hour: number
  available_at_hour: number
  volume_ml: number
  viable_cell_density_million_ml: number
  count: number
  unit: "million cells"
  channels: Record<string, number>
  model_version: string
  evidence: "software_test_only"
}

export interface LabSnapshot {
  type: "snapshot"
  schema_version: 1
  session_id: string
  batch_id: string
  model_version: string
  created_at: string
  revision: number
  ack_seq: number
  culture_hours: number
  end_hour: number
  speed: 1 | 6 | 12
  running: boolean
  phase: "idle" | "collected" | "loaded" | "analyzing" | "complete"
  controller_connected: boolean
  reason: string
  analysis_progress: number
  sample: {
    sample_id: string
    collected_at_hour: number
  } | null
  measurements: Flex2Measurement[]
  measurements_sha256: string
}

export type LabAction = "play" | "pause" | "collect" | "load" | "analyze" | "advance" | "speed"
export const sessionPattern = /^[a-f0-9]{32}$/

export function labSessionFromHash(hash: string) {
  const match = hash.match(/^#(?:lab|guard\/live)\/([a-f0-9]{32})$/)
  return match?.[1] ?? null
}

export function liveCultureFile(
  snapshot: LabSnapshot,
): InputFile & { rows: CultureRow[] } {
  // Only released observations enter Guard. Hidden reactor state never crosses this boundary.
  const rows: CultureRow[] = snapshot.measurements.map((reading) => ({
    batch_id: snapshot.batch_id,
    cell_line: "Synthetic teaching culture · uncalibrated",
    hour: reading.collected_at_hour,
    count: reading.count,
    unit: reading.unit,
    channels: { ...reading.channels },
  }))
  return {
    kind: "culture",
    name: `Virtual FLEX2 · ${snapshot.batch_id}`,
    sha256: snapshot.measurements_sha256,
    loaded_at: snapshot.created_at,
    evidence: "software_test_only",
    rows,
  }
}

export function nextLabAction(phase: LabSnapshot["phase"]): LabAction | null {
  return phase === "collected"
    ? "load"
    : phase === "loaded"
      ? "analyze"
      : phase === "analyzing"
        ? null
        : "collect"
}

// Accumulate visible rendered time, never background wall time or catch-up after a stall.
export class AnimationClock {
  private seconds = 0
  reset() {
    this.seconds = 0
  }
  frame(delta: number, active: boolean) {
    if (!active || !Number.isFinite(delta) || delta < 0 || delta > 0.25) {
      this.reset()
      return 0
    }
    this.seconds += delta
    if (this.seconds < 0.25) return 0
    const advance = Math.min(this.seconds, 0.5)
    this.reset()
    return advance
  }
}
