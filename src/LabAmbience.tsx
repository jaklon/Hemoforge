import { useEffect, useRef, useState } from "react"
import type { LabSnapshot } from "./lab-session"
import { alarmPresentation, alarmSoundKey } from "./lab-alerts"
import { LabAudioEngine, labSoundState } from "./lab-audio"

export default function LabAmbience({
  snapshot,
  connected,
}: {
  snapshot: LabSnapshot | null
  connected: boolean
}) {
  const [enabled, setEnabled] = useState(false),
    [volume, setVolume] = useState(0.2),
    [visible, setVisible] = useState(document.visibilityState === "visible"),
    [error, setError] = useState("")
  const engine = useRef<LabAudioEngine | null>(null),
    heard = useRef(new Set<string>())
  useEffect(() => {
    heard.current.clear()
  }, [snapshot?.session_id])
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])
  useEffect(
    () => () => {
      engine.current?.dispose()
      engine.current = null
    },
    [],
  )
  useEffect(() => {
    const audio = engine.current
    if (!audio) return
    let cancelled = false
    const state = labSoundState(snapshot, connected, visible, enabled, volume)
    void audio
      .set(state)
      .then(() => {
        if (cancelled || !state.audible || !volume) return
        const alert = alarmPresentation(snapshot, connected).current.find(
          (a) => {
            const candidate = alarmSoundKey(a)
            return (
              candidate &&
              !heard.current.has(`${snapshot?.session_id}/${candidate}`)
            )
          },
        )
        const soundKey = alarmSoundKey(alert)
        const key = soundKey ? `${snapshot?.session_id}/${soundKey}` : null
        if (key && !heard.current.has(key)) {
          heard.current.add(key)
          audio.chime(alert!.severity === "critical")
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Audio belum tersedia; aktifkan kembali lewat tombol.")
          setEnabled(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [snapshot, connected, visible, enabled, volume])
  function toggle() {
    try {
      if (!engine.current) engine.current = new LabAudioEngine()
      setEnabled((v) => !v)
      setError("")
    } catch {
      setError("Web Audio tidak didukung browser ini.")
    }
  }
  return (
    <div className="vl-audio-controls">
      <button aria-pressed={enabled} onClick={toggle}>
        {enabled ? "Mute ambience lab" : "Aktifkan suara lab"}
      </button>
      {enabled && (
        <label>
          Volume lab
          <input
            aria-label="Volume ambience lab"
            type="range"
            min={0}
            max={0.6}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </label>
      )}
      {enabled && (
        <small>
          Ambience sintetis lokal · HVAC, pompa, aerasi & notifikasi. Tab
          tersembunyi/offline: senyap.
        </small>
      )}
      {error && <small role="status">{error}</small>}
    </div>
  )
}
