import { useState, type ReactNode } from "react"
import { Icon, Badge } from "./workspace-ui"
import { pocMonitorHash, type LiveModule } from "./lab-session"
import "./poc.css"

export const liveModuleNames: Record<LiveModule, string> = {
  dashboard: "Dashboard",
  guard: "Bioreactor Guard",
  pilot: "ErythroPilot",
  plan: "CulturePlan",
}

export default function PocShell({
  sessionId,
  module = "dashboard",
  children,
  status,
}: {
  sessionId?: string | null
  module?: LiveModule
  children: ReactNode
  status?: ReactNode
}) {
  const [menu, setMenu] = useState(false)
  const [pinned, setPinned] = useState(true)
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const collapsed = !pinned && !hover && !focused
  return (
    <div
      className={`app-shell poc-shell${pinned ? " sidebar-pinned" : ""}${
        collapsed ? " sidebar-collapsed" : ""
      }`}
    >
      <a
        className="skip-link"
        href="#poc-main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById("poc-main")?.focus()
        }}
      >
        Skip to content
      </a>
      <aside
        id="poc-navigation"
        className={`sidebar${menu ? " is-open" : ""}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") setHover(true)
        }}
        onPointerLeave={() => setHover(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setFocused(false)
        }}
      >
        <a
          className="brand"
          href="#poc"
          aria-label="HemoForge · PoC & Simulation"
        >
          <img
            className="brand-mark"
            src="/favicon.svg"
            width="40"
            height="40"
            alt=""
          />
          <span>
            <strong>
              Hemo<span>Forge</span>
            </strong>
          </span>
        </a>
        <div className="workspace-context">
          <span>DEDICATED WORKSPACE</span>
          <strong>PoC & Simulation</strong>
          <small>
            {sessionId
              ? `MONITOR 02 · ${sessionId.slice(0, 8).toUpperCase()}`
              : "Start a two-monitor session"}
          </small>
        </div>
        <nav aria-label="Simulation modules">
          <div className="nav-group">
            <div className="nav-group-label">
              <span>{sessionId ? "Live workspace" : "Simulation access"}</span>
              <button
                className="sidebar-pin"
                aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
                aria-pressed={pinned}
                aria-controls="poc-navigation"
                onClick={() => setPinned(!pinned)}
              >
                <Icon name="pin" />
              </button>
            </div>
            {sessionId ? (
              (["dashboard", "guard", "pilot", "plan"] as const).map((view) => (
                <a
                  key={view}
                  href={pocMonitorHash(sessionId, view)}
                  className={view === module ? "active" : ""}
                  aria-current={view === module ? "page" : undefined}
                  title={liveModuleNames[view]}
                  onClick={() => setMenu(false)}
                >
                  <Icon name={view} />
                  <strong>{liveModuleNames[view]}</strong>
                </a>
              ))
            ) : (
              <>
                <a href="#poc" className="active" aria-current="page">
                  <Icon name="dashboard" />
                  <strong>Simulation launcher</strong>
                </a>
                <a href="#poc/lab">
                  <Icon name="dna" />
                  <strong>Monitor 01 · Virtual Lab</strong>
                </a>
              </>
            )}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <Badge tone="warning">Synthetic · PoC only</Badge>
          <p>
              Dedicated synthetic data. Guided mode follows 3D frames;
              Dataset Live follows the backend clock.
          </p>
        </div>
        <nav className="nav-signout" aria-label="Leave simulation">
          <a href="#poc">
            <Icon name="home" />
            <strong>PoC launcher</strong>
          </a>
          <a href="#dashboard" target="_blank" rel="noopener">
            <Icon name="logout" />
            <strong>Main HemoForge ↗</strong>
          </a>
        </nav>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          <span>PoC & Simulation</span>
          <Icon name="arrow" />
          <strong>{sessionId ? liveModuleNames[module] : "Launcher"}</strong>
        </div>
        <div className="header-actions">
          {status}
          <button
            className="button menu-toggle"
            aria-controls="poc-navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? "Close" : "Menu"}
          </button>
        </div>
      </header>
      <main
        id="poc-main"
        className={`workspace workspace-${module}`}
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  )
}
