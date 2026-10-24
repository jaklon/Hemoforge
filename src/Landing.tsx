import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import "@fontsource-variable/inter"
import "@fontsource-variable/fraunces"
import "@fontsource-variable/jetbrains-mono"
import "./landing.css"
import { Icon } from "./workspace-ui"
import { sourceReferences } from "./source-references"

// Marketing page shown before the workspace. Facts follow the GenoHack 2026
// proposal "HemoForge: HemoGPT untuk Monitoring dan Analisis Proses Blood Biofactory".

const LandingCells = lazy(() => import("./LandingCells"))

const sections = [
  ["platform", "Platform"],
  ["guard", "Explore demo"],
  ["roadmap", "Roadmap"],
  ["about", "About"],
  ["faq", "FAQ"],
] as const

const sources = [
  { name: "University of Bath · BEL-A", url: sourceReferences[0].url },
  { name: "NCBI GEO · GSE53983", url: sourceReferences[1].url },
  { name: "1000 Genomes Phase 3", url: sourceReferences[2].url },
  { name: "Ensembl · GRCh38", url: "https://www.ensembl.org/Homo_sapiens/Info/Index" },
  { name: "NVIDIA · Evo 2", url: "https://build.nvidia.com/arc/evo2-40b" },
  { name: "ICH Q9(R1)", url: "https://database.ich.org/sites/default/files/ICH_Q9(R1)_Guideline_Step4_2023_0126_0.pdf" },
  { name: "WHO TRS 1033 · Annex 4", url: "https://www.who.int/publications/m/item/annex-4-trs-1033" },
  { name: "ICH Q8(R2)", url: "https://database.ich.org/sites/default/files/Q8_R2_Guideline.pdf" },
]

const challenges = [
  {
    icon: "data",
    title: "Fragmented data",
    body: "Growth counts, sensor telemetry, culture notes, lab assays and genomics arrive from different sources at different rates.",
  },
  {
    icon: "clock",
    title: "Gaps between samples",
    body: "Manual sampling at fixed points can miss what changes in between. A drift seen late is a run already lost.",
  },
  {
    icon: "pilot",
    title: "Slow interpretation",
    body: "Comparing replicates, spotting trend changes and reviewing warnings with evidence is still spreadsheet work.",
  },
  {
    icon: "flask",
    title: "Expensive failures",
    body: "Media, staff time, equipment and repeated assays make every failed culture costly at research scale.",
  },
]

const modules = [
  {
    id: "rarematch",
    icon: "dna",
    name: "RareMatch",
    verb: "Select",
    when: "Before culture · after harvest",
    question: "Which genetic marker profile fits the rare antigen target?",
    does: "Screens candidate marker profiles against a rare blood antigen signature, scores sequence variants, and hands the lab a verification checklist once genotyping and serology exist.",
    not: "Not blood-group typing, donor selection or a transfusion compatibility test.",
  },
  {
    id: "cultureplan",
    icon: "plan",
    name: "CulturePlan",
    verb: "Plan",
    when: "Before the next experiment",
    question: "Which culture condition is worth testing next?",
    does: "A Gaussian Process models growth response and its uncertainty across medium settings such as EPO, SCF, glucose and seeding density, and checks predicted lactate and ammonia against inhibition limits; Expected Improvement ranks the next candidates with reasons.",
    not: "Not an automatic control command, a production recipe or a 21-day prognosis.",
  },
  {
    id: "guard",
    icon: "guard",
    name: "Bioreactor Guard",
    verb: "Observe",
    when: "During culture · the main screen",
    question: "What is measured right now, and what needs review?",
    does: "Places every batch and replicate side by side, charts growth and metabolites on their original timestamps, and raises warnings traced to a rule and a reading.",
    not: "Never controls the bioreactor. A pH shift is never reported as contamination.",
  },
  {
    id: "erythropilot",
    icon: "pilot",
    name: "ErythroPilot",
    verb: "Interpret",
    when: "On top of Guard · every 3 hours",
    question: "What does the change mean, and what may happen next?",
    does: "Writes a checkpoint report every three hours: last valid values, change since the last report, open warnings, and a maturation-stage estimate when biological data supports it.",
    not: "Harvest decisions stay with laboratory QC, not an AI score.",
  },
]

