import { useEffect, useRef, type ReactNode } from "react"

import { Details, Icon } from "./workspace-ui"

// Content follows the team proposal "HemoForge: HemoGPT untuk Monitoring dan

// Analisis Proses Blood Biofactory Berbasis AI" (GenoHack 2026).

// Edit names here; initials come from the first and last name.

const team = [
  { name: "Jonathan Edward Charles De Fretes", email: "jonathqncjr@gmail.com" },

  { name: "Kent William Soetanto", email: "kentsoetanto22@gmail.com" },

  { name: "Jascon Johanest Kembuan", email: "jasconkembuan9@gmail.com" },

  {
    name: "Fadhlur Rohman Al Akbar",
    email: "fadhlur.rohman.al.akbar@gmail.com",
  },
]

const stats = [
  ["5.6M", "bags of blood needed per year (national estimate)"],

  ["4.4M", "bags available across 2025"],

  ["1.2M", "bag gap, about 21% of the estimated need"],
]

// Ordered along the process map; ids match the workspace navigation.

const modules = [
  {
    id: "evo2",

    icon: "dna",

    name: "RareMatch",

    role: "Select",

    when: "Before culture, and again after harvest",

    does: "Screens candidate genetic marker profiles against a rare blood antigen target, then gives the lab a verification checklist once genotyping and phenotype/serology results exist.",

    not: "Does not type blood groups, pick clinical donors or test transfusion compatibility. Two SNPs cannot detect every mutation or guarantee genetic stability.",
  },

  {
    id: "plan",

    icon: "plan",

    name: "CulturePlan",

    role: "Plan",

    when: "Before the next culture experiment",

    does: "Learns how culture conditions relate to growth and viability, then suggests which conditions are worth testing next, with reasons and uncertainty.",

    not: "Does not issue automatic control commands, guarantee results or forecast the 21-day outcome.",
  },

  {
    id: "guard",

    icon: "guard",

    name: "Bioreactor Guard",

    role: "Observe",

    when: "During culture: the main dashboard",

    does: "Takes time-stamped measurements, compares batches side by side, tracks metabolite and growth changes, and raises warnings that can be traced to a rule and a reading.",

    not: "Does not control the bioreactor. A pH shift alone is never reported as contamination.",
  },

  {
    id: "pilot",

    icon: "pilot",

    name: "ErythroPilot",

    role: "Interpret",

    when: "On top of Guard, every 3 hours",

    does: "Writes a checkpoint report on process health and trends, and estimates the erythroid maturation stage when matching biological data exists.",

    not: "Does not claim every culture matures on day 21. Harvest decisions belong to lab QC.",
  },
]

const methods = [
  {
    name: "Growth and warnings (Bioreactor Guard)",

    body: (
      <>
        <p>
          From the viable cell count <i>N(t)</i>, Guard computes fold change and
          the growth rate over each valid interval:
        </p>
        <p className="about-formula">
          <code>FC(t) = N(t) / N(t₀)</code>
          <code>μᵢ = (ln N(tᵢ) − ln N(tᵢ₋₁)) / (tᵢ − tᵢ₋₁)</code>
        </p>
        <p>
          <i>μ</i> is only valid for <i>N</i> &gt; 0 and increasing time. Empty
          readings, zeros or mismatched units become{" "}
          <code>insufficient_data</code> or <code>data_issue</code>, never a
          made-up number. Warnings fire on researcher-set limits, stale or
          out-of-order data, two consecutive drops in cell count, or exploratory
          metabolite trends. Every batch is labelled <code>normal</code>,{" "}
          <code>warning</code>, <code>needs_review</code> or{" "}
          <code>no_data</code>, and each warning stores the variable, value,
          rule, time and a follow-up note.
        </p>
      </>
    ),
  },

  {
    name: "Three-hour reports and stage estimates (ErythroPilot)",

    body: (
      <>
        <p>
          A planned 21-day cycle is split into 168 checkpoints, one every 3
          hours. Each report records when it was made, the data window read, the
          last valid values, changes since the previous report, open warnings
          and what an analyst should review. With no new data the report says so
          plainly. Reports are built deterministically from rules and auditable
          numbers.
        </p>
        <p>
          Maturation stage is estimated with a reference classifier trained on
          GSE53983: counts are normalised to <code>log₂(CPM + 1)</code>, the
          most variable genes are selected inside each fold, then an
          L2-regularised logistic regression is evaluated with stratified 3-fold
          validation on 15 samples (Macro-F1, balanced accuracy, confusion
          matrix, baseline comparison).
        </p>
      </>
    ),
  },

  {
    name: "Choosing the next experiment (CulturePlan)",

    body: (
      <p>
        Using the BEL-A Metabolite DOE, CulturePlan models the effect of
        lactate, ammonia and their interaction. A Gaussian Process estimates
        response and uncertainty, and Expected Improvement ranks candidate
        conditions within the range already observed. With only four real
        conditions, suggestions are retrospective and must be tested by a
        researcher.
      </p>
    ),
  },

  {
    name: "Marker screening (RareMatch)",

    body: (
      <p>
        The demonstration panel uses two SNPs from 1000 Genomes Phase 3,{" "}
        <strong>KEL rs8176058</strong> and <strong>SLC14A1 rs1058396</strong>,
        with allele orientation checked against GRCh38 via Ensembl and ClinVar.
        Matching is by sample ID; missing or ambiguous calls become{" "}
        <code>unknown</code>. Until final lab results exist the status stays{" "}
        <code>pending_lab_verification</code>. The workspace also scores
        sequence variants with Evo 2.
      </p>
    ),
  },
]

