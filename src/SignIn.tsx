import { useState, type FormEvent } from "react"
import { signIn } from "./account"

// Drifting blood cells behind the card: [left %, size px, duration s, delay s].
const CELLS = [
  [6, 54, 26, 0],
  [18, 30, 19, -6],
  [31, 72, 32, -14],
  [47, 24, 17, -3],
  [61, 46, 24, -18],
  [74, 64, 29, -9],
  [86, 34, 21, -12],
  [94, 50, 27, -21],
]

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/** Workspace sign-in. `error` is set when the session check itself failed (API or database down). */
export default function SignIn({ error: initialError, onRetry }: { error?: string; onRetry?: () => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(initialError ?? "")
  const [busy, setBusy] = useState(false)
  const [entering, setEntering] = useState(false)
  // Bumped on each failed attempt so the card shake replays.
  const [failures, setFailures] = useState(0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await signIn(username.trim(), password, async () => {
        setEntering(true)
        if (!reducedMotion()) await pause(1100)
      })
    } catch (failure) {
      setError((failure as Error).message)
      setPassword("")
      setFailures((count) => count + 1)
      setBusy(false)
    }
  }

  return (
    <main className={`signin${entering ? " is-entering" : ""}`}>
      <div className="signin-backdrop" aria-hidden="true">
        <div className="signin-glow is-red" />
        <div className="signin-glow is-teal" />
        <div className="signin-grid" />
        {CELLS.map(([left, size, duration, delay]) => (
          <span
            key={left}
            className="signin-cell"
            style={{ left: `${left}%`, width: size, height: size, animationDuration: `${duration}s`, animationDelay: `${delay}s` }}
          />
        ))}
        <svg className="signin-pulse" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0 60 H430 L460 60 L480 20 L505 105 L530 8 L552 84 L570 60 H1200" />
        </svg>
      </div>

      <form key={failures} className={`signin-card account-form${failures ? " is-shaking" : ""}`} onSubmit={submit}>
        <header>
          <a href="#" className="signin-back">
            ← HemoForge
          </a>
          <div className="signin-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48">
              <path d="M24 5c7 9 14 17 14 25a14 14 0 0 1-28 0c0-8 7-16 14-25Z" />
              <path className="signin-mark-beat" d="M13 31h6l2.5-5 4 9 3-6H35" />
            </svg>
          </div>
          <h1>Sign in to the Research Workspace</h1>
          <p>Use your workspace account.</p>
        </header>
        <div className="account-fields is-single">
          <label>
            <span>Username</span>
            <input
              required
              autoFocus={!failures}
              autoComplete="username"
              value={username}
              disabled={entering}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              required
              autoFocus={failures > 0}
              autoComplete="current-password"
              value={password}
              disabled={entering}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="signin-error" role="alert">
            {error}
            {onRetry && (
              <button type="button" className="text-button" onClick={onRetry}>
                Retry
              </button>
            )}
          </p>
        )}
        <footer>
          <button
            type="submit"
            className={`button primary signin-submit${busy ? " is-busy" : ""}${entering ? " is-done" : ""}`}
            disabled={busy}
          >
            {entering ? (
              <>
                <svg className="signin-check" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                Welcome back
              </>
            ) : busy ? (
              <>
                <span className="signin-spinner" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </footer>
      </form>

      <div className="signin-wipe" aria-hidden="true" />
    </main>
  )
}
