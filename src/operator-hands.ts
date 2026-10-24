import type { LabSnapshot } from "./lab-session.ts"
import { lastSensor, sensorUsable } from "./biostat-data.ts"
import { renderedSeconds } from "./biostat-animation.ts"
import { instrumentPresentation } from "./biopat-instrument.ts"

export type HandStation = "overview" | "bioreactor" | "trace" | "viamass"

/** Inspection reads existing instrument state. It never constructs a command. */
export function canInspect(snapshot: LabSnapshot | null, connected: boolean, station: HandStation) {
  if (!snapshot?.running || !connected || station === "overview" || snapshot.active_intervention) return false
  if (station === "trace" || station === "viamass") return instrumentPresentation(snapshot, station, connected).state === "live"
  if (snapshot.sensor_faults?.includes("core")) return false
  const core = lastSensor(snapshot, "core")
  return sensorUsable(snapshot, core) && ["ph", "dissolved_oxygen", "temperature"].every(key => Number.isFinite(core?.channels[key]))
}

export function smooth(value: number) {
  const x = Math.max(0, Math.min(1, value))
  return x*x*(3-2*x)
}

export function inspectionPose(seconds: number) {
  const t = Math.max(0, Math.min(6, Number.isFinite(seconds) ? seconds : 0))
  const lean = smooth(t/.9) * (1-smooth((t-4.8)/1.2))
  const reach = smooth((t-1)/1.2) * (1-smooth((t-4)/.8))
  const tap = smooth((t-2.2)/.22)*(1-smooth((t-2.55)/.22))
  const phase = t === 0 || t >= 6 ? "Siap" : t < 1 ? "Mendekati layar" : t < 2.2 ? "Mengulurkan tangan" : t < 2.8 ? "Menyentuh layar inspeksi" : t < 4 ? "Membaca sensor" : "Menarik tangan"
  return { lean, reach, tap, phase }
}

export class InspectionClock {
  seconds = 0
  active = false
  start() {
    if (this.active) return false
    this.seconds = 0
    this.active = true
    return true
  }
  reset() { this.seconds = 0; this.active = false }
  advance(delta: number, available: boolean) {
    if (this.active) {
      this.seconds = Math.min(6, this.seconds + renderedSeconds(delta, available))
      if (this.seconds >= 6) this.active = false
    }
    return this.active ? inspectionPose(this.seconds) : inspectionPose(0)
  }
}
