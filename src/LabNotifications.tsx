import { useEffect, useRef, useState } from "react"
import type { LabSnapshot } from "./lab-session"
import { alarmPresentation } from "./lab-alerts"

export default function LabNotifications({
  snapshot,
  connected,
}: {
  snapshot: LabSnapshot | null
  connected: boolean
}) {
  const seen = useRef(0),
    session = useRef("")
  const [notices, setNotices] = useState<{
    key: string
    text: string
    critical: boolean
  }[]>([])
  useEffect(() => {
    if (!snapshot || !connected) return
    const scope=snapshot.dataset?.run_id??snapshot.session_id
    const changed = session.current !== scope
    if (changed) {
      session.current = scope
      seen.current = 0
      setNotices([])
    }
    const events = snapshot.alert_events ?? []
    const fresh = events.filter(
      (e) =>
        e.seq > seen.current &&
        ["raised", "escalated", "resolved"].includes(e.kind),
    )
    seen.current = Math.max(seen.current, events.at(-1)?.seq ?? 0)
    // Initial connection reports current unacknowledged alarms, never replays old recoveries.
    const next = changed
      ? alarmPresentation(snapshot, connected)
          .current.filter((a) => a.status === "active" && !a.acknowledged)
          .map((a) => ({
            key: a.id,
            text: `${a.label} · ${
              a.severity === "critical" ? "ALERT" : "WARNING"
            } · tinjau Guard`,
            critical: a.severity === "critical",
          }))
      : fresh.map((e) => ({
          key: `${e.alert_id}/${e.seq}`,
          text: `${snapshot.lab_alerts?.find((a) => a.id === e.alert_id)?.label ?? e.metric} · ${
            e.kind === "resolved"
              ? "pemulihan terverifikasi"
              : "alarm baru · tinjau Guard"
          }`,
          critical: e.kind !== "resolved" && e.severity === "critical",
        }))
    if (next.length) setNotices(next.slice(-2))
  }, [snapshot, connected])
  useEffect(() => {
    if (!notices.length) return
    const timer = setTimeout(() => setNotices([]), 9000)
    return () => clearTimeout(timer)
  }, [notices])
  return (
    <div className="vl-notifications" aria-live="polite">
      {notices.map((n) => (
        <div
          key={n.key}
          className={n.critical ? "is-critical" : ""}
          role={n.critical ? "alert" : "status"}
        >
          <span>{n.text}</span>
          <button
            aria-label="Tutup notifikasi"
            onClick={() =>
              setNotices((items) => items.filter((i) => i.key !== n.key))
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
