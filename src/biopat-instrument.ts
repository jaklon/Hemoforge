import { lastSensor, sensorUsable } from "./biostat-data.ts"
import type { LabSnapshot } from "./lab-session.ts"

export type PatDevice = "trace" | "viamass"

/** One presentation boundary shared by the 3D texture and accessible overlay. */
export function instrumentPresentation(snapshot: LabSnapshot | null, device: PatDevice, connected: boolean) {
  const reading = snapshot ? lastSensor(snapshot, device) : null
  const keys = device === "trace" ? ["glucose_mmol_l", "lactate_mmol_l"] : ["capacitance_pf_cm"]
  const validChannels = !!reading && keys.every(key => Number.isFinite(reading.channels[key]))
  const state = !connected || !snapshot ? "offline"
    : snapshot.sensor_faults?.includes(device) || reading?.quality.status === "rejected" ? "fault"
    : !reading ? "waiting"
    : !sensorUsable(snapshot, reading) ? "stale"
    : !validChannels ? "unavailable"
    : "live"
  const running = !!snapshot?.running && connected
  const status = state === "live" ? (running ? "QC PASSED / LIVE" : "QC PASSED / PAUSED")
    : state === "fault" ? "QC FAULT / HOLD"
    : state === "stale" ? "STALE / HOLD"
    : state === "waiting" ? "AWAITING RELEASE"
    : state === "unavailable" ? "INVALID CHANNELS / HOLD"
    : "OFFLINE / HOLD"
  const value = (key: string) => state === "live" ? reading!.channels[key].toFixed(3) : "--"
  const values = device === "trace"
    ? [`GLU ${value("glucose_mmol_l")} mmol/L`, `LAC ${value("lactate_mmol_l")} mmol/L`]
    : [`CAP ${value("capacitance_pf_cm")} pF/cm`]
  const receipt = reading?.id ?? "NO RELEASED RECEIPT"
  const times = reading ? `M ${reading.measured_at_hour.toFixed(2)}h / R ${reading.available_at_hour.toFixed(2)}h` : "NO MEASUREMENT YET"
  return {
    state, status, values, receipt, times,
    color: state === "live" ? "#50d5aa" : state === "offline" ? "#8899a5" : state === "fault" ? "#e06d5f" : "#e1b65a",
    flowing: running && (state === "live" || state === "waiting"),
    rows: [...values, status, receipt, times, device === "trace" ? "HEMOFORGE VIRTUAL READOUT" : "VIRTUAL SENSOR / NOT RBC"],
  }
}