const personas = [
  {
    icon: "flask",
    title: "Bioprocess researchers",
    body: "Compare batches and replicates side by side, and catch trend changes between manual samples instead of after the run.",
    tags: ["Multi-batch overview", "Replay by timestamp", "Fold change & µ"],
  },
  {
    icon: "dna",
    title: "Erythroid culture scientists",
    body: "Read growth, metabolites and maturation-stage estimates against one replay cursor, and plan the next condition with uncertainty in view.",
    tags: ["Stage classifier", "GP + Expected Improvement", "Marker screening"],
  },
  {
    icon: "report",
    title: "Laboratory analysts",
    body: "Review each warning with its variable, value, rule and time, add follow-up notes, and export reports with an audit manifest.",
    tags: ["Traceable warnings", "3-hour reports", "HTML · Markdown · JSON"],
  },
]

const roadmap = [
  { status: "Available", title: "Research workspace", body: "Public interactive preview; signed-in access to dataset imports, multi-batch replay, traceable warnings and checkpoint reports.", detail: "Research prototype · example data is labeled" },
  { status: "Pilot", title: "Your data, reviewed together", body: "Proposed collaboration: agree a dataset, configure a research workflow and review its outputs with your team. Scope and access are confirmed before a pilot starts.", detail: "By agreement · request a scoped proposal" },
  { status: "Planned", title: "Lab connections & validation", body: "Sensor and LIMS connectors, longitudinal maturation datasets and external forecast validation. These require further development and laboratory evidence.", detail: "No committed release date" },
]

const team = [
  {
    name: "Fadhlur Rohman Al Akbar",
    shortName: "Akbar",
    photo: "team/akbar.png",
    links: [{ label: "LinkedIn", icon: "linkedin", url: "https://www.linkedin.com/in/fadhlurrohmanalakbar/" }],
  },
  {
    name: "Kent William Soetanto",
    shortName: "Kent",
    photo: "team/kent.png",
    links: [{ label: "LinkedIn", icon: "linkedin", url: "https://www.linkedin.com/in/kentwil/" }],
  },
  {
    name: "Jascon Johanest Kembuan",
    shortName: "Jascon",
    photo: "team/jascon.png",
    links: [
      { label: "LinkedIn", icon: "linkedin", url: "https://www.linkedin.com/in/jascon-kembuan/" },
      { label: "GitHub", icon: "github", url: "https://github.com/jaklon" },
      { label: "Website", icon: "globe", url: "https://jascon.my.id/" },
    ],
  },
  {
    name: "Jonathan Edward Charles De Fretes",
    shortName: "Jonathan",
    photo: "team/jonathan.png",
    links: [
      { label: "LinkedIn", icon: "linkedin", url: "https://www.linkedin.com/in/jonathanedw05/" },
      { label: "GitHub", icon: "github", url: "https://github.com/AtlasCJr" },
      { label: "Website", icon: "globe", url: "https://jonathanedw.web.id/" },
    ],
  },
]

const faqs = [
  {
    q: "Does HemoForge control a bioreactor?",
    a: "No. HemoForge is decision support for research. Replay controls such as pause, resume and speed drive the demonstration, not lab equipment. There is no closed-loop control.",
  },
  {
    q: "Is the data live?",
    a: "The prototype replays real BEL-A measurements on their original timestamps: a point only appears once the replay cursor reaches it, and the screen says Replay. The label Live is reserved for real sensor connections.",
  },
  {
    q: "Where do the numbers come from?",
    a: "From deterministic calculations you can audit: fold change, interval growth rate, warning rules, GP/EI and the stage classifier. HemoBot, the research assistant, chooses which evidence is relevant and explains it, but every number it shows is rendered from those exact computed values.",
  },
  {
    q: "Can RareMatch tell me someone's blood type?",
    a: "No. It screens a small demonstration marker panel against a target signature. Missing or ambiguous calls become unknown, and the final status stays pending_lab_verification until genotyping and serology results exist.",
  },
  {
    q: "Why 21 days and 168 checkpoints?",
    a: "Twenty-one days with a report every three hours is a planning scenario for a culture cycle, to be tuned to the real protocol. It is not a claim that every culture matures on day 21.",
  },
  {
    q: "Does it run without internet?",
    a: "The monitoring, planning and screening modules run from bundled source snapshots. HemoBot needs an online language model and says so when one is unavailable.",
  },
]

// Illustrative BEL-A-shaped growth: viable cells ×10⁵/mL at sample hours.
const sampleHours = [0, 24, 48, 72, 96, 120, 144, 171]
const replicates = [
  { id: "R1", tone: "red", values: [2, 3.5, 6.3, 10.6, 16.8, 23.4, 29.1, 32.6] },
  { id: "R2", tone: "slate", values: [2, 3.3, 5.9, 9.9, 15.6, 21.8, 27.4, 30.9] },
  { id: "R3", tone: "teal", values: [2, 3.4, 6, 10.2, 15.1, 18.7, 17.9, 16.8] },
]

