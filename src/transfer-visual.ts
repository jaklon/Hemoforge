import type { LabSnapshot } from "./lab-session.ts"
import { renderedSeconds } from "./biostat-animation.ts"

/** Approved intervention receipts only; preview choices never enter this view. */
export function transferPresentation(snapshot: LabSnapshot | null, connected: boolean, visualProgress?: number) {
  const action = snapshot?.active_intervention ?? snapshot?.interventions?.at(-1)
  if (!snapshot || !action) return null
  const feed = action.kind === "feed"
  if (!((feed && [10,25].includes(action.amount)) || (action.kind === "medium_exchange" && [25,50].includes(action.amount)))) return null
  if (!["queued","executing","applied","cancelled"].includes(action.status)) return null
  if (!Number.isFinite(action.progress) || action.progress<0 || action.progress>1) return null
  const applied = action.status === "applied"
  const cancelled = action.status === "cancelled"
  const before = applied ? action.outcome?.volume_before_ml : snapshot.working_volume_ml
  if (typeof before !== "number" || !Number.isFinite(before) || before<=0) return null
  const multiplier = action.feed_multiplier_ml ?? snapshot.device_profile?.feed_multiplier_ml ?? 1
  const incoming = feed ? action.amount*multiplier : before * action.amount/100
  const target = feed ? before+incoming : before
  if (![incoming,target].every(n => Number.isFinite(n) && n>0)) return null
  if (snapshot.intervention_protocol?.max_volume_ml && target>snapshot.intervention_protocol.max_volume_ml) return null
  if (applied && (!action.outcome || !Number.isFinite(action.outcome.volume_after_ml))) return null
  const progress = applied ? 1 : cancelled || action.status === "queued" ? 0 : action.progress
  const shown = Number.isFinite(visualProgress) ? Math.max(0,Math.min(progress,visualProgress!)) : progress
  const usable = connected && snapshot.controller_connected && !!snapshot.controller
  const active = usable && action.status === "executing" && progress<1
  const delivered = cancelled ? 0 : incoming*shown
  const outgoing = feed ? 0 : delivered
  return {
    id:action.id, source:action.source_sample_id, kind:action.kind, status:action.status,
    progress, shown, before, target, plannedMl:incoming,
    incomingMl:delivered, outgoingMl:outgoing, remainingMl:incoming-delivered,
    visualVolumeMl:applied ? action.outcome!.volume_after_ml : before+delivered-outgoing,
    recordedVolumeMl:snapshot.working_volume_ml,
    active, moving:active && snapshot.running,
    label:!usable ? "OFFLINE / HOLD" : cancelled ? "DIBATALKAN · TANPA TRANSFER TERCATAT" : applied ? "SELESAI · VOLUME TERCATAT"
      : action.status === "queued" ? "MENUNGGU MONITOR 01" : snapshot.running ? "TRANSFER BERJALAN" : "TRANSFER DIJEDA",
  }
}

export type TransferView = NonNullable<ReturnType<typeof transferPresentation>>

/** Slow presentation changes rendered process time, never accepts a stalled frame. */
export function transferFrameDelta(delta:number, executing:boolean, slow:boolean) {
  return Number.isFinite(delta) && delta>0 && delta<=.25 && executing && slow ? delta/3 : delta
}

/** Smooth only towards acknowledged progress. Never predict beyond the backend. */
export class TransferVisualClock {
  id = ""
  progress = 0
  update(view: TransferView | null, delta: number, active: boolean) {
    if (!view) { this.id=""; this.progress=0; return 0 }
    if (this.id !== view.id || view.status !== "executing") {
      this.id=view.id; this.progress=view.progress
    } else {
      const dt=renderedSeconds(delta,active)
      this.progress += (view.progress-this.progress)*(-Math.expm1(-12*dt))
      this.progress=Math.max(0,Math.min(view.progress,this.progress))
    }
    return this.progress
  }
}
