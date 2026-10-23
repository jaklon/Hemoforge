import { useState, type FormEvent } from "react"
import { Badge, PageTitle, Panel } from "./workspace-ui"
import { useWorkspace } from "./workspace-context"

// No account backend yet: the profile lives in this browser only, and passwords are
// checked but never stored. Wire both to the auth service once sign-in exists.
const storageKey = "account-profile-v1"

const emptyProfile = { username: "researcher", name: "", email: "", company: "", role: "" }

type Profile = typeof emptyProfile

function loadProfile(): Profile {
  try {
    return { ...emptyProfile, ...JSON.parse(localStorage.getItem(storageKey) ?? "{}") }
  } catch {
    return emptyProfile
  }
}

const profileFields: [keyof Profile, string, string][] = [
  ["username", "Username", "text"],
  ["name", "Full name", "text"],
  ["email", "Email", "email"],
  ["company", "Company / institution", "text"],
  ["role", "Role", "text"],
]

export default function AccountPage() {
  const { notify } = useWorkspace()
  const [profile, setProfile] = useState(loadProfile)
  const [password, setPassword] = useState({ current: "", next: "", confirm: "" })

  const passwordProblem = !password.next
    ? null
    : password.next.length < 8
      ? "New password needs at least 8 characters."
      : password.next !== password.confirm
        ? "The two new passwords do not match."
        : password.next === password.current
          ? "New password must differ from the current one."
          : null

  function saveProfile(event: FormEvent) {
    event.preventDefault()
    try {
      localStorage.setItem(storageKey, JSON.stringify(profile))
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
      <PageTitle
        title="Account"
        description="Your profile and sign-in details."
        action={<Badge tone="warning">Accounts not connected yet · saved in this browser</Badge>}
      />
      <div className="account-grid">
        <Panel title="Profile" caption={`Signed in as ${profile.username || "—"}`}>
          <form className="account-form" onSubmit={saveProfile}>
            {profileFields.map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  type={type}
                  required={key === "username"}
                  value={profile[key]}
                  autoComplete={key === "username" ? "username" : key === "company" ? "organization" : key}
                  onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                />
              </label>
            ))}
            <div>
              <button type="submit" className="button primary">
                Save profile
              </button>
            </div>
          </form>
        </Panel>
        <Panel title="Change password">
          <form className="account-form" onSubmit={changePassword}>
            <label>
              Current password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password.current}
                onChange={(event) => setPassword({ ...password, current: event.target.value })}
              />
            </label>
            <label>
              New password
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
              Confirm new password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password.confirm}
                onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
              />
            </label>
            {passwordProblem && (
              <p className="dash-problem" role="alert">
                {passwordProblem}
              </p>
            )}
            <div>
              <button type="submit" className="button primary" disabled={!!passwordProblem}>
                Update password
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  )
}
