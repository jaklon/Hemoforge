import { Details, Icon, PageTitle, Panel } from "./workspace-ui"

// Content follows the team proposal "HemoForge: HemoGPT untuk Monitoring dan
// Analisis Proses Blood Biofactory Berbasis AI" (GenoHack 2026).

// Edit names here; initials come from the first and last name.
const team = [
  { name: "Jonathan Edward Charles De Fretes", email: "jonathqncjr@gmail.com" },
  { name: "Kent William Soetanto", email: "kentsoetanto22@gmail.com" },
  { name: "Jascon Johanest Kembuan", email: "jasconkembuan9@gmail.com" },
  { name: "Fadhlur Rohman Al Akbar", email: "fadhlur.rohman.al.akbar@gmail.com" },
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
          From the viable cell count <i>N(t)</i>, Guard computes fold change
          and the growth rate over each valid interval:
        </p>
        <p className="about-formula">
          <code>FC(t) = N(t) / N(t₀)</code>
          <code>μᵢ = (ln N(tᵢ) − ln N(tᵢ₋₁)) / (tᵢ − tᵢ₋₁)</code>
        </p>
        <p>
          <i>μ</i> is only valid for <i>N</i> &gt; 0 and increasing time.
          Empty readings, zeros or mismatched units become{" "}
          <code>insufficient_data</code> or <code>data_issue</code>, never a
          made-up number. Warnings fire on researcher-set limits, stale or
          out-of-order data, two consecutive drops in cell count, or
          exploratory metabolite trends. Every batch is labelled{" "}
          <code>normal</code>, <code>warning</code>, <code>needs_review</code>{" "}
          or <code>no_data</code>, and each warning stores the variable,
          value, rule, time and a follow-up note.
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
          hours. Each report records when it was made, the data window read,
          the last valid values, changes since the previous report, open
          warnings and what an analyst should review. With no new data the
          report says so plainly. Reports are built deterministically from
          rules and auditable numbers.
        </p>
        <p>
          Maturation stage is estimated with a reference classifier trained on
          GSE53983: counts are normalised to <code>log₂(CPM + 1)</code>, the
          most variable genes are selected inside each fold, then an
          L2-regularised logistic regression is evaluated with stratified
          3-fold validation on 15 samples (Macro-F1, balanced accuracy,
          confusion matrix, baseline comparison).
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
        with allele orientation checked against GRCh38 via Ensembl and
        ClinVar. Matching is by sample ID; missing or ambiguous calls become{" "}
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
  ["Day 1 · 23 Oct 2026", "Lock data structures, manifest, BEL-A adapter and the Guard framework."],
  ["Day 2 · 24 Oct 2026", "Multi-batch charts, replay, warning rules, three-hour reports, CulturePlan and RareMatch."],
  ["Day 3 · 25 Oct 2026", "Testing, offline demo, claim review and presentation."],
  ["After the hackathon", "Real bioreactor sensors, longitudinal data with maturation markers and harvest outcomes, an externally validated 21-day forecast, and genomic and phenotypic QC records."],
]

const references = [
  ["Kementerian Kesehatan RI, “Kemenkes Gelar Donor Darah Sukarela Perkuat Ketersediaan Darah Nasional,” Jan 2026.", "https://keslan.kemkes.go.id/read/3342/kemenkes-gelar-donor-darah-sukarela-perkuat-ketersediaan-darah-nasional"],
  ["World Health Organization, “Blood safety and availability,” 2026.", "https://www.who.int/news-room/fact-sheets/detail/blood-safety-and-availability"],
  ["NHS Blood and Transplant, first clinical trial of laboratory-grown red blood cells (RESTORE).", ""],
  ["D. Phillips et al., “Characterizing a novel adult erythroid cell line for red blood cell manufacture,” Bioengineering & Translational Medicine, 2025.", "https://doi.org/10.1002/btm2.70026"],
  ["D. Gallego-Murillo et al., “Expansion and differentiation of ex vivo cultured erythroblasts in scalable stirred bioreactors,” Biotechnology and Bioengineering, 2022.", "https://doi.org/10.1002/bit.28193"],
  ["E. Lee et al., “Defined Serum-Free Medium for Bioreactor Culture of an Immortalized Human Erythroblast Cell Line,” Biotechnology Journal, 2018.", "https://doi.org/10.1002/biot.201700567"],
  ["X. An et al., “Global transcriptome analyses of human and murine terminal erythroid differentiation,” Blood, 2014.", ""],
  ["J. Snoek, H. Larochelle and R. P. Adams, “Practical Bayesian optimization of machine learning algorithms,” NeurIPS, 2012.", ""],
  ["WHO, “Guideline on data integrity,” Technical Report Series 1033, Annex 4, 2021.", ""],
]

function goTo() {
  window.scrollTo({ top: 0, behavior: "instant" })
}

