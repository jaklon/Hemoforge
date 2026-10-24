import type { DatasetStatus } from "./lab-session"

export default function SavedDatasets({
  campaigns,
  onRefresh,
}: {
  campaigns: DatasetStatus[]
  onRefresh: () => void
}) {
  return (
    <section className="vl-dataset-panel">
      <h3>Dataset Live tersimpan</h3>
      <p>
        Jam server tetap berjalan walau tab ditutup. Buka kembali kampanye yang
        sama agar data tidak terpecah.
      </p>
      {campaigns.map((c) => (
        <a key={c.campaign_id} href={`#poc/lab/${c.campaign_id}`}>
          Buka batch {c.batch_number} · {c.case_label} · {c.status} ·{" "}
          {c.counts.sensors ?? 0} receipt
        </a>
      ))}
      <button onClick={onRefresh}>Muat ulang dataset tersimpan</button>
    </section>
  )
}
