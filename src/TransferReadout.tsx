import type { TransferView } from "./transfer-visual"

const litres = (ml:number) => `${(ml/1000).toFixed(3)} L`
export default function TransferReadout({view, compact=false}: {view:TransferView; compact?:boolean}) {
  return <div className={`vl-transfer-readout${compact ? " is-compact" : ""}`} aria-label="Visual transfer medium dari Guard">
    <strong>{view.kind === "feed" ? "FEEDING" : "PERTUKARAN MEDIUM"} · {view.label}</strong>
    <small>{view.source} · keputusan {view.id.slice(0,8)}</small>
    <div className="vl-transfer-route">{view.kind === "feed" ? "Medium → pompa FEED → reaktor" : "Medium masuk ⇄ retensi + filtrat keluar"}</div>
    <progress aria-label="Progres transfer yang dikonfirmasi backend" max={1} value={view.progress} />
    <div className="vl-transfer-values"><span>Masuk <b>{view.incomingMl.toFixed(0)} / {view.plannedMl.toFixed(0)} mL</b></span><span>Keluar <b>{view.outgoingMl.toFixed(0)} mL</b></span></div>
    <div className="vl-transfer-values"><span>Level visual <b>{litres(view.visualVolumeMl)}</b></span><span>Tercatat <b>{litres(view.recordedVolumeMl)}</b></span></div>
    <small>{Math.round(view.progress*100)}% · {litres(view.before)} → {litres(view.target)} {view.kind === "medium_exchange" ? "· volume tetap" : `· +${view.plannedMl.toFixed(0)} mL`}</small>
    {!compact && <p>Level visual mengikuti progres transfer; volume dan kimia dicatat sekali saat selesai. Pembatalan mengembalikan visual tanpa menerapkan transfer sebagian.</p>}
  </div>
}
