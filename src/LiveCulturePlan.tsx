import LiveAnalysisControls from "./LiveAnalysisControls"

import { liveAnalysisHold, liveSettingsError } from "./lab-live-analytics"

import type { LiveModuleProps } from "./LivePilot"

import { downloadFile } from "./workspace-utils"

import { PageTitle, Badge, Icon } from "./workspace-ui"

export default function LiveCulturePlan(props: LiveModuleProps) {
  const { snapshot, analysis, settings } = props

  const hold = !props.connected
    ? "Koneksi terputus. Sambungkan ulang untuk perencanaan live."
    : liveSettingsError(settings) || liveAnalysisHold(snapshot)

  const plan = !hold ? analysis?.target_plan : null

  const observation = snapshot.measurements.at(-1)

  const estimatedTimePassed =
    plan?.status === "projected" && plan.target_hour! < snapshot.culture_hours

  return (
    <section className="vl-live-module" aria-label="CulturePlan live">
      <PageTitle
        title="CulturePlan"
        description="Plan illustrative viable-cell targets from ViaMass-derived estimates; not mature RBC yield."
        action={
          <button
            className="vl-small-button"
            onClick={() =>
              downloadFile(
                `${snapshot.batch_id}-live-plan.json`,

                JSON.stringify(
                  {
                    session_id: snapshot.session_id,

                    source_hash: snapshot.measurements_sha256,

                    settings,

                    analysis: hold ? null : analysis,

                    volume_ledger: {
                      working_ml: snapshot.working_volume_ml,

                      sampled_ml: snapshot.withdrawn_volume_ml,

                      added_ml: snapshot.added_volume_ml,

                      exchanged_ml: snapshot.exchanged_volume_ml,
                    },
                  },

                  null,

                  2,
                ),

                "application/json",
              )
            }
          >
            <Icon name="download" /> Unduh rencana live
          </button>
        }
      />
      <div className="context-strip">
        <Badge tone="warning">Synthetic · BIOSTAT / PAT</Badge>
        <span>
          Source: <b>{snapshot.batch_id}</b> · {snapshot.measurements.length}{" "}
          released observations
        </span>
        <span>
          Independent experiment GP: waiting for controlled experiment data
        </span>
      </div>
      <LiveAnalysisControls {...props} />
      {(hold || props.error || analysis?.reason) && (
        <p className="vl-evidence-note" role="status">
          {hold || props.error || analysis?.reason}
        </p>
      )}
      <div className="panel" data-testid="plan-target">
        <h2>Target sel viabel</h2>
        <div className="vl-live-metrics">
          <div>
            <span>Target</span>
            <b>{settings.target_million.toLocaleString()} juta</b>
          </div>
          <div>
            <span>Estimasi jumlah pada segmen ini</span>
            <b>{plan?.observed_count?.toFixed(2) ?? "—"} juta</b>
          </div>
          <div>
            <span>Ekspansi diperlukan</span>
            <b>{plan?.fold_required?.toFixed(3) ?? "—"}×</b>
          </div>
          <div>
            <span>Doubling time dari fitting</span>
            <b>{plan?.doubling_hours?.toFixed(2) ?? "—"} h</b>
          </div>
        </div>
        <div className="vl-plan-outcome" data-testid="plan-outcome">
          {!plan || plan.status === "withheld"
            ? "ETA ditahan sampai data cukup untuk fitting; tidak menggunakan laju literatur sebagai pengganti."
            : plan.status === "observed_target_reached" ||
                plan.status === "estimated_target_reached"
              ? `Estimasi target tercapai pada ${plan.observed_hour?.toFixed(3)} h. Ini estimasi ViaMass yang belum dikalibrasi, bukan hasil RBC matang.`
              : plan.status === "non_growing"
                ? "Laju perubahan estimasi sel tidak positif. ETA target tidak dihitung."
                : estimatedTimePassed
                  ? "Perkiraan waktu target telah terlewati. Ambil sampel baru untuk konfirmasi; target belum dinyatakan tercapai."
                  : `Estimasi target pada ${plan.target_hour?.toFixed(3)} h · ${plan.hours_from_observation?.toFixed(2)} jam dari pengambilan sampel ${plan.observed_hour?.toFixed(3)} h.${
                      plan.status === "beyond_run"
                        ? " Melewati batas simulasi 168 jam; bukan rencana yang dapat dituntaskan pada sesi ini."
                        : ""
                    }`}
        </div>
        <p className="vl-assay-context" data-testid="plan-source">
          {analysis
            ? `Sumber: ${analysis.source_sample_ids.join(", ") || "belum ada sampel setelah tindakan"} · fitting mulai ${analysis.segment_start_hour.toFixed(3)} h · ${analysis.model_version}`
            : "Menunggu sumber analisis terbaru."}
        </p>
      </div>
      <div className="panel">
        <h2>Ledger operasi simulasi</h2>
        <div className="vl-live-metrics">
          <div>
            <span>Volume sekarang</span>
            <b>{snapshot.working_volume_ml.toFixed(1)} mL</b>
          </div>
          <div>
            <span>Diambil untuk sampling</span>
            <b>{snapshot.withdrawn_volume_ml.toFixed(1)} mL</b>
          </div>
          <div>
            <span>Medium ditambahkan</span>
            <b>{snapshot.added_volume_ml.toFixed(1)} mL</b>
          </div>
          <div>
            <span>Medium ditukar</span>
            <b>{snapshot.exchanged_volume_ml.toFixed(1)} mL</b>
          </div>
        </div>
        <p>
          Ledger adalah catatan operasi virtual. Konsentrasi hanya berasal dari
          sensor virtual yang telah dirilis
          {observation
            ? ` (${observation.sample_id}, dikumpulkan ${observation.collected_at_hour.toFixed(3)} h)`
            : " yang belum tersedia"}
          ; setiap kanal mempunyai waktu dan status QC sendiri. Glutamin,
          amonium, viabilitas, osmolalitas, pCO₂ dan enukleasi belum terukur.
        </p>
      </div>
      <div className="vl-evidence-note">
        <b>Pemeringkatan eksperimen GP ditahan</b>
        <p>
          {analysis?.experiment_gp.reason ??
            "Satu deret waktu bioreaktor tidak menyediakan kondisi dan hasil eksperimen independen untuk DOE."}{" "}
          Data amonium tidak diganti nama menjadi ammonia, dan data demo
          eksperimen tidak disisipkan ke sesi live.
        </p>
      </div>
      <p className="vl-assay-context">
        ETA adalah aritmetika eksponensial dari estimasi ViaMass pada segmen
        yang sama. Tidak memperkirakan diferensiasi, enukleasi, golongan darah,
        hasil RBC, atau kebutuhan medium pada tahap produksi berikutnya.
      </p>
      <button className="vl-small-button" onClick={props.openGuard}>
        Tinjau atau terapkan tindakan melalui Guard
      </button>
    </section>
  )
}
