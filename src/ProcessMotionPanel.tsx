import type { LabSnapshot } from "./lab-session"
import { processPresentation } from "./process-animation"
import TransferReadout from "./TransferReadout"

export default function ProcessMotionPanel({ snapshot, connected }: { snapshot: LabSnapshot; connected: boolean }) {
  const p = processPresentation(snapshot, connected)
  const state = (rate: number) => !p.available ? "Offline" : rate <= 0 ? "Tertutup" : !p.running ? "Dijeda" : "Aktif"
  return <details className="vl-process-motion" open>
    <summary>Jalur proses · {p.status}</summary>
    <dl>
      <div><dt>Pengaduk</dt><dd>{p.available ? `${p.rpm.toFixed(0)} rpm · ${p.running ? "command" : "dijeda"}` : "Tidak tersedia"}</dd></div>
      <div><dt>Gas → sparger</dt><dd>{p.gasAvailable ? `O₂ ${p.oxygen.toFixed(1)}% / N₂ ${(100-p.oxygen).toFixed(1)}% · ${state(p.rates.gas)}${snapshot.process_disturbance?.aeration_restricted ? " · jalur terhambat (skenario)" : ""}` : "Tidak tersedia"}</dd></div>
      <div><dt>Trace · pergi / kembali</dt><dd>{p.trace.state === "live" || p.trace.state === "waiting" ? state(p.rates.trace) : p.trace.status}</dd></div>
      <div><dt>Medium → pompa → kultur</dt><dd>{state(p.rates.feed)}</dd></div>
      <div><dt>Retensi → limbah</dt><dd>{state(p.rates.waste)}</dd></div>
      <div><dt>Dosis basa / asam</dt><dd>{p.available ? `${p.base.toFixed(1)}% / ${p.acid.toFixed(1)}% · ${state(Math.max(p.rates.base,p.rates.acid))}` : "Tidak tersedia"}</dd></div>
      <div><dt>Termal virtual</dt><dd>{!p.available ? "Tidak tersedia" : !p.thermal ? "Standby" : `${p.thermal > 0 ? "Pemanasan" : "Pendinginan"} ${Math.abs(p.thermal).toFixed(1)}% · ${p.running ? "command" : "dijeda"}`}</dd></div>
      <div><dt>Kabel PAT → DCU</dt><dd>Pulsa hanya saat receipt QC valid diterima</dd></div>
    </dl>
    {p.transferView && <TransferReadout view={p.transferView} />}
    <p>Penanda arah dan kilau cairan menunjukkan perintah simulasi, bukan laju alir terukur. Selang tetap terisi saat pompa berhenti. Selama transfer, level visual mengikuti progres; volume tercatat berubah sekali setelah selesai. Gelombang, gelembung, dan partikel adalah ilustrasi hidrodinamika.</p>
    <p>AIR cadangan, reagen kalibrasi, centrifuge, inkubator, dan alat persiapan tetap standby karena belum memiliki siklus proses di mesin simulasi.</p>
  </details>
}