export function LocalIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    clock: <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
    flask: <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10" />,
    lock: <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />,
    layers: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    external: <path d="M14 4h6v6M20 4 10 14M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z" /></>,
    linkedin: <path fill="currentColor" stroke="none" d="M20.45 2H3.55C2.69 2 2 2.68 2 3.52v16.96c0 .84.69 1.52 1.55 1.52h16.9c.86 0 1.55-.68 1.55-1.52V3.52c0-.84-.69-1.52-1.55-1.52ZM7.93 18.75H4.98V9.2h2.95v9.55ZM6.45 7.9a1.71 1.71 0 1 1 0-3.42 1.71 1.71 0 0 1 0 3.42Zm12.3 10.85H15.8V14.1c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H9.51V9.2h2.83v1.3h.04c.39-.75 1.36-1.55 2.79-1.55 2.99 0 3.58 1.97 3.58 4.53v5.27Z" />,
    github: <path fill="currentColor" stroke="none" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.54-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.23 1.84 1.23 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.52 11.52 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.6-2.81 5.62-5.49 5.92.43.38.82 1.12.82 2.26v3.28c0 .32.22.69.83.57A12 12 0 0 0 12 .3Z" />,
  }
  if (!paths[name]) return <Icon name={name} />
  return (
    <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function Logo() {
  return (
    <svg className="lp-logo" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M8 7h5v10h8l-5 6h-3v10H6V9Z" />
      <path d="M27 7h7v24l-2 2h-5V23h-8l5-6h3Z" />
    </svg>
  )
}

function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, inView] as const
}

function Counter({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>(0.6)
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!inView) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(to)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min((now - start) / 1600, 1)
      setValue(to * (1 - (1 - t) ** 4))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [inView, to])
  return (
    <span ref={ref}>
      {value.toFixed(decimals)}
      {suffix}
    </span>
  )
}

