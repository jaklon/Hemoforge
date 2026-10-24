/** Conservative floor footprints of the Blender lab and process equipment.
 * Coordinates are metres in Monitor 01's existing Y-up scene. */
export const PLAYER_RADIUS = .22
export const EYE_HEIGHT = 1.65
export const WALK_SPAWN = { x: .8, z: 3.2 }
export const LAB_BOUNDS = { minX: -5.8, maxX: 5.8, minZ: -4.05, maxZ: 4.65 }
export const LAB_OBSTACLES = [
  { name: "BIOSTAT", minX: -2.44, maxX: -.76, minZ: -1.76, maxZ: -.04 },
  { name: "DCU", minX: -.22, maxX: .67, minZ: -1.5, maxZ: -.55 },
  { name: "Trace table", minX: 1.19, maxX: 2.91, minZ: -2.08, maxZ: -.91 },
  { name: "Gas bank", minX: -3.96, maxX: -2.8, minZ: -2.15, maxZ: -1.58 },
  { name: "Medium stand", minX: -4.1, maxX: -3.22, minZ: -.3, maxZ: .43 },
  { name: "Retention skid", minX: .57, maxX: 1.25, minZ: -.2, maxZ: .66 },
  { name: "Preparation bench", minX: -5.85, maxX: -2.95, minZ: -3.65, maxZ: -2.48 },
  { name: "Clean enclosure", minX: -2.22, maxX: -.88, minZ: -3.72, maxZ: -2.82 },
  { name: "Support bench", minX: .58, maxX: 3.24, minZ: -3.65, maxZ: -2.48 },
  { name: "Incubator", minX: 4.6, maxX: 5.65, minZ: -2.28, maxZ: -1.2 },
  { name: "Trolley", minX: 3.97, maxX: 4.75, minZ: .39, maxZ: .94 },
  { name: "Stool", minX: -5.05, maxX: -4.43, minZ: .48, maxZ: 1.1 },
] as const

export function canStand(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false
  const r = PLAYER_RADIUS, b = LAB_BOUNDS
  if (x < b.minX+r || x > b.maxX-r || z < b.minZ+r || z > b.maxZ-r) return false
  return !LAB_OBSTACLES.some(o => {
    const dx = x-Math.max(o.minX,Math.min(o.maxX,x))
    const dz = z-Math.max(o.minZ,Math.min(o.maxZ,z))
    return dx*dx+dz*dz < r*r
  })
}

export function walkStep(position: { x: number; z: number }, forward: number, strafe: number, yaw: number, delta: number) {
  if (![position.x,position.z,forward,strafe,yaw,delta].every(Number.isFinite) || delta <= 0 || delta > .25) return { ...position }
  const length = Math.max(1,Math.hypot(forward,strafe))
  const speed = 1.6*delta/length
  const dx = (-Math.sin(yaw)*forward+Math.cos(yaw)*strafe)*speed
  const dz = (-Math.cos(yaw)*forward-Math.sin(yaw)*strafe)*speed
  // Small swept steps prevent tunnelling; separate axes allow wall sliding.
  const steps = Math.max(1,Math.ceil(Math.hypot(dx,dz)/.04))
  let { x,z } = position
  for (let i = 0; i < steps; i++) {
    if (canStand(x+dx/steps,z)) x += dx/steps
    if (canStand(x,z+dz/steps)) z += dz/steps
  }
  return { x,z }
}

export function mouseLook(yaw: number, pitch: number, dx: number, dy: number) {
  if (![yaw,pitch,dx,dy].every(Number.isFinite)) return { yaw: 0,pitch: 0 }
  return { yaw: (yaw-dx*.002)%(Math.PI*2), pitch: Math.max(-1.1,Math.min(1.1,pitch-dy*.002)) }
}
