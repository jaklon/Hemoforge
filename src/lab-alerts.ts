import { lastSensor, sensorUsable } from "./biostat-data.ts"
import type { LabSnapshot, LabAlert } from "./lab-session.ts"

export function alarmPresentation(
  snapshot: LabSnapshot | null,
  connected: boolean,
) {
  const configured = !!snapshot?.training_scenarios
  const alerts = (snapshot?.lab_alerts ?? []).map((a) =>
    connected ? a : { ...a, status: "hold" as const, value: null },
  )
  const current = alerts
    .filter((a) => a.status !== "resolved")
    .sort(
      (a, b) =>
        Number(b.status === "active" && b.severity === "critical") -
        Number(a.status === "active" && a.severity === "critical"),
    )
  const worst = current[0]
  const dataReady =
    !!snapshot &&
    connected &&
    (["core", "trace"] as const).every((device) => {
      const row = lastSensor(snapshot, device)
      return (
        sensorUsable(snapshot, row) &&
        !snapshot.sensor_faults?.includes(device) &&
        (device === "core"
          ? ["ph", "dissolved_oxygen"]
          : ["glucose_mmol_l"]
        ).every((key) => Number.isFinite(row?.channels[key]))
      )
    })
  const tone =
    !connected || worst?.status === "hold"
      ? "hold"
      : (worst?.severity ?? "normal")
  return {
    alerts,
    current,
    worst,
    tone,
    configured,
    dataReady,
    title: !configured
      ? "API skenario belum tersedia"
      : !connected
        ? "OFFLINE · status ditahan"
        : current.length
          ? `${current.length} alarm perlu ditinjau`
          : !dataReady
            ? "Menunggu sensor valid"
            : "Tidak ada alarm aktif",
  }
}

export function alarmSoundKey(alert: LabAlert | undefined) {
  return alert?.status === "active" && !alert.acknowledged
    ? `${alert.id}/${alert.severity}`
    : null
}

export function correctionPending(snapshot: LabSnapshot, alert: LabAlert) {
  return (snapshot.alert_events ?? []).some(
    (e) =>
      e.alert_id === alert.id &&
      e.kind === "correction" &&
      e.hour >= alert.measured_at_hour,
  )
}