const datasets = [
  {
    name: "BEL-A, University of Bath",

    what: "Growth and metabolism of an adult erythroid cell line (CC BY 4.0)",

    used: "Growth curve: 3 replicates × 8 time points. Metabolite DOE: 12 runs over 4 lactate–ammonia conditions. Static culture, about 171 hours.",

    href: "https://doi.org/10.15125/BATH-01456",
  },

  {
    name: "GSE53983, NCBI GEO",

    what: "RNA-seq of human erythroid differentiation stages",

    used: "Three replicates per stage, used to train the reference stage classifier.",

    href: "https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE53983",
  },

  {
    name: "1000 Genomes Phase 3",

    what: "Population genotype profiles",

    used: "Marker demonstration for RareMatch.",

    href: "https://www.internationalgenome.org/data/",
  },
]

const outOfScope = [
  "Live IoT sensors or closed-loop bioreactor control",

  "Contamination or mutation diagnosis",

  "Sterility testing",

  "Clinical or transfusion decisions",

  "Release of blood bags for transfusion",
]

const timeline = [
  [
    "Day 1 · 23 Oct 2026",
    "Lock data structures, manifest, BEL-A adapter and the Guard framework.",
  ],

  [
    "Day 2 · 24 Oct 2026",
    "Multi-batch charts, replay, warning rules, three-hour reports, CulturePlan and RareMatch.",
  ],

  [
    "Day 3 · 25 Oct 2026",
    "Testing, offline demo, claim review and presentation.",
  ],

  [
    "After the hackathon",
    "Real bioreactor sensors, longitudinal data with maturation markers and harvest outcomes, an externally validated 21-day forecast, and genomic and phenotypic QC records.",
  ],
]

const references = [
  [
    "Kementerian Kesehatan RI, “Kemenkes Gelar Donor Darah Sukarela Perkuat Ketersediaan Darah Nasional,” Jan 2026.",
    "https://keslan.kemkes.go.id/read/3342/kemenkes-gelar-donor-darah-sukarela-perkuat-ketersediaan-darah-nasional",
  ],

  [
    "World Health Organization, “Blood safety and availability,” 2026.",
    "https://www.who.int/news-room/fact-sheets/detail/blood-safety-and-availability",
  ],

  [
    "NHS Blood and Transplant, first clinical trial of laboratory-grown red blood cells (RESTORE).",
    "",
  ],

  [
    "D. Phillips et al., “Characterizing a novel adult erythroid cell line for red blood cell manufacture,” Bioengineering & Translational Medicine, 2025.",
    "https://doi.org/10.1002/btm2.70026",
  ],

  [
    "D. Gallego-Murillo et al., “Expansion and differentiation of ex vivo cultured erythroblasts in scalable stirred bioreactors,” Biotechnology and Bioengineering, 2022.",
    "https://doi.org/10.1002/bit.28193",
  ],

  [
    "E. Lee et al., “Defined Serum-Free Medium for Bioreactor Culture of an Immortalized Human Erythroblast Cell Line,” Biotechnology Journal, 2018.",
    "https://doi.org/10.1002/biot.201700567",
  ],

  [
    "X. An et al., “Global transcriptome analyses of human and murine terminal erythroid differentiation,” Blood, 2014.",
    "",
  ],

  [
    "J. Snoek, H. Larochelle and R. P. Adams, “Practical Bayesian optimization of machine learning algorithms,” NeurIPS, 2012.",
    "",
  ],

  [
    "WHO, “Guideline on data integrity,” Technical Report Series 1033, Annex 4, 2021.",
    "",
  ],
]

const problems = [
  {
    title: "Donors are limited",

    text: "Supply depends on people overcoming fear of needles, meeting health criteria and waiting 2–3 months between donations. Every bag is screened for HIV, hepatitis B/C and syphilis and cross-matched.",
  },

  {
    title: "Rare blood is rarer",

    text: "For patients who need a rare antigen profile, a matching donor may simply not exist. Cultured red blood cells could add a source, and the RESTORE trial has already transfused lab-grown cells into people.",
  },

  {
    title: "Culture data is scattered",

    text: "Growth counts, sensor readings, culture notes, lab results and genomics arrive from different places at different rates. Media and lab time are expensive, so a late warning makes every failed run cost more.",
  },
]

