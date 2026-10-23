import { useState, type FormEvent } from "react"
import { signIn } from "./account"

/** Workspace sign-in. `error` is set when the session check itself failed (API or database down). */
export default function SignIn({ error: initialError, onRetry }: { error?: string; onRetry?: () => void }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(initialError ?? "")
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await signIn(username.trim(), password)
    } catch (failure) {
      setError((failure as Error).message)
      setPassword("")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="signin">
      <form className="signin-card account-form" onSubmit={submit}>
        <header>
          <a href="#" className="signin-back">
            ← HemoForge
          </a>
          <h1>Sign in to the Research Workspace</h1>
          <p>Use your workspace account.</p>
        </header>
        <div className="account-fields is-single">
          <label>
            <span>Username</span>
            <input
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
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
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </footer>
      </form>
    </main>
  )
}
