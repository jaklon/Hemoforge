import { liquidHeight, renderedSeconds } from "./biostat-animation.ts"

export const FLUID_BASE = .48
export const FLUID_RADIUS = .607
export const SPARGER_HEIGHT = .555
const TAU = Math.PI * 2
const bounded = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.max(lo,Math.min(hi,n)) : lo

export function fluidShape(volumeMl: number, rpm: number) {
  const present = Number.isFinite(volumeMl) && volumeMl > 0
  const height = present ? liquidHeight(volumeMl) : 0
  // The lower pitched blade is at .68m. A dry blade must not stir the medium.
  const immersion = bounded((FLUID_BASE+height-.64)/.08,0,1)
  return { present, height, drive: Math.min(1,bounded(rpm,0,500)/220)*immersion }
}

/** A visual clock, independent of accelerated biological hours and measurements. */
export class FluidClock {
  mix = 0
  gas = 0
  drive = 0
  aeration = 0
  advance(delta: number, active: boolean, drive: number, gas: number) {
    const dt = renderedSeconds(delta,active)
    if (!dt) return
    const target = bounded(drive,0,1)
    const response = -Math.expm1(-3*dt)
    this.mix += target*dt+(this.drive-target)*response/3
    this.drive += (target-this.drive)*response
    this.aeration += (bounded(gas,0,1)-this.aeration)*(-Math.expm1(-5*dt))
    this.gas += dt*bounded(gas,0,1)
  }
}

/** The disk integral of both terms is zero: waves do not invent added medium. */
export function surfaceProfile(height: number, drive: number, phase: number) {
  const d = bounded(drive,0,1)
  return { depth: Math.min(Math.max(0,height)*.04,.009*d*d),
    wave: Math.min(Math.max(0,height)*.015,.003*d), phase }
}

export function surfaceOffset(x: number, z: number, depth: number, wave: number, phase: number) {
  const inv = 1/(FLUID_RADIUS*FLUID_RADIUS)
  return depth*(2*(x*x+z*z)*inv-1) + wave*((x*x-z*z)*Math.sin(phase)+2*x*z*Math.cos(phase))*inv
}

export interface FluidPoint { x: number; y: number; z: number; radius: number }

/** Twenty fixed sparger apertures, buoyant rise, widening plume and local drift. */
export function bubblePoint(out: FluidPoint, index: number, clock: FluidClock, height: number) {
  const seed = ((index*73+19)%149)/149
  const age = (clock.gas*(.31+seed*.16)+index*.61803398875)%1
  const hole = (index%20)/20*TAU
  const theta = hole+clock.drive*age*(1.6+.2*Math.sin(clock.mix*2+index))
  const spread = .29 + age*(.028*Math.sin(index*2.4+clock.gas)+clock.drive*.065*Math.sin(index))
  out.x = Math.cos(theta)*spread
  out.z = Math.sin(theta)*spread
  out.y = SPARGER_HEIGHT + age*Math.max(0,FLUID_BASE+height-SPARGER_HEIGHT-.022)
  out.radius = (.0035+seed*.0035)*(1+age*.28)*Math.min(1,age*14,(1-age)*12)
  return out
}

/** Illustrative closed meridional circulation: downward at the axis, upward near the wall. */
export function circulationPoint(out: FluidPoint, index: number, mix: number, height: number) {
  const phase = (mix*(.19+(index%5)*.012)+index*.61803398875)*TAU
  const radius = .30-.22*Math.cos(phase)
  const angle = index*2.399963+mix*.55+.18*Math.sin(phase)
  out.x = radius*Math.cos(angle)
  out.z = radius*Math.sin(angle)
  out.y = FLUID_BASE+height*(.5-.39*Math.sin(phase))
  out.radius = Math.min(.004+(index%4)*.001,Math.max(0,height)*.035)
  return out
}

/** Metres of qualitative transport; one speed for every segment of a fluid route. */
export function hoseDistance(distance: number, rate: number, delta: number, active: boolean) {
  return distance + bounded(rate,0,1)*renderedSeconds(delta,active)*.24
}
