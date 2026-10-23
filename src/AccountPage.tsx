import { useState, type FormEvent } from "react"
import { Badge, Icon, PageTitle, Panel } from "./workspace-ui"
import { useWorkspace } from "./workspace-context"
import { changePassword as savePassword, initials, saveProfile as storeProfile, useProfile, type Profile } from "./account"

export { initials, useProfile, type Profile } from "./account"

const profileFields: { key: keyof Profile; label: string; type: string; autoComplete: string; hint?: string }[] = [
  { key: "name", label: "Full name", type: "text", autoComplete: "name" },
  { key: "username", label: "Username", type: "text", autoComplete: "username", hint: "Used to sign in, and shown in exports and audit notes." },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  { key: "role", label: "Role", type: "text", autoComplete: "organization-title" },
  { key: "company", label: "Company / institution", type: "text", autoComplete: "organization" },
]

export default function AccountPage() {
  const { notify } = useWorkspace()
  const saved = useProfile()
  const [profile, setProfile] = useState(saved)
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" })
  const dirty = JSON.stringify(profile) !== JSON.stringify(saved)

  const rules = [
    { ok: password.next.length >= 8, label: "At least 8 characters" },
    { ok: !!password.next && password.next === password.confirm, label: "Both new passwords match" },
    { ok: !!password.next && password.next !== password.current, label: "Different from the current password" },
  ]

  const [busy, setBusy] = useState(false)

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      setProfile(await storeProfile(profile))
      notify("Profile saved", "success")
    } catch (error) {
      notify(`Could not save the profile · ${(error as Error).message}`, "error")
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await savePassword(password.current, password.next)
      setPassword({ current: "", next: "", confirm: "" })
      notify("Password updated", "success")
    } catch (error) {
      notify(`Could not update the password · ${(error as Error).message}`, "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageTitle title="Account" description="Your profile and sign-in details." />
      <section className="account-hero">
        <span className="account-avatar" aria-hidden="true">
          {initials(saved)}
        </span>
        <div>
          <h2>{saved.name || saved.username}</h2>
          <p>
            @{saved.username} · {saved.role || "No role set"}
          </p>
          <p>{saved.company}</p>
        </div>
        <Badge tone="success">Signed in · saved to the database</Badge>
      </section>
      <div className="account-grid">
        <Panel title="Profile" caption="How you appear across the workspace and in exports.">
          <form className="account-form" onSubmit={saveProfile}>
            <div className="account-fields">
              {profileFields.map((field) => (
                <label key={field.key} className={field.key === "company" ? "is-wide" : undefined}>
                  <span>{field.label}</span>
                  <input
                    type={field.type}
                    required={field.key === "username"}
                    value={profile[field.key]}
                    autoComplete={field.autoComplete}
                    onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })}
                  />
                  {field.hint && <small>{field.hint}</small>}
                </label>
              ))}
            </div>
            <footer>
              <button type="button" className="button" disabled={!dirty} onClick={() => setProfile(saved)}>
                Discard
              </button>
              <button type="submit" className="button primary" disabled={!dirty || busy}>
                Save profile
              </button>
            </footer>
          </form>
        </Panel>
        <Panel title="Password" caption="Choose a password you don't use elsewhere.">
          <form className="account-form" onSubmit={changePassword}>
            <div className="account-fields is-single">
              <label>
                <span>Current password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password.current}
                  onChange={(event) => setPassword({ ...password, current: event.target.value })}
                />
              </label>
              <label>
                <span>New password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password.next}
                  onChange={(event) => setPassword({ ...password, next: event.target.value })}
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password.confirm}
                  onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
                />
              </label>
            </div>
            <ul className="account-rules" aria-label="Password requirements">
              {rules.map((rule) => (
                <li key={rule.label} className={rule.ok ? "is-ok" : undefined}>
                  <Icon name="check" />
                  {rule.label}
                </li>
              ))}
            </ul>
            <footer>
              <button type="submit" className="button primary" disabled={busy || !rules.every((rule) => rule.ok)}>
                Update password
              </button>
            </footer>
          </form>
        </Panel>
      </div>
    </>
  )
}
