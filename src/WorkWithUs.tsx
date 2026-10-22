import { useState, type CSSProperties, type FormEvent } from "react"
import { LocalIcon, Logo } from "./Landing"
import { submitProposal } from "./python-api"

// Placeholder tiers until pricing is decided.
const plans = [
  {
    name: "Pilot",
    price: "TBD",
    blurb: "Try HemoForge on one culture line with your own data.",
    features: ["Placeholder feature", "Placeholder feature", "Placeholder feature"],
  },
  {
    name: "Lab",
    price: "TBD",
    blurb: "Full workspace for a research team running several batches.",
    features: ["Placeholder feature", "Placeholder feature", "Placeholder feature", "Placeholder feature"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "Integration with your bioreactors, LIMS and quality process.",
    features: ["Placeholder feature", "Placeholder feature", "Placeholder feature"],
  },
]

export default function WorkWithUs({ onEnter }: { onEnter: () => void }) {
  const [plan, setPlan] = useState("Lab")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  function pick(name: string) {
    setPlan(name)
    document.getElementById("proposal")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError("")
    try {
      await submitProposal({
        name: String(form.get("name")),
        email: String(form.get("email")),
        company: String(form.get("company")),
        plan,
        proposal: String(form.get("proposal")),
      })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the proposal. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lp">
      <header className="lp-nav scrolled">
        <div className="lp-nav-inner">
          <button className="lp-brand" onClick={() => (location.hash = "")}>
            <Logo />
            <span>HemoForge</span>
          </button>
          <div className="lp-nav-cta" style={{ marginLeft: "auto" }}>
            <button className="lp-link" onClick={() => (location.hash = "")}>Back to home</button>
            <button className="lp-btn primary sm" onClick={onEnter}>Launch workspace</button>
          </div>
        </div>
      </header>

      <section className="lp-section lp-wwu">
        <div className="lp-wrap">
          <div className="lp-head center">
            <span className="lp-eyebrow red">Work with us</span>
            <h1>Bring HemoForge <em>to your lab.</em></h1>
            <p className="lp-muted">
              We partner with biotech companies, biofactories and research institutes. Pick a starting point, then send
              us a proposal.
            </p>
          </div>

          <div className="lp-plans">
            {plans.map((p, i) => (
              <article key={p.name} className={`lp-card lp-plan${p.featured ? " featured" : ""}`} style={{ "--d": i } as CSSProperties}>
                {p.featured && <span className="lp-tag">Most popular</span>}
                <h3>{p.name}</h3>
                <strong className="lp-price">{p.price}</strong>
                <p>{p.blurb}</p>
                <ul className="lp-checks">
                  {p.features.map((f, j) => <li key={j}><LocalIcon name="check" /> {f}</li>)}
                </ul>
                <button className={`lp-btn ${p.featured ? "primary" : "ghost"} wide`} onClick={() => pick(p.name)}>
                  Choose {p.name}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="proposal" className="lp-section">
        <div className="lp-wrap lp-split wide">
          <div className="lp-sticky">
            <span className="lp-eyebrow teal">Proposal</span>
            <h2>Tell us about <em>your project.</em></h2>
            <p className="lp-muted">We read every proposal and reply within a few business days.</p>
          </div>

          {sent ? (
            <div className="lp-card lp-form" role="status">
              <h3>Proposal received</h3>
              <p>Thanks. We'll be in touch about the {plan} plan.</p>
              <button className="lp-btn ghost" onClick={() => setSent(false)}>Send another</button>
            </div>
          ) : (
            <form className="lp-card lp-form" onSubmit={submit}>
              <div className="lp-form-row">
                <label>
                  <span>Full name</span>
                  <input name="name" required autoComplete="name" />
                </label>
                <label>
                  <span>Work email</span>
                  <input type="email" name="email" required autoComplete="email" placeholder="you@company.com" />
                </label>
              </div>
              <div className="lp-form-row">
                <label>
                  <span>Company</span>
                  <input name="company" required autoComplete="organization" />
                </label>
                <label>
                  <span>Plan</span>
                  <select name="plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
                    {plans.map((p) => <option key={p.name}>{p.name}</option>)}
                    <option>Not sure yet</option>
                  </select>
                </label>
              </div>
              <label>
                <span>Proposal</span>
                <textarea
                  name="proposal"
                  required
                  rows={6}
                  placeholder="Your culture process, data sources, timeline and what you want HemoForge to do."
                />
              </label>
              {error && <p className="lp-form-error" role="alert">{error}</p>}
              <button className="lp-btn primary wide" disabled={busy}>
                {busy ? "Sending…" : <>Submit proposal <LocalIcon name="arrow" /></>}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <p className="lp-fine">© 2026 Team HemoForge · GenoHack 2026</p>
        </div>
      </footer>
    </div>
  )
}