// Replays the illustrative samples; points appear only once the cursor reaches them.
function GuardMock({ interactive = false }: { interactive?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25)
  const [hour, setHour] = useState(171)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (interactive) {
      if (!inView || !playing) return
      let h = hour
      const timer = setInterval(() => {
        h = Math.min(h + 1.4, 171)
        setHour(h)
        if (h >= 171) {
          setPlaying(false)
          clearInterval(timer)
        }
      }, 40)
      return () => clearInterval(timer)
    }
    if (!inView || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let h = 0
    const timer = setInterval(() => {
      h = h >= 230 ? 0 : h + 1.4 // the tail past 171 h holds the final frame
      setHour(Math.min(h, 171))
    }, 40)
    return () => clearInterval(timer)
  }, [inView, interactive, playing])

  const replaying = playing && hour < 171

  const x = (h: number) => 34 + (h / 171) * 274
  const y = (v: number) => 112 - (v / 35) * 96
  const warn = hour >= 171
  const lastIndex = sampleHours.filter((h) => h <= hour).length - 1

  return (
    <div ref={ref} className="lp-mock">
      <div className="lp-mock-bar">
        <span className="lp-dots"><i /><i /><i /></span>
        <span className="lp-mock-title">Bioreactor Guard</span>
        <span className="lp-pill replay"><b />Illustrative replay</span>
      </div>
      <div className="lp-mock-body">
        <div className="lp-batches">
          {replicates.map((r) => {
            const flagged = r.id === "R3" && warn
            const pts = r.values.slice(0, lastIndex + 1)
            return (
              <div key={r.id} className={`lp-batch lp-${r.tone}${flagged ? " flagged" : ""}`}>
                <div className="lp-batch-head">
                  <strong>{r.id}</strong>
                  <span className={`lp-status ${flagged ? "warning" : "normal"}`}>{flagged ? "Warning" : "Normal"}</span>
                </div>
                <span className="lp-batch-value">
                  {pts[pts.length - 1].toFixed(1)}
                  <small>×10⁵/mL</small>
                </span>
                <svg viewBox="0 0 100 26" className="lp-spark" aria-hidden="true">
                  <polyline points={pts.map((v, i) => `${(sampleHours[i] / 171) * 100},${24 - (v / 35) * 22}`).join(" ")} />
                </svg>
              </div>
            )
          })}
        </div>
        <div className="lp-chart">
          <div className="lp-chart-head">
            <span>Viable cells · sample-timed</span>
            <span className="lp-mono">t = {Math.round(hour)} h</span>
          </div>
          <svg viewBox="0 0 320 124" aria-label="Replay chart of viable cell counts for three replicates">
            {[0, 10, 20, 30].map((v) => (
              <g key={v}>
                <line x1="34" x2="308" y1={y(v)} y2={y(v)} className="grid" />
                <text x="26" y={y(v) + 3} className="axis" textAnchor="end">{v}</text>
              </g>
            ))}
            <rect x={x(hour)} y="10" width={308 - x(hour)} height="102" className="future" />
            {replicates.map((r) => {
              const visible = r.values.map((v, i) => [sampleHours[i], v] as const).filter(([h]) => h <= hour)
              return (
                <g key={r.id} className={`lp-series lp-${r.tone}`}>
                  <polyline points={visible.map(([h, v]) => `${x(h)},${y(v)}`).join(" ")} />
                  {visible.map(([h, v]) => <circle key={h} cx={x(h)} cy={y(v)} r="2.6" />)}
                </g>
              )
            })}
            <line x1={x(hour)} x2={x(hour)} y1="8" y2="114" className="cursor" />
          </svg>
        </div>
        <div className={`lp-alert${warn ? " show" : ""}`} role="status">
          <LocalIcon name="alert" />
          <div>
            <strong>R3 · two consecutive drops in viable cells</strong>
            <span className="lp-mono">rule iii · 120 h → 144 h → 171 h · 18.7 → 17.9 → 16.8</span>
          </div>
          <span className="lp-status needs_review">needs_review</span>
        </div>
        {interactive && (
          <div className="lp-demo-controls">
            <p>Illustrative samples, not a downloaded BEL-A run. No account or lab data needed.</p>
            <div className="lp-actions">
              <button className="lp-btn ghost sm" onClick={() => {
                if (hour >= 171) setHour(0)
                setPlaying(!replaying)
              }}>{replaying ? "Pause replay" : "Play replay"}</button>
              <button className="lp-btn ghost sm" onClick={() => { setPlaying(false); setHour(0) }}>Reset replay</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModulePreview({ id }: { id: string }) {
  if (id === "rarematch")
    return (
      <div className="lp-preview">
        <div className="lp-preview-head"><span>Target signature</span><span className="lp-mono">Kell/Kidd · demo panel</span></div>
        {[
          ["KEL", "rs8176058", "match", "Candidate"],
          ["SLC14A1", "rs1058396", "match", "Candidate"],
          ["HG00512", "rs1058396", "unknown", "Ambiguous call"],
        ].map(([gene, rs, state, label]) => (
          <div key={gene + rs + state} className="lp-snp">
            <span className="lp-gene">{gene}</span>
            <span className="lp-mono">{rs}</span>
            <span className={`lp-status ${state === "match" ? "normal" : "no_data"}`}>{label}</span>
          </div>
        ))}
        <div className="lp-preview-foot"><LocalIcon name="lock" /> pending_lab_verification</div>
      </div>
    )
  if (id === "cultureplan")
    return (
      <div className="lp-preview">
        <div className="lp-preview-head"><span>Growth response surface</span><span className="lp-mono">GP · EI</span></div>
        <div className="lp-surface" aria-hidden="true">
          {Array.from({ length: 64 }, (_, i) => {
            const cx = (i % 8) / 7
            const cy = Math.floor(i / 8) / 7
            const v = Math.exp(-((cx - 0.3) ** 2 + (cy - 0.35) ** 2) * 4.2)
            return <i key={i} style={{ opacity: 0.12 + v * 0.88 }} />
          })}
          <b className="lp-ei" style={{ left: "31%", top: "37%" }}>EI #1</b>
          <span className="lp-axis-x">Lactate →</span>
          <span className="lp-axis-y">Ammonia →</span>
        </div>
        <div className="lp-preview-foot">4 observed conditions · retrospective validation only</div>
      </div>
    )
  if (id === "guard") return <GuardMock />
  return (
    <div className="lp-preview">
      <div className="lp-preview-head"><span>Checkpoint 41 / 168</span><span className="lp-mono">Day 6 · 03:00</span></div>
      <ul className="lp-report">
        <li><span>Data window</span><b className="lp-mono">117 h → 120 h</b></li>
        <li><span>Last valid count</span><b className="lp-mono">23.4 ×10⁵/mL</b></li>
        <li><span>Change since last report</span><b className="lp-mono">No new data</b></li>
        <li><span>Open warnings</span><b className="lp-mono">0</b></li>
        <li><span>Stage estimate</span><b className="lp-mono">Polychromatic · exploratory</b></li>
      </ul>
      <div className="lp-preview-foot">Deterministic summary · analyst review recommended</div>
    </div>
  )
}

function ModuleSwitcher() {
  const [active, setActive] = useState(2)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setTimeout(() => setActive((a) => (a + 1) % modules.length), 7000)
    return () => clearTimeout(timer)
  }, [active, paused])
  return (
    <div className="lp-switcher" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="lp-tabs" role="tablist" aria-label="HemoForge modules">
        {modules.map((m, i) => (
          <button
            key={m.id}
            id={`module-tab-${m.id}`}
            role="tab"
            aria-controls="module-panel"
            aria-selected={i === active}
            className={`lp-tab${i === active ? " active" : ""}${paused ? " paused" : ""}`}
            onClick={() => setActive(i)}
          >
            <span className="lp-tab-icon"><LocalIcon name={m.icon} /></span>
            <span className="lp-tab-text">
              <small>{String(i + 1).padStart(2, "0")} · {m.verb}</small>
              <strong>{m.name}</strong>
            </span>
            <i className="lp-tab-progress" />
          </button>
        ))}
      </div>
      <div className="lp-panel" id="module-panel" role="tabpanel" aria-labelledby={`module-tab-${modules[active].id}`}>
        <div className="lp-panel-copy">
          {modules.map((m, i) => (
            <div key={m.id} className={`lp-module-copy${i === active ? " active" : ""}`} aria-hidden={i !== active} inert={i !== active}>
              <span className="lp-eyebrow">{m.when}</span>
              <h3>{m.question}</h3>
              <p>{m.does}</p>
              <p className="lp-not"><LocalIcon name="x" /> {m.not}</p>
            </div>
          ))}
        </div>
        <div className="lp-panel-previews">
          {modules.map((m, i) => (
            <div key={m.id} className={`lp-module-preview${i === active ? " active" : ""}`} aria-hidden={i !== active} inert={i !== active}>
              <ModulePreview id={m.id} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CheckpointRing() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4)
  const [index, setIndex] = useState(167)
  useEffect(() => {
    if (!inView || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let i = 0
    const timer = setInterval(() => {
      i = (i + 1) % 200 // a short hold on the full ring before it restarts
      setIndex(Math.min(i, 167))
    }, 55)
    return () => clearInterval(timer)
  }, [inView])
  const hours = (index + 1) * 3
  const day = Math.floor((hours - 1) / 24) + 1

  return (
    <div ref={ref} className="lp-ring">
      <svg viewBox="-160 -160 320 320" aria-hidden="true">
        {Array.from({ length: 168 }, (_, i) => {
          const angle = (i / 168) * Math.PI * 2 - Math.PI / 2
          const major = i % 8 === 7
          const r1 = major ? 118 : 124
          return (
            <line
              key={i}
              x1={Math.cos(angle) * r1}
              y1={Math.sin(angle) * r1}
              x2={Math.cos(angle) * 140}
              y2={Math.sin(angle) * 140}
              className={i < index ? "done" : i === index ? "now" : ""}
            />
          )
        })}
        <circle r="100" className="lp-ring-inner" />
      </svg>
      <div className="lp-ring-center">
        <span className="lp-mono">Checkpoint</span>
        <strong>{index + 1}<small>/168</small></strong>
        <span>Day {day} · {String(hours % 24).padStart(2, "0")}:00</span>
      </div>
    </div>
  )
}

export default function Landing({ onEnter }: { onEnter: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    if (!menu) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setMenu(false)
      root.current?.querySelector<HTMLButtonElement>(".lp-menu")?.focus()
    }
    addEventListener("keydown", close)
    return () => removeEventListener("keydown", close)
  }, [menu])

  useEffect(() => {
    const el = root.current!
    const reveal = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add("is-in")
          reveal.unobserve(entry.target)
        }),
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    )
    el.querySelectorAll("[data-reveal]").forEach((node) => reveal.observe(node))

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setScrolled(scrollY > 12)
        el.style.setProperty("--hero-p", String(Math.min(scrollY / (innerHeight * 0.8), 1)))
        const scrollRange = document.documentElement.scrollHeight - document.documentElement.clientHeight
        el.style.setProperty("--scroll-progress", String(scrollRange > 0 ? Math.max(0, Math.min(scrollY / scrollRange, 1)) : 0))
      })
    }
    const resize = new ResizeObserver(onScroll)
    resize.observe(el)
    onScroll()
    addEventListener("scroll", onScroll, { passive: true })
    addEventListener("resize", onScroll)
    return () => {
      reveal.disconnect()
      resize.disconnect()
      removeEventListener("scroll", onScroll)
      removeEventListener("resize", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Section links scroll instead of setting the hash, which belongs to the workspace.
  function go(id: string) {
    setMenu(false)
    const target = document.getElementById(id)?.querySelector(".lp-wrap")
    target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })
    const heading = target?.querySelector<HTMLElement>("h2")
    heading?.setAttribute("tabindex", "-1")
    heading?.focus({ preventScroll: true })
  }

  return (
    <div className="lp" ref={root}>
      <header className={`lp-nav${scrolled ? " scrolled" : ""}${menu ? " open" : ""}`}>
        <div className="lp-nav-inner">
          <button className="lp-brand" aria-label="HemoForge home" onClick={() => scrollTo({ top: 0, behavior: "smooth" })}>
            <Logo />
            <span>HemoForge</span>
          </button>
          <nav id="landing-navigation" aria-label="Sections">
            {sections.map(([id, label]) => (
              <button key={id} onClick={() => go(id)}>{label}</button>
            ))}
            <a href="#work-with-us">Work with us</a>
            <button className="lp-mobile-sign-in" onClick={onEnter}>Sign in</button>
          </nav>
          <div className="lp-nav-cta">
            <button className="lp-btn ghost sm lp-sign-in" onClick={onEnter}>Sign in</button>
            <a className="lp-btn primary sm" href="#work-with-us">Book a demo</a>
            <button className="lp-menu" aria-label={menu ? "Close menu" : "Open menu"} aria-controls="landing-navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <LocalIcon name={menu ? "x" : "menu"} />
            </button>
          </div>
        </div>
        <div className="lp-scroll-progress" aria-hidden="true"><span /></div>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-bg" />
        <Suspense fallback={null}><LandingCells /></Suspense>
        <div className="lp-hero-fade" />
        <div className="lp-wrap lp-hero-inner">
          <div className="lp-hero-copy">
            <h1 className="lp-rise" style={{ "--d": 1 } as CSSProperties}>
              The command center for <em>lab-grown blood.</em>
            </h1>
            <p className="lp-lede lp-rise" style={{ "--d": 2 } as CSSProperties}>
              HemoForge unites rare-antigen screening, culture planning, multi-batch monitoring and three-hourly
              interpretation in one auditable workspace for cultured red blood cell research.
            </p>
            <div className="lp-actions lp-rise" style={{ "--d": 3 } as CSSProperties}>
              <a className="lp-btn primary lg" href="#work-with-us">Book a demo <LocalIcon name="arrow" /></a>
              <button className="lp-btn ghost lg" onClick={() => go("guard")}>Explore demo</button>
            </div>
          </div>
        </div>
        <div className="lp-scroll-cue" aria-hidden="true"><i /></div>
      </section>


      <section className="lp-sources" aria-label="Data sources and frameworks">
        <p>Research references and quality frameworks · referenced, not certified</p>
        <div className="lp-source-links lp-wrap">
          {sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a>)}
        </div>
      </section>

      <section id="problem" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-split">
            <div data-reveal>
              <span className="lp-eyebrow red">The problem</span>
              <h2>A country short of <em>1.2 million</em> bags of blood.</h2>
              <p className="lp-muted">
                Accident victims, mothers with postpartum bleeding, cancer and thalassemia patients all depend on safe
                blood that arrives on time. In 2025 Indonesia collected 4.4 million bags against an estimated need of
                5.6 million.
              </p>
              <div className="lp-stats">
                <div><strong><Counter to={5.6} decimals={1} suffix="M" /></strong><span>bags needed each year</span></div>
                <div><strong><Counter to={4.4} decimals={1} suffix="M" /></strong><span>bags available in 2025</span></div>
                <div><strong className="red"><Counter to={21} suffix="%" /></strong><span>of estimated need unmet</span></div>
              </div>
              <p className="lp-cite"><a href="https://keslan.kemkes.go.id/read/3342/kemenkes-gelar-donor-darah-sukarela-perkuat-ketersediaan-darah-nasional" target="_blank" rel="noreferrer">Kementerian Kesehatan RI, January 2026 ↗</a>. Gap and percentage calculated from the reported 2025 figures.</p>
            </div>
            <div className="lp-bags" data-reveal aria-label="56 drops: 44 filled for bags available, 12 empty for the gap">
              {Array.from({ length: 56 }, (_, i) => (
                <i key={i} className={i < 44 ? "full" : "gap"} style={{ "--i": i } as CSSProperties} />
              ))}
              <div className="lp-bags-legend">
                <span><i className="full" /> 100k bags available</span>
                <span><i className="gap" /> 100k bags short</span>
              </div>
            </div>
          </div>

          <div className="lp-donor" data-reveal>
            <div>
              <strong>2–3 months</strong>
              <span>between whole-blood donations from a single donor</span>
            </div>
            <div>
              <strong>HIV · HBV · HCV · syphilis</strong>
              <span>screening and cross-matching required for every unit</span>
            </div>
            <div>
              <strong>Rare antigens</strong>
              <span>compatible donors for rare profiles can be very few</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">The promise and the bottleneck</span>
            <h2>Cultured red blood cells could complement donors. <em>Growing them is the hard part.</em></h2>
            <p className="lp-muted">
              The RESTORE trial transfused laboratory-grown red cells into people for the first time. Broad clinical use
              still needs development and validation, and at research scale the bottleneck is not only biology: it is
              fragmented data and late interpretation.
            </p>
            <p className="lp-cite"><a href="https://www.nhsbt.nhs.uk/clinical-trials-unit/trials-and-studies/blood-and-transfusion/restore/" target="_blank" rel="noreferrer">RESTORE trial · NHS Blood and Transplant ↗</a></p>
          </div>
          <div className="lp-bento">
            {challenges.map((c, i) => (
              <article key={c.title} className="lp-card glow" data-reveal style={{ "--d": i } as CSSProperties}>
                <span className="lp-card-icon"><LocalIcon name={c.icon} /></span>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="platform" className="lp-section lp-platform">
        <div className="lp-wrap">
          <div className="lp-head center" data-reveal>
            <span className="lp-eyebrow">The platform</span>
            <h2>Four modules. <em>One evidence trail.</em></h2>
            <p className="lp-muted">
              Each module supports a different decision across the culture lifecycle, and all of them read from the same
              validated source records.
            </p>
          </div>
          <div data-reveal><ModuleSwitcher /></div>

          <div className="lp-flow" data-reveal aria-label="Process order">
            {[...modules.map((m) => [m.name, m.verb]), ["Harvest & QC", "Lab-owned"]].map(([name, verb], i) => (
              <div key={name} className={`lp-flow-step${i === 4 ? " lab" : ""}`} style={{ "--d": i } as CSSProperties}>
                <span className="lp-flow-dot" />
                <strong>{name}</strong>
                <small>{verb}</small>
              </div>
            ))}
            <div className="lp-flow-line"><i /></div>
          </div>
        </div>
      </section>

      <section id="guard" className="lp-section">
        <div className="lp-wrap lp-split wide">
          <div className="lp-sticky" data-reveal>
            <span className="lp-eyebrow teal">Explore demo · no sign-in required</span>
            <h2>See every batch. <em>Trust every warning.</em></h2>
            <p className="lp-muted">
              The research command center. Batch cards show the cell line, culture time, source, last update, cell count
              and data status. Select one to compare its trend with replicates and experiment context.
            </p>
            <div className="lp-formula">
              <div><span className="lp-mono">Fold change</span><code>FC(t) = N(t) / N(t₀)</code></div>
              <div><span className="lp-mono">Interval growth</span><code>μᵢ = (ln N(tᵢ) − ln N(tᵢ₋₁)) / (tᵢ − tᵢ₋₁)</code></div>
              <p>Only for N &gt; 0 and increasing time. Zeros, gaps and unit mismatches return <code>insufficient_data</code>, never a made-up number.</p>
            </div>
          </div>
          <div className="lp-guard-side">
            <div data-reveal><GuardMock interactive /></div>
            <div className="lp-rules" data-reveal>
              <h3>Warning rules, each with a reason you can inspect</h3>
              <ol>
                <li><b>i</b> Value outside a researcher-set limit, with experiment context</li>
                <li><b>ii</b> Data that is stale or out of order</li>
                <li><b>iii</b> Two consecutive drops in viable cell count</li>
                <li><b>iv</b> Metabolite change meeting an exploratory trend rule</li>
              </ol>
              <div className="lp-states">
                <span className="lp-status normal">normal</span>
                <span className="lp-status warning">warning</span>
                <span className="lp-status needs_review">needs_review</span>
                <span className="lp-status no_data">no_data</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section lp-pilot">
        <div className="lp-wrap lp-split">
          <div data-reveal><CheckpointRing /></div>
          <div data-reveal>
            <span className="lp-eyebrow amber">ErythroPilot</span>
            <h2>168 checkpoints. <em>One every three hours.</em></h2>
            <p className="lp-muted">
              A helicopter view on top of Guard. Across a planned 21-day cycle, each checkpoint report records when it
              was made, the data window it read, the last valid values, the change since the previous report, open
              warnings and what an analyst should review.
            </p>
            <ul className="lp-checks">
              <li><LocalIcon name="check" /> Says "no new data" plainly when nothing was measured</li>
              <li><LocalIcon name="check" /> Report cadence never changes lab measurement cadence</li>
              <li><LocalIcon name="check" /> Stage classifier trained on GSE53983, scored with out-of-fold Macro-F1</li>
              <li><LocalIcon name="check" /> Exportable timeline with prediction uncertainty in view</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="audience" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow">Who it's for</span>
            <h2>Made for the people <em>at the culture bench.</em></h2>
          </div>
          <div className="lp-personas">
            {personas.map((p, i) => (
              <article key={p.title} className="lp-card glow" data-reveal style={{ "--d": i } as CSSProperties}>
                <span className="lp-card-icon"><LocalIcon name={p.icon} /></span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                <div className="lp-tags">{p.tags.map((t) => <span key={t}>{t}</span>)}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="roadmap" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head" data-reveal>
            <span className="lp-eyebrow amber">Roadmap</span>
            <h2>The product, <em>step by step.</em></h2>
            <p className="lp-muted">What you can use now, discuss with us, and expect us to develop next.</p>
          </div>
          <ol className="lp-roadmap">
            {roadmap.map((r, i) => (
              <li key={r.title} className={r.status.toLowerCase()} data-reveal style={{ "--d": i } as CSSProperties}>
                <span className="lp-roadmap-dot" aria-hidden="true" />
                <div className="lp-roadmap-card">
                  <span className="lp-roadmap-status">Phase {String(i + 1).padStart(2, "0")} · {r.status}</span>
                  <h3>{r.title}</h3>
                  <p>{r.body}</p>
                  <p className="lp-roadmap-detail">{r.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about" className="lp-section lp-team-section">
        <div className="lp-wrap">
          <div className="lp-team-heading" data-reveal>
            <div>
              <h2>Meet the team.</h2>
              <p>The people behind HemoForge.</p>
            </div>
            <a className="lp-team-event" href="https://www.instagram.com/p/DeQqCsxiJOg/" target="_blank" rel="noopener noreferrer" aria-label="GenoHack 2026 on Instagram (opens in a new tab)">
              GenoHack 2026 <LocalIcon name="external" />
            </a>
          </div>
          <div className="lp-team">
            {team.map((member, i) => (
              <article key={member.name} className="lp-member" data-reveal style={{ "--d": i } as CSSProperties}>
                <div className="lp-member-portrait">
                  <img className="lp-member-photo" src={`${import.meta.env.BASE_URL}${member.photo}`} alt={member.name} width={825} height={1024} loading="lazy" decoding="async" />
                </div>
                <div className="lp-member-info">
                  <h3>{member.shortName}</h3>
                  <p>{member.name}</p>
                </div>
                <div className="lp-member-links">
                  {member.links.map((link) => (
                    <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" title={link.label} aria-label={`${member.name} — ${link.label} (opens in a new tab)`}>
                      <LocalIcon name={link.icon} />
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="lp-section">
        <div className="lp-wrap lp-split wide">
          <div className="lp-sticky" data-reveal>
            <span className="lp-eyebrow">FAQ</span>
            <h2>Questions, <em>answered plainly.</em></h2>
          </div>
          <div className="lp-faq" data-reveal>
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}<i /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-final-glow" />
        <div className="lp-wrap" data-reveal>
          <h2>Bring evidence to <em>every culture.</em></h2>
          <p className="lp-muted">Explore the public preview or talk through a research workflow with our team. Existing users can sign in to their workspace.</p>
          <div className="lp-actions center">
            <a className="lp-btn primary lg" href="#work-with-us">Book a demo <LocalIcon name="arrow" /></a>
            <button className="lp-btn ghost lg" onClick={() => go("guard")}>Explore demo</button>
            <button className="lp-link" onClick={onEnter}>Sign in</button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer-top">
            <div className="lp-brand static"><Logo /><span>HemoForge</span></div>
            <nav aria-label="Footer">
              {sections.map(([id, label]) => <button key={id} onClick={() => go(id)}>{label}</button>)}
            </nav>
          </div>
          <p className="lp-fine">
            Research decision support only. Not for clinical use, transfusion decisions, product release or bioreactor
            control. Data: University of Bath BEL-A (CC BY 4.0), NCBI GEO GSE53983, 1000 Genomes Phase 3, Ensembl.
          </p>
          <p className="lp-fine">© 2026 Team HemoForge · GenoHack 2026</p>
        </div>
      </footer>

    </div>
  )
}