const integrity = [
  "SHA-256 per source file",

  "Licence and DOI in the manifest",

  "Run status kept apart from evidence quality",

  "Replay on real measurement times",

  "Seed 42, times in UTC",

  "Test fixtures marked software_test_only",
]

function goTo() {
  window.scrollTo({ top: 0, behavior: "instant" })
}

function scrollToSection(id: string) {
  const section = document.getElementById(id)

  section?.focus({ preventScroll: true })

  section?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  })
}

function Section({
  id,

  eyebrow,

  title,

  intro,

  children,
}: {
  id?: string

  eyebrow: string

  title: string

  intro?: ReactNode

  children: ReactNode
}) {
  return (
    <section className="landing-section" id={id} tabIndex={id ? -1 : undefined}>
      <header data-about-reveal>
        <span className="landing-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      {children}
    </section>
  )
}

export default function AboutPage() {
  const landingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return

    // Content stays visible by default; only animate once it enters the viewport.

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue

          entry.target.classList.add("is-revealing")

          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.12 },
    )

    landingRef.current
      ?.querySelectorAll("[data-about-reveal]")
      .forEach((element) => {
        observer.observe(element)
      })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing" ref={landingRef}>
      <section className="landing-hero">
        <div className="landing-hero-copy" data-about-reveal>
          <span className="landing-eyebrow">
            GenoHack 2026 · Team HemoForge
          </span>
          <h1 id="page-title" tabIndex={-1}>
            About Us
          </h1>
          <p className="landing-hero-statement">
            Watch every batch on the road to lab-grown blood.
          </p>
          <p>
            HemoForge brings <strong>HemoGPT</strong>: four connected AI modules
            that help researchers screen markers, plan cultures, monitor
            bioreactors and read the results, with every number traceable to its
            source.
          </p>
          <div className="landing-actions">
            <a
              className="landing-button is-primary"
              href="#guard"
              onClick={goTo}
            >
              Open Bioreactor Guard
              <Icon name="arrow" />
            </a>
            <button
              type="button"
              className="landing-button"
              onClick={() => scrollToSection("about-how")}
            >
              Explore the modules
              <Icon name="arrow" />
            </button>
          </div>
        </div>
        <aside
          className="landing-context"
          aria-label="Indonesia blood supply context"
          data-about-reveal
        >
          <h2>The need behind the research</h2>
          <ul className="landing-stats">
            {stats.map(([value, label]) => (
              <li key={value}>
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <small>
            Indonesia, Ministry of Health, January 2026. Figures describe that
            year and that source's definition, not a fixed national deficit.
          </small>
        </aside>
      </section>

      <nav className="landing-contents" aria-label="About Us sections">
        <span>Discover HemoForge</span>
        {[
          ["about-challenge", "The Challenge"],

          ["about-how", "Our Modules"],

          ["about-science", "The Science"],

          ["about-team", "The Team"],
        ].map(([id, label]) => (
          <button type="button" key={id} onClick={() => scrollToSection(id)}>
            {label}
            <Icon name="arrow" />
          </button>
        ))}
      </nav>

      <Section
        id="about-challenge"
        eyebrow="The problem"
        title="Blood supply can't keep up, and rare types fall furthest behind"
        intro={
          <>
            The challenge HemoForge targets is{" "}
            <strong>fragmented data and late interpretation</strong> in culture
            research. Whether better monitoring raises success rates or cuts
            costs is a hypothesis we still need to test.
          </>
        }
      >
        <ul className="landing-cards">
          {problems.map((problem, index) => (
            <li
              key={problem.title}
              data-about-reveal
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="landing-index">0{index + 1}</span>
              <h3>{problem.title}</h3>
              <p>{problem.text}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="about-how"
        eyebrow="How HemoGPT works"
        title="Four modules, one decision each"
        intro="Bioreactor Guard is the main dashboard. The others feed it or read from it."
      >
        <ol className="landing-pipeline">
          {modules.map((module, index) => (
            <li
              key={module.id}
              data-about-reveal
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <a
                className={module.id === "guard" ? "is-main-module" : undefined}
                href={`#${module.id}`}
                onClick={goTo}
              >
                <span className="landing-module-heading">
                  <span className="landing-role">{module.role}</span>
                  <Icon name={module.icon} />
                </span>
                <h3>{module.name}</h3>
                <small>{module.when}</small>
                <p>{module.does}</p>
                <p className="landing-not">{module.not}</p>
                <span className="landing-open">
                  Open {module.name} <Icon name="arrow" />
                </span>
              </a>
            </li>
          ))}
        </ol>
        <aside className="landing-handoff" data-about-reveal>
          <Icon name="check" />
          <div>
            <h3>Then, harvest and lab QC</h3>
            <p>
              The lab tests the harvest, then RareMatch checks the results
              against the starting profile. Product release always stays with
              the lab's own QC process.
            </p>
          </div>
          <span>After culture</span>
        </aside>
        <div className="landing-quotes" data-about-reveal>
          <blockquote>
            <span>Bioreactor Guard</span>
            What is measured right now?
          </blockquote>
          <blockquote>
            <span>ErythroPilot</span>
            What does the change mean, and what might happen next?
          </blockquote>
        </div>
        <p className="landing-fine">
          <a href="#report" onClick={goTo}>
            Research Report
          </a>
          , HemoBot and{" "}
          <a href="#methods" onClick={goTo}>
            Methods &amp; References
          </a>{" "}
          build only on these computed results.
        </p>
      </Section>

      <Section
        id="about-science"
        eyebrow="Under the hood"
        title="How each number on screen is produced"
      >
        <div className="landing-methods" data-about-reveal>
          {methods.map((method) => (
            <Details key={method.name} title={method.name}>
              {method.body}
            </Details>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Open data"
        title="Built on three public sources"
        intro="They come from different studies, so we never present them as one donor-to-harvest batch."
      >
        <ul className="landing-cards">
          {datasets.map((dataset, index) => (
            <li
              key={dataset.name}
              data-about-reveal
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <Icon name="data" />
              <h3>{dataset.name}</h3>
              <p className="landing-what">{dataset.what}</p>
              <p>{dataset.used}</p>
              <a href={dataset.href} target="_blank" rel="noreferrer">
                View source
              </a>
            </li>
          ))}
        </ul>
        <ul
          className="landing-chips"
          aria-label="Integrity measures"
          data-about-reveal
        >
          {integrity.map((item) => (
            <li key={item}>
              <Icon name="check" />
              {item}
            </li>
          ))}
        </ul>
        <p className="landing-fine">
          React and TypeScript front end, with a FastAPI service over SQLite and
          the data manifest.
        </p>
      </Section>

      <Section
        eyebrow="Honest limits"
        title="What the prototype deliberately does not do"
      >
        <div className="landing-split" data-about-reveal>
          <ul className="landing-limits">
            {outOfScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="landing-prose">
            <p>
              BEL-A culture is static and short. GSE53983 is not a 21-day series
              from a BEL-A batch, and the genomic data comes from different
              people. The 21-day timeline is a reporting roadmap, not 21 days of
              observed data.
            </p>
            <p>
              Leak detection needs volume, mass, pressure or flow sensors that
              the public data does not have, so it appears only as a labelled
              placeholder. Warning thresholds need protocol justification before
              lab use.
            </p>
            <p>
              The design draws on ICH Q9(R1) risk management, WHO TRS 1033 Annex
              4 data integrity and ICH Q8(R2) process design. Citing them is{" "}
              <strong>not</strong> a claim of certification.
            </p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Timeline"
        title="Three days at GenoHack, then the roadmap"
      >
        <ol className="landing-timeline">
          {timeline.map(([when, what], index) => (
            <li
              key={when}
              data-about-reveal
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <strong>{when}</strong>
              <p>{what}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="about-team" eyebrow="The team" title="Meet Team HemoForge">
        <ul className="team-grid">
          {team.map((member, index) => (
            <li
              key={member.name}
              data-about-reveal
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="team-avatar" aria-hidden="true">
                {member.name[0]}
                {member.name.split(" ").at(-1)![0]}
              </span>
              <strong>{member.name}</strong>
              <a href={`mailto:${member.email}`}>{member.email}</a>
            </li>
          ))}
        </ul>
      </Section>

      <section className="landing-cta" data-about-reveal>
        <div>
          <h2>See it on real public data</h2>
          <p>
            Replay BEL-A culture batches, open a warning and follow it to the
            three-hour report that cites it.
          </p>
        </div>
        <div className="landing-actions">
          <a className="landing-button is-primary" href="#guard" onClick={goTo}>
            Open Bioreactor Guard
            <Icon name="arrow" />
          </a>
          <a className="landing-button" href="#data" onClick={goTo}>
            Load data
          </a>
        </div>
      </section>

      <Details title={`Key references (${references.length})`}>
        <ol className="about-refs">
          {references.map(([text, href]) => (
            <li key={text}>
              {text}{" "}
              {href && (
                <a href={href} target="_blank" rel="noreferrer">
                  Link
                </a>
              )}
            </li>
          ))}
        </ol>
      </Details>

      <p className="about-note">
        <Icon name="alert" />
        HemoForge is a research prototype and decision-support workflow. It is
        not a medical device and must not be used for clinical or transfusion
        decisions.
      </p>
    </div>
  )
}
