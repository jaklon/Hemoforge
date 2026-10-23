import { useEffect, useState, type FormEvent } from "react"
import { Badge, Icon, PageTitle, Panel } from "./workspace-ui"
import { useWorkspace } from "./workspace-context"

// No account backend yet: the profile lives in this browser only, and passwords are
// checked but never stored. Wire both to the auth service once sign-in exists.
const storageKey = "account-profile-v1"
const changed = "account-profile-changed"

// Dummy identity shown until real accounts exist.
const defaultProfile = {
  username: "researcher",
  name: "Demo Researcher",
  email: "researcher@example.com",
  company: "Sanguis Biofactory Lab",
  role: "Bioprocess scientist",
}

export type Profile = typeof defaultProfile

function loadProfile(): Profile {
  try {
    return { ...defaultProfile, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }
  } catch {
    return defaultProfile
  }
}

/** The signed-in profile, updated when the Account page saves. */
export function useProfile() {
  const [profile, setProfile] = useState(loadProfile)
  useEffect(() => {
    const sync = () => setProfile(loadProfile())
    addEventListener(changed, sync)
    return () => removeEventListener(changed, sync)
  }, [])
  return profile
}

export const initials = (profile: Profile) =>
  (profile.name || profile.username)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")

const profileFields: { key: keyof Profile; label: string; type: string; autoComplete: string; hint?: string }[] = [
  { key: "name", label: "Full name", type: "text", autoComplete: "name" },
  { key: "username", label: "Username", type: "text", autoComplete: "username", hint: "Shown in exports and audit notes." },
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

  function saveProfile(event: FormEvent) {
    event.preventDefault()
    try {
      localStorage.setItem(storageKey, JSON.stringify(profile))
      dispatchEvent(new Event(changed))
      notify("Profile saved", "success")
    } catch {
      notify("Could not save the profile in this browser", "error")
    }
  }

  function changePassword(event: FormEvent) {
    event.preventDefault()
    setPassword({ current: "", next: "", confirm: "" })
    notify("Password changes apply once account sign-in is enabled", "info")
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
        <Badge tone="warning">Demo account · saved in this browser</Badge>
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
              <button type="submit" className="button primary" disabled={!dirty}>
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
              <button type="submit" className="button primary" disabled={!rules.every((rule) => rule.ok)}>
                Update password
              </button>
            </footer>
          </form>
        </Panel>
      </div>
    </>
  )
}