export default function AboutPage() {
  return (
    <>
      <PageTitle
        title="About us"
        description="HemoForge brings HemoGPT to GenoHack 2026: AI-assisted monitoring and analysis for blood biofactory research."
      />

      <Panel title="Why this matters" caption="Indonesia, Ministry of Health figures published January 2026">
        <div className="about-body">
          <ul className="about-stats">
            {stats.map(([value, label]) => (
              <li key={value}>
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="about-fine">
            These figures describe that year and that source's definition, not
            a fixed national deficit.
          </p>
          <p className="about-lead">
            Voluntary donors remain the foundation of transfusion, but supply
            depends on people overcoming fear of needles, meeting health
            criteria and waiting 2–3 months between donations. Every bag is
            screened for HIV, hepatitis B/C and syphilis and cross-matched.
            For patients who need a rare antigen profile, a matching donor may
            simply not exist.
          </p>
          <p>
            Cultured red blood cells (cRBC) could add a source for rare
            antigens. The RESTORE trial has already transfused lab-grown cells
            into people, but wide clinical use still needs development and
            validation. Culture media, lab time and repeated testing are
            expensive, so every failed run costs more.
          </p>
          <p>
            The problem HemoForge targets is <strong>fragmented data and
            late interpretation</strong>. Growth counts, sensor readings,
            culture notes, lab results and genomic analysis arrive from
            different places at different rates. Researchers need to compare
            batches, spot trend changes and get warnings that come with
            evidence. Whether this improves success rates or cuts costs is a
            hypothesis still to be tested.
          </p>
        </div>
      </Panel>

      <Panel
        title="How HemoGPT works"
        caption="Four modules, each tied to one decision. Bioreactor Guard is the main dashboard."
      >
        <ol className="about-modules">
          {modules.map((module) => (
            <li key={module.id}>
              <a href={`#${module.id}`} onClick={goTo}>
                <span className="about-step">
                  <Icon name={module.icon} />
                  {module.role}
                </span>
                <strong>{module.name}</strong>
                <small>{module.when}</small>
                <span>{module.does}</span>
                <span className="about-not">{module.not}</span>
              </a>
            </li>
          ))}
          <li>
            <div className="about-final">
              <span className="about-step">
                <Icon name="check" />
                Release
              </span>
              <strong>Harvest and lab QC</strong>
              <small>After culture</small>
              <span>
                Lab tests results, then RareMatch verifies them against the
                starting profile. Product release always stays with the lab's
                own QC process.
              </span>
            </div>
          </li>
        </ol>
        <div className="about-body about-core">
          <p>
            Guard answers <q>what is measured right now?</q> ErythroPilot
            answers <q>what does the change mean, and what might happen
            next?</q> Research reports, HemoBot and{" "}
            <a href="#methods" onClick={goTo}>Methods &amp; references</a>{" "}
            build only on these computed results.
          </p>
        </div>
      </Panel>

      <Panel title="Methods at a glance" caption="How each number on screen is produced">
        {methods.map((method) => (
          <Details key={method.name} title={method.name}>
            {method.body}
          </Details>
        ))}
      </Panel>

      <Panel
        title="Data we use"
        caption="Three public sources from different studies, never presented as one donor-to-harvest batch"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>What it is</th>
                <th>How we use it</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => (
                <tr key={dataset.name}>
                  <td>
                    <a href={dataset.href} target="_blank" rel="noreferrer">
                      <strong>{dataset.name}</strong>
                    </a>
                  </td>
                  <td>{dataset.what}</td>
                  <td>{dataset.used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="about-body">
          <p>
            Every input is logged in a manifest with title, URL or DOI,
            licence, download time, SHA-256, units, sample count and
            consistency checks. Results carry two separate statuses: run
            outcome (<code>succeeded</code> / <code>failed</code>) and evidence
            quality (<code>reference</code>, <code>exploratory</code>,{" "}
            <code>needs_review</code>, <code>insufficient_data</code>). Replay
            follows real BEL-A measurement times, so no future point appears
            early, and test fixtures are labelled{" "}
            <code>software_test_only</code>, never counted as biological
            evidence.
          </p>
          <p>
            Built with React and TypeScript on the front end and a FastAPI
            service over SQLite plus the manifest. Analysis IDs come from
            source checksums, version, configuration and seed 42; times are
            stored in UTC, with culture time taken from each study's elapsed
            hours.
          </p>
        </div>
      </Panel>

      <Panel title="Scope and limits" caption="What the prototype deliberately does not do">
        <div className="about-body">
          <ul className="about-limits">
            {outOfScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            BEL-A culture is static and short. GSE53983 is not a 21-day series
            from a BEL-A batch, and the genomic data comes from different
            people. The 21-day timeline is a reporting roadmap, not 21 days of
            observed data. Leak detection needs evidence such as volume, mass,
            pressure or flow sensors, which the public data does not have, so
            it appears only as a labelled integration placeholder. All warning
            thresholds need protocol justification before lab use.
          </p>
          <p>
            The design draws on the risk management principles of ICH Q9(R1),
            WHO TRS 1033 Annex 4 on data integrity and ICH Q8(R2) process
            design. Citing them is <strong>not</strong> a claim of
            certification or compliance.
          </p>
        </div>
      </Panel>

      <Panel title="Hackathon timeline" caption="Built within the GenoHack 2026 window">
        <ol className="about-timeline">
          {timeline.map(([when, what]) => (
            <li key={when}>
              <strong>{when}</strong>
              <span>{what}</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Meet the team" caption="Team HemoForge · GenoHack 2026">
        <ul className="team-grid">
          {team.map((member) => (
            <li key={member.name}>
              <span className="team-avatar" aria-hidden="true">
                {member.name[0]}
                {member.name.split(" ").at(-1)![0]}
              </span>
              <strong>{member.name}</strong>
              <a href={`mailto:${member.email}`}>{member.email}</a>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Key references">
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
      </Panel>

      <p className="about-note">
        <Icon name="alert" />
        HemoForge is a research prototype and decision-support workflow. It is
        not a medical device and must not be used for clinical or transfusion
        decisions.
      </p>
    </>
  )
}
