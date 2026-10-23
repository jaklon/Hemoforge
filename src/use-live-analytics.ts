import { useEffect, useState } from "react"
import type { LabSnapshot } from "./lab-session"
import {
  analysisMatches,
  fetchLiveAnalysis,
  lastAppliedAction,
  liveSettingsError,
  type LiveAnalysis,
  type LiveAnalysisSettings,
} from "./lab-live-analytics"

export default function useLiveAnalytics(
  snapshot: LabSnapshot | null,
  settings: LiveAnalysisSettings,
  connected: boolean,
) {
  const [data, setData] = useState<LiveAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const id = snapshot?.session_id
  const hash = snapshot?.measurements_sha256
  const segment = snapshot
    ? (lastAppliedAction(snapshot)?.id ?? "initial")
    : "initial"
  const active = snapshot?.active_intervention?.id
  useEffect(() => {
    setError("")
    if (
      !snapshot ||
      !connected ||
      active ||
      !snapshot.measurements.length ||
      liveSettingsError(settings)
    ) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    let disposed = false
    setLoading(true)
    const timer = setTimeout(() => {
      const deadline = setTimeout(() => controller.abort(), 15000)
      void fetchLiveAnalysis(snapshot, settings, controller.signal)
        .then((result) => {
          if (!disposed) setData(result)
        })
        .catch((failure) => {
          if (!disposed)
            setError(
              failure instanceof Error ? failure.message : "Analisis gagal.",
            )
        })
        .finally(() => {
          clearTimeout(deadline)
          if (!disposed) setLoading(false)
        })
    }, 250)
    return () => {
      disposed = true
      clearTimeout(timer)
      controller.abort()
    }
    // Clock/progress revisions do not trigger numerical refits; only evidence, segment, settings or reconnect do.
  }, [
    id,
    hash,
    segment,
    active,
    settings.horizon,
    settings.target_million,
    connected,
    retry,
  ])
  return {
    data:
      snapshot &&
      connected &&
      !error &&
      analysisMatches(data, snapshot, settings)
        ? data
        : null,
    loading,
    error,
    refresh: () => setRetry((value) => value + 1),
  }
}
