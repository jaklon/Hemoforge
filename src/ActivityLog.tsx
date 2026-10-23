import { useMemo, useState } from "react"
import { Badge, Button, Icon, PageTitle, Panel } from "./workspace-ui"
import { useCultureData, useWorkspace } from "./workspace-context"
import { guardEventInfo } from "./guard-insights"
import { loadLimits, processVariables, safeLimits, simulate } from "./dashboard-sim"

type Tab = "notifications" | "process"

const pageNames: Record<string, string> = {
  data: "Data & Runs",
  dashboard: "Dashboard",
  evo2: "RareMatch",
  plan: "CulturePlan",
  guard: "Bioreactor Guard",
  pilot: "ErythroPilot",
  report: "Research Report",
  bot: "HemoBot",
  methods: "Methods & References",
  account: "Account",
  activity: "Activity log",
}

const toneLabel = { success: "Success", info: "Info", error: "Error" } as const

const dayLabel = (date: Date) => {
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString(undefined, { dateStyle: "medium" })
}

/** Notifications the workspace raised, and what happened in the culture up to the replay hour. */
export default function ActivityLog({ hour, replicate }: { hour: number; replicate: number }) {
  const { activity, clearActivity } = useWorkspace()
  const { analyze, batchMeasurements, batchId, monitoring } = useCultureData()
  const [tab, setTab] = useState<Tab>("notifications")
  const [query, setQuery] = useState("")
  const [tone, setTone] = useState("all")
  const [kind, setKind] = useState("all")
  const needle = query.trim().toLowerCase()

  const notifications = activity.filter(
    (entry) =>
      (tone === "all" || entry.tone === tone) &&
      (!needle || `${entry.message} ${pageNames[entry.page] ?? entry.page}`.toLowerCase().includes(needle)),
  )
  const days = new Map<string, typeof notifications>()
  for (const entry of notifications) {
    const day = dayLabel(new Date(entry.at))
    days.set(day, [...(days.get(day) ?? []), entry])
  }

  // Rebuilt from the replay, so it always matches what Guard and the Dashboard show at this hour.
  const process = useMemo(() => {
    const warnings = analyze(batchMeasurements(replicate), hour).events.map((event) => ({
      key: `guard-${event.id}`,
      hour: event.hour,
      kind: "warning" as const,
      title: guardEventInfo(event, monitoring).title,
      detail: event.reason,
      href: "#guard",
      source: `Bioreactor Guard · ${batchId(replicate)}`,
    }))
    const runs = simulate(safeLimits(loadLimits()), hour)
    const actions = processVariables.flatMap((variable) =>
      runs[variable.id].actions.map((action) => ({
        key: `dash-${variable.id}-${action.hour}-${action.label}`,
        hour: action.hour,
        kind: "action" as const,
        title: `${action.label} · ${variable.name}`,
        detail: `${action.before.toFixed(variable.digits)} → ${action.after.toFixed(variable.digits)} ${variable.unit}${
          action.linkedFrom
            ? ` · triggered by ${processVariables.find((item) => item.id === action.linkedFrom)!.name}`
            : ""
        }`,
        href: "#dashboard",
        source: "Dashboard · simulated control",
      })),
    )
    return [...warnings, ...actions].sort((a, b) => b.hour - a.hour)
  }, [analyze, batchMeasurements, batchId, monitoring, replicate, hour])

  const events = process.filter(
    (event) =>
      (kind === "all" || event.kind === kind) &&
      (!needle || `${event.hour}h ${event.title} ${event.detail}`.toLowerCase().includes(needle)),
  )

  return (
    <>
      <PageTitle
        title="Activity log"
        description="Every notification the workspace raised, and the culture events up to the replay hour."
        action={
          tab === "notifications" && (
            <Button
              disabled={!activity.length}
              onClick={() => {
                if (confirm("Clear all notifications from this browser? This cannot be undone.")) clearActivity()
              }}
            >
              Clear notifications
            </Button>
          )
        }
      />
      <Panel
        title={tab === "notifications" ? "Notifications" : "Process log"}
        caption={
          tab === "notifications"
            ? "Saved in this browser · newest first · last 300 kept"
            : `${batchId(replicate)} · replay through ${hour}h · newest first`
        }
        action={
          <fieldset className="guard-segmented">
            <legend className="sr-only">Log</legend>
            <button type="button" aria-pressed={tab === "notifications"} onClick={() => setTab("notifications")}>
              Notifications <Badge>{activity.length}</Badge>
            </button>
            <button type="button" aria-pressed={tab === "process"} onClick={() => setTab("process")}>
              Process log <Badge>{process.length}</Badge>
            </button>
          </fieldset>
        }
      >
        <div className="report-filters">
          <label className="search-field">
            <span className="sr-only">Search the log</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="6" />
              <path d="m20 20-4.5-4.5" />
            </svg>
            <input
              type="search"
              placeholder={tab === "notifications" ? "Search messages or pages" : "Search by hour or event, e.g. 120h"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {tab === "notifications" ? (
            <label>
              Type
              <select value={tone} onChange={(event) => setTone(event.target.value)}>
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="info">Info</option>
                <option value="error">Error</option>
              </select>
            </label>
          ) : (
            <label>
              Type
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="all">All</option>
                <option value="warning">Guard warnings</option>
                <option value="action">Automated actions</option>
              </select>
            </label>
          )}
          <span role="status">
            {tab === "notifications"
              ? `${notifications.length} of ${activity.length}`
              : `${events.length} of ${process.length}`}
          </span>
        </div>

        {tab === "notifications" ? (
          notifications.length ? (
            [...days].map(([day, entries]) => (
              <section key={day} className="activity-day">
                <h3>{day}</h3>
                <ul className="activity-list">
                  {entries.map((entry) => (
                    <li key={entry.id} className={`is-${entry.tone}`}>
                      <span className="activity-dot" aria-hidden="true" />
                      <span className="activity-body">
                        <strong>{entry.message}</strong>
                        <small>
                          {toneLabel[entry.tone]} · on{" "}
                          {pageNames[entry.page] ? (
                            <a href={`#${entry.page}`}>{pageNames[entry.page]}</a>
                          ) : (
                            entry.page
                          )}
                        </small>
                      </span>
                      <time dateTime={entry.at}>
                        {new Date(entry.at).toLocaleTimeString(undefined, { timeStyle: "short" })}
                      </time>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <div className="empty-state activity-empty">
              <strong>{activity.length ? "No matching notifications" : "No notifications yet"}</strong>
              <p>
                {activity.length
                  ? "Change the search or type filter."
                  : "Uploads, model runs, downloads and connection changes appear here as they happen."}
              </p>
            </div>
          )
        ) : events.length ? (
          <ul className="activity-list is-process">
            {events.map((event) => (
              <li key={event.key} className={`is-${event.kind}`}>
                <span className="activity-hour">{event.hour}h</span>
                <span className="activity-body">
                  <strong>
                    {event.kind === "warning" && <Icon name="alert" />}
                    {event.title}
                  </strong>
                  <small>{event.detail}</small>
                </span>
                <a className="activity-source" href={event.href}>
                  {event.source}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state activity-empty">
            <strong>{process.length ? "No matching events" : "No events yet"}</strong>
            <p>
              {process.length
                ? "Change the search or type filter."
                : "Advance the replay to see Guard warnings and automated control actions."}
            </p>
          </div>
        )}
      </Panel>
    </>
  )
}
