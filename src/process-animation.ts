import { instrumentPresentation } from "./biopat-instrument.ts"
import { renderedSeconds } from "./biostat-animation.ts"
import type { LabSnapshot } from "./lab-session.ts"
import { transferPresentation } from "./transfer-visual.ts"

export type FlowKind = "gas" | "oxygen" | "nitrogen" | "trace" | "feed" | "waste" | "retentate" | "base" | "acid" | "traceData" | "viaData"

/** Commands and released receipts only; these are qualitative visuals, not flow meters. */
export function processPresentation(snapshot: LabSnapshot | null, connected: boolean) {
  const available = !!snapshot && connected && snapshot.controller_connected && !!snapshot.controller
  const output = snapshot?.controller?.outputs
  const command = (value: number | undefined, min: number, max: number) =>
    available && Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : 0
  const rpm = command(output?.stirrer_rpm, 0, 500)
  const oxygen = command(output?.oxygen_percent, 0, 100)
  const gasAvailable = available && Number.isFinite(output?.oxygen_percent)
  const capacity=snapshot?.process_disturbance?.aeration_capacity
  const gasCapacity=Number.isFinite(capacity)?Math.max(.01,Math.min(1,capacity!)):snapshot?.process_disturbance?.aeration_restricted ? .12 : 1
  const base = command(output?.base_output_percent, 0, 100)
  const acid = command(output?.acid_output_percent, 0, 100)
  const thermal = command(output?.thermal_output_percent, -100, 100)
  const action = snapshot?.active_intervention
  const transferView = transferPresentation(snapshot,connected)
  const transferring = available && action?.status === "executing" && !!transferView?.active
  const trace = instrumentPresentation(snapshot, "trace", connected && available)
  const via = instrumentPresentation(snapshot, "viamass", connected && available)
  const rates: Record<FlowKind, number> = {
    gas: gasAvailable ? gasCapacity : 0,
    oxygen: gasAvailable ? oxygen / 100 * gasCapacity : 0,
    nitrogen: gasAvailable ? (100 - oxygen) / 100 * gasCapacity : 0,
    trace: trace.state === "live" || trace.state === "waiting" ? 1 : 0,
    feed: transferring ? 1 : 0,
    waste: transferring && action.kind === "medium_exchange" ? 1 : 0,
    retentate: transferring && action.kind === "medium_exchange" ? 1 : 0,
    base: base / 100,
    acid: acid / 100,
    traceData: trace.state === "live" ? 1 : 0,
    viaData: via.state === "live" ? 1 : 0,
  }
  return { available, running: available && !!snapshot?.running, rpm, oxygen, gasAvailable,
    base, acid, thermal, rates, trace, via,
    transfer: transferring ? action : null,
    transferView,
    status: !available ? "OFFLINE / HOLD" : snapshot?.running ? "RUNNING" : "PAUSED / HOLD" }
}

/** Integrate phase so pauses, dropped frames and rate changes cannot teleport markers. */
export function flowPhase(phase: number, rate: number, delta: number, active: boolean) {
  const safeRate = Number.isFinite(rate) ? Math.max(0, Math.min(1, rate)) : 0
  return (phase + renderedSeconds(delta, active) * safeRate * .22) % 1
}
