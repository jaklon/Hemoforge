import { Badge, Details } from "./workspace-ui"
import { evo2ExportUrl, type Evo2Prepared } from "./evo2-data"

export default function Evo2PreparedResult({ prepared }: { prepared: Evo2Prepared }) {
  return <div className="bot-body evo2-result" role="status">
    <Badge tone="success">Prepared locally · inference not run</Badge>
    <p>{prepared.manifest.tasks.length} validated task(s). All Evo 2 scores remain unavailable.</p>
    <div className="table-scroll"><table><caption className="sr-only">Prepared Evo 2 tasks</caption>
      <thead><tr><th>Gene</th><th>Variant</th><th>Position</th><th>Length</th><th>Evo 2 score</th></tr></thead>
      <tbody>{prepared.manifest.tasks.map(task => <tr key={task.task_id}><td>{task.gene}</td>
        <td>{task.variant_id ?? "User-supplied SNV"}</td><td>{task.position_1based ?? "Not specified"}</td>
        <td>{task.sequence_length} bp</td><td>Not run</td></tr>)}</tbody></table></div>
    <a className="button" href={evo2ExportUrl(prepared.preparation_id)} download>Download prepared manifest</a>
    <Details title="Provenance and preparation limits"><p>Manifest fingerprint: <code>{prepared.manifest_fingerprint}</code></p>
      {Object.entries(prepared.manifest.source_hashes).map(([name, value]) => <p key={name}>{name}: <code>{value}</code></p>)}
      <ul>{prepared.manifest.warnings.map(text => <li key={text}>{text}</li>)}</ul></Details>
  </div>
}
