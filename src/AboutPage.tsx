import { PageTitle, Panel } from "./workspace-ui"

// Edit names and roles here; initials are derived from the name.
const team = [
  { name: "Jonathan", role: "Team member" },
  { name: "Jascon", role: "Team member" },
]

const modules = [
  ["RareMatch & Evo 2", "Screen rare blood-group markers and score public KEL/SLC14A1 sequence variants."],
  ["CulturePlan", "Plan erythroid culture experiments and compare conditions."],
  ["Bioreactor Guard", "Replay culture measurements and flag batches that need review."],
  ["ErythroPilot & reports", "Interpret checkpoints and export auditable research reports."],
]

export default function AboutPage() {
  return (
    <>
      <PageTitle
        title="About us"
        description="HemoForge is our GenoHack 2026 project: one workspace for erythroid research, from marker screening to culture review."
      />
      <Panel title="What we built">
        <div className="about-body">
          <p>
            Producing red blood cells for rare blood types means connecting
            genetics, experiment planning and culture monitoring. HemoForge
            keeps those steps in one place, with every number traceable to its
            source file and every limit stated plainly.
          </p>
          <ul className="about-modules">
            {modules.map(([name, text]) => (
              <li key={name}>
                <strong>{name}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
      <Panel title="Meet the team">
        <ul className="team-grid">
          {team.map((member) => (
            <li key={member.name}>
              <span className="team-avatar" aria-hidden="true">
                {member.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <strong>{member.name}</strong>
              <small>{member.role}</small>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
