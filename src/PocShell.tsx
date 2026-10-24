import { useEffect, useState, type ReactNode } from "react"
import { Icon, SignOutLink } from "./workspace-ui"
import { initials, loadAccount, useAccount } from "./account"
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
  const account = useAccount()
  // PoC routes skip the sign-in gate, so a direct visit may not have checked yet.
  useEffect(() => {
    if (account === undefined) loadAccount().catch(() => {})
  }, [])
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
        // Only keyboard focus holds the sidebar open; a mouse click on the pin must not.
        onPointerDown={(event) => setFocused(event.pointerType === "touch")}
        onFocusCapture={(event) => {
          if (event.target.matches(":focus-visible")) setFocused(true)
        }}
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
            src={`${import.meta.env.BASE_URL}favicon.svg`}
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
        {account && (
          <nav className="nav-signout" aria-label="Account">
            {/* The PoC demo account has no workspace account page. */}
            <a
              href={account.username === "pocdemo" ? "#poc" : "#account"}
              className="nav-user"
              title={collapsed ? `${account.name} · ${account.company}` : undefined}
            >
              <span className="nav-avatar" aria-hidden="true">
                {initials(account)}
              </span>
              <strong>
                {account.name || account.username}
                <small>{account.company}</small>
              </strong>
            </a>
            <SignOutLink collapsed={collapsed} />
          </nav>
        )}
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
