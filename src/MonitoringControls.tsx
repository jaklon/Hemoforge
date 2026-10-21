import { useState } from "react"
import { useWorkspace } from "./workspace-context"
import { defaultMonitoringSettings } from "./research-settings"
import { Button, Details, NumberField } from "./workspace-ui"

export default function MonitoringControls() {
  const workspace = useWorkspace()
  const [draft, setDraft] = useState({
    ...workspace.monitoring,
    interval: workspace.reportInterval,
    days: workspace.roadmapDays,
  })
  const [message, setMessage] = useState("")
  const invalid =
    !Number.isInteger(draft.declineCount) ||
    draft.declineCount < 0 ||
    draft.declineCount > 100 ||
    !Number.isFinite(draft.dropPercent) ||
    draft.dropPercent < 0 ||
    draft.dropPercent > 100 ||
    (draft.staleHours !== null &&
      (!Number.isFinite(draft.staleHours) || draft.staleHours <= 0)) ||
    !Number.isFinite(draft.interval) ||
    draft.interval < 0.25 ||
    draft.interval > 168 ||
    !Number.isInteger(draft.days) ||
    draft.days < 1 ||
    draft.days > 365
  return (
    <Details title="Configure monitoring & reporting">
      <div className="settings-grid">
        <NumberField
          label="Consecutive declines to warn"
          value={draft.declineCount}
          min={0}
          max={100}
          step={1}
          hint="0 disables decline warnings."
          onChange={(value) => setDraft({ ...draft, declineCount: value! })}
        />
        <NumberField
          label="Minimum decline per step (%)"
          value={draft.dropPercent}
          min={0}
          max={100}
          onChange={(value) => setDraft({ ...draft, dropPercent: value! })}
        />
        <NumberField
          label="Stale sample after (hours)"
          value={draft.staleHours}
          min={0.01}
          optional
          hint="Blank disables sample-age warnings."
          onChange={(value) => setDraft({ ...draft, staleHours: value })}
        />
        <NumberField
          label="Report interval (hours)"
          value={draft.interval}
          min={0.25}
          max={168}
          onChange={(value) => setDraft({ ...draft, interval: value! })}
        />
        <NumberField
          label="Planning roadmap (days)"
          value={draft.days}
          min={1}
          max={365}
          step={1}
          onChange={(value) => setDraft({ ...draft, days: value! })}
        />
      </div>
      <div className="run-actions">
        <Button
          disabled={invalid}
          primary
          onClick={() => {
            workspace.setMonitoring({
              declineCount: draft.declineCount,
              dropPercent: draft.dropPercent,
              staleHours: draft.staleHours,
            })
            workspace.setReportInterval(draft.interval)
            workspace.setRoadmapDays(draft.days)
            setMessage(
              "Monitoring and report settings applied to all batches and exports.",
            )
          }}
        >
          Apply settings
        </Button>
        <Button
          onClick={() => {
            setDraft({ ...defaultMonitoringSettings, interval: 3, days: 21 })
            setMessage("Default settings loaded. Apply to use them.")
          }}
        >
          Load defaults
        </Button>
      </div>
      <p role="status">
        {invalid
          ? "Correct the highlighted values before applying settings."
          : message}
      </p>
    </Details>
  )
}
