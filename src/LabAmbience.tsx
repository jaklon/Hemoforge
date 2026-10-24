import { useEffect, useRef, useState } from "react"
import type { LabSnapshot } from "./lab-session"
import { LabAudioEngine, labSoundState } from "./lab-audio"

export default function LabAmbience({
  snapshot,
  connected,
}: {
  snapshot: LabSnapshot | null
  connected: boolean
}) {
  const [enabled, setEnabled] = useState(false),
    [volume, setVolume] = useState(0.4),
    [visible, setVisible] = useState(document.visibilityState === "visible"),
    [level, setLevel] = useState(0),
    [error, setError] = useState("")
  const engine = useRef<LabAudioEngine | null>(null)
  useEffect(() => {
    if (!enabled || !visible) return
    const timer = setInterval(
      () => setLevel(engine.current?.signalLevel() ?? 0),
      100,
    )
    return () => clearInterval(timer)
  }, [enabled, visible])
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
    void audio
      .set(labSoundState(snapshot, connected, visible, enabled, volume))
      .catch(() => {
        if (!cancelled) {
          setError(
            "Browser menahan audio. Klik Uji suara / aktifkan kembali; periksa volume speaker dan mute tab.",
          )
          setEnabled(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [snapshot, connected, visible, enabled, volume])
  function activate(test = false) {
    if (enabled && !test) {
      setEnabled(false)
      return
    }
    try {
      if (!engine.current) engine.current = new LabAudioEngine()
      const audio = engine.current
      // resume is deliberately invoked in this click handler, before awaiting.
      void audio
        .unlock()
        .then(async () => {
          await audio.set(
            labSoundState(snapshot, connected, visible, true, volume),
          )
          audio.chime(false)
          setEnabled(true)
          setError("")
        })
        .catch(() =>
          setError(
            "Audio belum diizinkan. Klik lagi dan periksa mute tab / speaker.",
          ),
        )
    } catch {
      setError("Web Audio tidak didukung browser ini.")
    }
  }
  const sound = labSoundState(snapshot, connected, visible, enabled, volume)
  return (
    <div className="vl-audio-controls">
      <button aria-pressed={enabled} onClick={() => activate()}>
        {enabled ? "Mute ambience lab" : "Aktifkan suara lab"}
      </button>
      <button disabled={!snapshot || !connected} onClick={() => activate(true)}>
        Uji suara bip-bip
      </button>
      {enabled && (
        <label>
          Output audio{" "}
          <meter
            aria-label="Level output audio"
            min={0}
            max={0.06}
            value={level}
          />
        </label>
      )}
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
        <small role="status">
          {sound.beep === "normal"
            ? "Normal · bip-bip tiap 4 detik"
            : sound.beep === "warning"
              ? "WARNING · bip-bip tiap 0,5 detik"
              : sound.beep === "critical"
                ? "ALERT · bip-bip tiap 0,3 detik"
                : "Bip dijeda · menunggu kultur/sensor valid"}
          . Tab tersembunyi/offline: senyap.
        </small>
      )}
      {error && <small role="status">{error}</small>}
    </div>
  )
}
