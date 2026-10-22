import { useCallback, useEffect, useRef, useState } from "react"
import { sessionPattern, type LabAction, type LabSnapshot } from "./lab-session"

export default function useLabSession(
  id: string | null,
  controllerToken?: string,
) {
  const [snapshot, setSnapshot] = useState<LabSnapshot | null>(null)
  const [connection, setConnection] =
    useState<"connecting" | "connected" | "disconnected">("connecting")
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const socket = useRef<WebSocket | null>(null)
  const latest = useRef<LabSnapshot | null>(null)
  const pending = useRef<number | null>(null)
  const queued = useRef<{
    action: LabAction
    seconds?: number
    speed?: number
  } | null>(null)
  const nextSeq = useRef(1)
  const command = useCallback(
    (action: LabAction, values: {
      seconds?: number
      speed?: number
    } = {}) => {
      if (
        !controllerToken ||
        socket.current?.readyState !== WebSocket.OPEN ||
        !latest.current
      )
        return false
      if (pending.current !== null) {
        // A user action must not disappear behind an in-flight animation tick.
        if (action === "advance" || queued.current) return false
        queued.current = { action, ...values }
        return true
      }
      pending.current = nextSeq.current
      socket.current.send(
        JSON.stringify({ seq: nextSeq.current, action, ...values }),
      )
      return true
    },
    [controllerToken],
  )

  useEffect(() => {
    setSnapshot(null)
    latest.current = null
    pending.current = null
    queued.current = null
    if (!id || !sessionPattern.test(id)) {
      setConnection("disconnected")
      return
    }
    let disposed = false
    setConnection("connecting")
    setError("")
    const ws = new WebSocket(
      `${
        location.protocol === "https:" ? "wss:" : "ws:"
      }//${location.host}/api/v1/lab/sessions/${id}/stream`,
    )
    socket.current = ws
    ws.onopen = () =>
      ws.send(
        JSON.stringify(
          controllerToken
            ? { role: "controller", token: controllerToken }
            : { role: "viewer" },
        ),
      )
    ws.onmessage = (event) => {
      if (disposed) return
      const message = JSON.parse(event.data)
      if (message.type === "error") {
        setError(message.detail)
        pending.current = null
        queued.current = null
        return
      }
      if (
        message.type !== "snapshot" ||
        message.session_id !== id ||
        message.schema_version !== 1
      )
        return
      latest.current = message
      nextSeq.current = message.ack_seq + 1
      if (pending.current !== null && message.ack_seq >= pending.current)
        pending.current = null
      setSnapshot(message)
      setConnection("connected")
      if (pending.current === null && queued.current) {
        const value = queued.current
        queued.current = null
        pending.current = nextSeq.current
        ws.send(JSON.stringify({ seq: nextSeq.current, ...value }))
      }
    }
    ws.onclose = () => {
      if (disposed) return
      setConnection("disconnected")
      pending.current = null
      queued.current = null
      if (latest.current) {
        latest.current = { ...latest.current, running: false }
        setSnapshot(latest.current)
      }
      setError(
        "Connection closed. Reconnect; if the API restarted or the session expired, start a new run.",
      )
    }
    ws.onerror = () => {
      if (!disposed)
        setError(
          "Local simulation API unavailable. Check port 8000 and reconnect.",
        )
    }
    return () => {
      disposed = true
      socket.current = null
      ws.close()
    }
  }, [id, controllerToken, retry])

  return {
    snapshot,
    latest,
    connection,
    error,
    command,
    reconnect: () => setRetry((n) => n + 1),
  }
}
