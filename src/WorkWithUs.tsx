import { useRef, useState, type FormEvent } from "react"
import { Logo } from "./Landing"
import { submitProposal } from "./python-api"

const plans = [
  {
    name: "Pilot",
    audience: "For a first research study",
    blurb: "Evaluate one culture workflow before expanding.",
    scope: "One agreed culture dataset and a focused research question.",
    deliverables: "Import mapping, a configured replay and warning workflow, and an example checkpoint report.",
    limits: "Dataset size, study duration and access are agreed in the proposal. Sensor connections are outside the starting scope.",
    support: "Guided setup and a handover review; follow-up support is scoped in writing.",
    quote: "Based on dataset preparation, setup and the review work required.",
  },
  {
    name: "Lab",
    audience: "For research teams",
    blurb: "Review multiple batches with one shared analysis approach.",
    scope: "An agreed set of studies, batches and team access needs.",
    deliverables: "Dataset onboarding, batch comparison, researcher-set warning rules, and a report handover.",
    limits: "Users, datasets, storage and analysis volume are specified in the proposal. Research use only.",
    support: "Team onboarding and scheduled workflow reviews, with a defined support channel and period.",
    quote: "Based on team size, dataset volume, configuration and support needs.",
  },
  {
    name: "Enterprise",
    audience: "For integration discovery",
    blurb: "Define a fit for your lab systems and review process.",
    scope: "Discovery for deployment, data governance and sensor or LIMS connections.",
    deliverables: "A requirements review, feasibility assessment and a phased integration proposal.",
    limits: "Connectors, deployment and validation are separate work to be agreed; they are not included as ready-made features.",
    support: "Technical discovery and a named project contact; ongoing service terms are agreed separately.",
    quote: "Discovery and implementation are quoted as separate phases after review.",
  },
]

export default function WorkWithUs({ onEnter }: { onEnter: () => void }) {
  const [plan, setPlan] = useState("Lab")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const inquiry = useRef<HTMLTextAreaElement>(null)

  function pick(name: string) {
    setPlan(name)
    document.getElementById("proposal")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })
    inquiry.current?.focus({ preventScroll: true })
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
    <div className="lp lp-business">
      <header className="lp-nav scrolled">
        <div className="lp-nav-inner">
          <button className="lp-brand" aria-label="HemoForge home" onClick={() => (location.hash = "")}>
            <Logo />
            <span>HemoForge</span>
          </button>
          <div className="lp-nav-cta" style={{ marginLeft: "auto" }}>
            <button className="lp-btn ghost sm" onClick={onEnter}>Sign in</button>
            <button className="lp-btn primary sm" onClick={() => pick(plan)}>Book a demo</button>
          </div>
        </div>
      </header>

      <section className="lp-section lp-wwu">
        <div className="lp-wrap">
          <div className="lp-head center">
            <span className="lp-eyebrow red">Work with us</span>
            <h1>Bring HemoForge <em>to your lab.</em></h1>
            <p className="lp-muted">
              Choose a starting scope for your research team. Book a demo and tell us about your data so we can prepare a written proposal.
            </p>
          </div>

          <div className="lp-plans">
            {plans.map((p) => (
              <article key={p.name} className="lp-card lp-plan">
                <p className="lp-plan-audience">{p.audience}</p>
                <h3>{p.name}</h3>
                <p>{p.blurb}</p>
                <dl className="lp-plan-details">
                  <div><dt>Scope</dt><dd>{p.scope}</dd></div>
                  <div><dt>Deliverables</dt><dd>{p.deliverables}</dd></div>
                  <div><dt>Usage & limits</dt><dd>{p.limits}</dd></div>
                  <div><dt>Support</dt><dd>{p.support}</dd></div>
                </dl>
                <div className="lp-plan-quote"><strong>Scoped quote</strong><p>{p.quote}</p></div>
                <button className="lp-btn ghost wide" onClick={() => pick(p.name)}>
                  Discuss {p.name}
                </button>
              </article>
            ))}
          </div>
          <p className="lp-scope-note">These are proposed starting scopes. Final deliverables, usage limits, timeline, support and price are confirmed in a written proposal before work begins.</p>
        </div>
      </section>

      <section id="proposal" className="lp-section">
        <div className="lp-wrap lp-split wide">
          <div className="lp-sticky">
            <span className="lp-eyebrow teal">Book a demo</span>
            <h2>Start with <em>your workflow.</em></h2>
            <p className="lp-muted">Share your research question, data sources and preferred demo times. We’ll review the fit with you before defining a scope.</p>
            <ol className="lp-inquiry-steps">
              <li>Tell us what you want to evaluate.</li>
              <li>Review the workflow and data requirements together.</li>
              <li>Receive a written scope and quote for approval.</li>
            </ol>
          </div>

          {sent ? (
            <div className="lp-card lp-form" role="status">
              <h3>Demo request received</h3>
              <p>Thanks. We’ll contact you to discuss a demo and the {plan} scope. Your request does not confirm a booking or start paid work.</p>
              <button className="lp-btn ghost" onClick={() => setSent(false)}>Send another</button>
            </div>
          ) : (
            <form className="lp-card lp-form" onSubmit={submit} aria-busy={busy}>
              <div className="lp-form-row">
                <label>
                  <span>Full name</span>
                  <input name="name" required maxLength={120} autoComplete="name" />
                </label>
                <label>
                  <span>Work email</span>
                  <input type="email" name="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" />
                </label>
              </div>
              <div className="lp-form-row">
                <label>
                  <span>Company</span>
                  <input name="company" required maxLength={160} autoComplete="organization" />
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
                <span>Project & preferred demo times</span>
                <textarea
                  ref={inquiry}
                  name="proposal"
                  required
                  maxLength={5000}
                  rows={6}
                  placeholder="Your research question, dataset types and volume, team size, timeline, and preferred demo times with timezone."
                />
              </label>
              <p className="lp-form-note">Describe the workflow here; share any research datasets through an agreed channel after the scope review.</p>
              {error && <p className="lp-form-error" role="alert">{error}</p>}
              <button className="lp-btn primary wide" disabled={busy}>
                {busy ? "Sending…" : "Request a demo & scoped quote"}
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
