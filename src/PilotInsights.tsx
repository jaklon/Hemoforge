import { Badge, Icon, Panel } from "./workspace-ui"
import { useCultureData } from "./workspace-context"
import {
  erythroidStages,
  overallHealth,
  plannedPhase,
  roadmapHours,
  roadmapPhases,
  trendHealth,
  type Verdict,
} from "./pilot-insights"

const verdictLabel: Record<Verdict, string> = {
  improving: "Improving",
  stable: "Stable",
  worsening: "Worsening",
  no_data: "No data",
}

const format = (value: number) => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toPrecision(3))

const percent = (hour: number) => `${Math.min(100, (hour / roadmapHours) * 100)}%`

/** 21-day plan: three protocol phases with 3-hourly checkpoints, the replay hour, and where data ends. */
export function CheckpointRoadmap({ hour }: { hour: number }) {
  const { replayEndHour, reportInterval } = useCultureData()
  const phase = plannedPhase(hour)
  const checkpoints = Math.floor(roadmapHours / reportInterval)
  const reached = Math.floor(hour / reportInterval)
  return (
    <Panel
      title="21-day checkpoint roadmap"
      caption={`Planned protocol · a report every ${reportInterval}h · ${reached} of ${checkpoints} checkpoints reached`}
      action={<Badge>Plan, not a forecast</Badge>}
    >
      <div className="roadmap">
        <div className="roadmap-track" role="img" aria-label={`Day ${(hour / 24).toFixed(1)} of 21, in the ${phase.name} phase`}>
          {roadmapPhases.map((item) => (
            <span
              key={item.name}
              className={`roadmap-phase${item === phase ? " is-current" : ""}`}
              style={{ left: percent(item.from), width: `${((item.to - item.from) / roadmapHours) * 100}%` }}
            >
              <strong>{item.name}</strong>
              <small>
                Day {item.from / 24}–{item.to / 24}
              </small>
            </span>
          ))}
          <span className="roadmap-data" style={{ width: percent(replayEndHour) }} title={`Source data through ${replayEndHour}h`} />
          <span className="roadmap-now" style={{ left: percent(hour) }}>
            <b>Day {(hour / 24).toFixed(1)}</b>
          </span>
        </div>
        <ol className="roadmap-milestones">
          {roadmapPhases.map((item) => (
            <li key={item.name} className={hour >= item.to ? "is-done" : item === phase ? "is-current" : undefined}>
              <Icon name={hour >= item.to ? "check" : "arrow"} />
              <span>
                <strong>
                  Day {item.to / 24} · end of {item.name.toLowerCase()}
                </strong>
                <small>{item.focus}</small>
              </span>
            </li>
          ))}
          <li className="is-pending">
            <Icon name="report" />
            <span>
              <strong>Harvest & laboratory QC</strong>
              <small>Release stays with the lab · pending results</small>
            </span>
          </li>
        </ol>
        <p className="roadmap-note">
          <i /> Source data covers day 0–{(replayEndHour / 24).toFixed(1)}. Later days are the planned schedule only;
          nothing is extrapolated onto them.
        </p>
      </div>
    </Panel>
  )
}

/** Each variable compared between its last two samples, judged by its healthy direction. */
export function TrendHealth({ hour, replicate, warnings }: { hour: number; replicate: number; warnings: number }) {
  const { batchMeasurements, batchId } = useCultureData()
  const items = trendHealth(batchMeasurements(replicate), hour)
  const overall = overallHealth(items, warnings)
  return (
    <Panel
      title="Trend health review"
      caption={`${batchId(replicate)} · last two samples of each variable, through ${hour}h`}
      action={
        <Badge tone={overall.tone === "warning" ? "warning" : overall.tone === "normal" ? "success" : "neutral"}>
          {overall.tone === "warning" ? "Needs attention" : overall.tone === "normal" ? "Healthy" : "No data"}
        </Badge>
      }
    >
      <p className={`trend-summary is-${overall.tone}`}>
        {overall.label}
        {warnings > 0 && (
          <>
            {" · "}
            <a href="#guard">Review in Guard</a>
          </>
        )}
      </p>
      <ul className="trend-list">
        {items.map((item) => (
          <li key={item.key} className={`is-${item.verdict}`}>
            <span className="trend-name">
              <strong>{item.label}</strong>
              <small>{item.note}</small>
            </span>
            <span className="trend-values">
              {item.latest ? (
                <>
                  {item.previous && <>{format(item.previous.value)} → </>}
                  <strong>{format(item.latest.value)}</strong> {item.unit}
                  <small>
                    {item.previous ? `${item.previous.hour}h → ${item.latest.hour}h` : `sampled ${item.latest.hour}h`}
                  </small>
                </>
              ) : (
                "—"
              )}
            </span>
            <span className={`trend-verdict is-${item.verdict}`}>{verdictLabel[item.verdict]}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** Stage ladder from the GSE53983 reference. Shows the stage the plan expects, never a guessed one. */
export function StageEstimate({ hour }: { hour: number }) {
  const phase = plannedPhase(hour)
  return (
    <Panel
      title="Erythroid stage estimate"
      caption="GSE53983 reference stages · 5 stages × 3 replicates"
      action={<Badge tone="warning">Not estimated</Badge>}
    >
      <ol className="stage-ladder">
        {erythroidStages.map((stage, index) => (
          <li key={stage} className={phase.stages.includes(index) ? "is-planned" : undefined}>
            <span>{index + 1}</span>
            {stage}
            {phase.stages.includes(index) && <small>Planned for {phase.name.toLowerCase()}</small>}
          </li>
        ))}
      </ol>
      <div className="stage-status">
        <p>
          <strong>Measured stage: none yet.</strong> This batch has no expression profile or maturation markers, and no
          validated GSE53983 classifier is installed, so no stage is estimated. Culture time alone is not used to guess
          one.
        </p>
        <p>
          To enable it: add RNA-seq counts per sample (normalised to log₂ CPM + 1) and install the trained classifier
          with its out-of-fold metrics. Flow markers such as CD71, CD235a, and enucleation % can be shown alongside.
        </p>
      </div>
    </Panel>
  )
}
