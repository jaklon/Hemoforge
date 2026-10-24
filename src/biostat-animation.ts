/** Visual state uses rendered seconds, never accelerated culture hours. */
export function renderedSeconds(delta: number, active: boolean) {
  return active && Number.isFinite(delta) && delta > 0 && delta <= 0.25
    ? delta
    : 0
}

export function stirrerAngle(angle: number, rpm: number, seconds: number) {
  const safeRpm = Number.isFinite(rpm) ? Math.max(0, Math.min(500, rpm)) : 0
  return (angle + safeRpm * Math.PI * 2 / 60 * seconds) % (Math.PI * 2)
}

export function liquidHeight(volumeMl: number) {
  const volume = Number.isFinite(volumeMl) ? volumeMl : 0
  return Math.max(0.001, Math.min(1, volume / 50000)) * 1.4
}
