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

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))
const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches

/** Workspace sign-in. `error` is set when the session check itself failed (API or database down). */
export default function SignIn({
  error: initialError,
  onRetry,
}: {
  error?: string
  onRetry?: () => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
            style={{
              left: `${left}%`,
              width: size,
              height: size,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
        <svg
          className="signin-pulse"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path d="M0 60 H430 L460 60 L480 20 L505 105 L530 8 L552 84 L570 60 H1200" />
        </svg>
      </div>

      <form
        key={failures}
        className={`signin-card account-form${failures ? " is-shaking" : ""}`}
        onSubmit={submit}
      >
        <header>
          <a href="#" className="signin-back">
            ← HemoForge
          </a>
          <img
            className="signin-mark"
            src="/favicon.svg"
            alt=""
            width="44"
            height="44"
          />
          <h1>Sign in to the Research Workspace</h1>
          <p>Use your workspace account.</p>
        </header>
        <div className="grid gap-2">
          <div
            className="grid grid-cols-2 gap-2"
            role="group"
            aria-label="Demo accounts"
            aria-describedby="signin-demo-hint"
          >
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setUsername("researcher")
                setPassword("hemoforge-demo")
              }}
            >
              Workspace Demo
            </button>
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setUsername("pocdemo")
                setPassword("poc-demo")
              }}
            >
              PoC Demo
            </button>
          </div>
          <p id="signin-demo-hint" className="text-xs text-(--muted)">
            Fill in a demo account, then press Sign in.
          </p>
        </div>
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
          <div className="signin-password-field">
            <label htmlFor="signin-password">
              <span>Password</span>
            </label>
            <div className="signin-password-control">
              <input
                id="signin-password"
                type={showPassword ? "text" : "password"}
                required
                autoFocus={failures > 0}
                autoComplete="current-password"
                value={password}
                disabled={entering}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="text-button signin-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-controls="signin-password"
                disabled={entering}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
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
            className={`button primary signin-submit${busy ? " is-busy" : ""}${
              entering ? " is-done" : ""
            }`}
            disabled={busy}
          >
            {entering ? (
              <>
                <svg
                  className="signin-check"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
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
