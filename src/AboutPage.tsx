import { Icon, PageTitle, Panel } from "./workspace-ui"

// Edit names here; initials come from the first and last name.
const team = [
  { name: "Jonathan Edward Charles De Fretes", email: "jonathqncjr@gmail.com" },
  { name: "Kent William Soetanto", email: "kentsoetanto22@gmail.com" },
  { name: "Jascon Johanest Kembuan", email: "jasconkembuan9@gmail.com" },
  { name: "Fadhlur Rohman Al Akbar", email: "fadhlur.rohman.al.akbar@gmail.com" },
]

// Ordered along the process map; ids match the workspace navigation.
const modules = [
  { id: "evo2", icon: "dna", name: "RareMatch", text: "Screen public KEL/SLC14A1 sequence variants with Evo 2." },
  { id: "plan", icon: "plan", name: "CulturePlan", text: "Plan erythroid culture experiments and compare conditions." },
  { id: "guard", icon: "guard", name: "Bioreactor Guard", text: "Replay culture measurements and flag batches that need review." },
  { id: "pilot", icon: "pilot", name: "ErythroPilot", text: "Interpret checkpoints across the culture run." },
  { id: "report", icon: "report", name: "Research report", text: "Export an auditable summary of every step." },
]

const principles = [
  ["Traceable", "Every number links back to the source file or public dataset it came from."],
  ["Honest limits", "Missing data, model confidence and assumptions are shown, never hidden."],
  ["Open data", "Built on public sources such as BEL-A culture data and 1000 Genomes."],
]

export default function AboutPage() {
  return (
    <>
      <PageTitle
        title="About us"
        description="HemoForge is our GenoHack 2026 project: one workspace for erythroid research, from marker screening to culture review."
      />
      <Panel title="Why HemoForge">
        <div className="about-body">
          <p className="about-lead">
            Patients with rare blood types often wait for a compatible donor
            who may not exist. Lab-grown red blood cells could close that gap,
            but getting there means joining genetics, experiment planning and
            culture monitoring that usually live in separate tools.
          </p>
          <p>
            HemoForge puts those steps in one workspace, so a researcher can go
            from a candidate variant to a reviewed culture batch without losing
            track of where each result came from.
          </p>
          <ul className="about-principles">
            {principles.map(([name, text]) => (
              <li key={name}>
                <Icon name="check" />
                <div>
                  <strong>{name}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
      <Panel title="What we built" caption="Five tools, in the order a study uses them.">
        <ol className="about-modules">
          {modules.map((module, index) => (
            <li key={module.id}>
              <a href={`#${module.id}`} onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}>
                <span className="about-step">
                  <Icon name={module.icon} />
                  {index + 1}
                </span>
                <strong>{module.name}</strong>
                <span>{module.text}</span>
              </a>
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
      <p className="about-note">
        <Icon name="alert" />
        HemoForge is a research prototype. It is not a medical device and must
        not be used for clinical or transfusion decisions.
      </p>
    </>
  )
}
