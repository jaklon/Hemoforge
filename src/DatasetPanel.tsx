import { useState } from "react"
import type { LabSnapshot } from "./lab-session"

export default function DatasetPanel({ snapshot }: { snapshot: LabSnapshot }) {
  const d = snapshot.dataset
  const [error, setError] = useState("")
  if (!d) return null
  const tables = [
    ["sensors", "Sensor CSV"],
    ["estimates", "Estimasi CSV"],
    ["events", "Kejadian & tindakan CSV"],
    ["controls", "Aktuator CSV"],
    ["truth", "Truth / label CSV"],
    ["runs", "Metadata batch CSV"],
  ] as const
  return (
    <section className="vl-dataset-panel" aria-label="Dataset Live otomatis">
      <div className="vl-dataset-heading">
        <span
          className={`vl-dataset-dot ${
            d.status === "running" ? "is-running" : ""
          }`}
        />
        <b>DATASET LIVE · {d.status.toUpperCase()}</b>
      </div>
      <h3>
        Batch {d.batch_number} · {d.case_label}
      </h3>
      <p>
        <strong>
          {d.policy === "observe_only"
            ? "Kontrol pembanding · tanpa koreksi otomatis"
            : "Kebijakan aturan sensor · koreksi otomatis"}
        </strong>
        . Seluruh skenario, waktu gangguan, seed, dan respons berjalan otomatis.
        Tidak memakai LLM/API berbayar.
      </p>
      <dl>
        <div>
          <dt>Receipt sensor tersimpan</dt>
          <dd>{(d.counts.sensors ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Estimasi</dt>
          <dd>{(d.counts.estimates ?? 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Cakupan kasus</dt>
          <dd>
            {d.coverage.length} / {d.catalog_size}
          </dd>
        </div>
        <div>
          <dt>Penyimpanan lokal</dt>
          <dd>
            {d.storage_mb} / {d.storage_limit_mb} MB
          </dd>
        </div>
      </dl>
      <p>
        Jam backend independen dari 3D. Browser tersembunyi hanya menghentikan
        rendering/audio. API dan komputer harus tetap menyala. Selesai 168 jam
        kultur → batch baru otomatis. Checkpoint dipulihkan saat API dinyalakan
        kembali; waktu saat API mati tidak direkayasa.
      </p>
      {d.lag_seconds > 2 && (
        <p role="status">
          Worker sedang mengejar antrean {d.lag_seconds.toFixed(1)} detik.
        </p>
      )}
      {d.error && <p role="alert">{d.error}</p>}
      <div className="vl-dataset-downloads">
        {tables.map(([kind, label]) => (
          <a
            key={kind}
            href={`/api/v1/lab/sessions/${snapshot.session_id}/dataset/${kind}.csv`}
            download
          >
            {label}
          </a>
        ))}
        <a
          href={`/api/v1/lab/sessions/${snapshot.session_id}/dataset/manifest`}
          download="manifest.json"
        >
          Manifest & katalog JSON
        </a>
      </div>
      <details>
        <summary>Jejak otomatis terbaru</summary>
        <ol>
          {d.recent_events
            .slice(-6)
            .reverse()
            .map((e, i) => (
              <li key={`${e.batch_number}-${e.hour}-${e.kind}-${i}`}>
                Batch {e.batch_number} · {e.hour.toFixed(2)}h ·{" "}
                {e.kind.replace(/_/g, " ")} · {e.actor}
              </li>
            ))}
        </ol>
      </details>
      <p className="vl-dataset-notice">
        Data sintetis dari model yang belum dikalibrasi. Sensor, estimasi, truth
        dan label dipisah. Untuk pelatihan: jangan masukkan truth, nama skenario
        atau kejadian masa depan sebagai fitur; pisahkan train/validation/test
        per batch, dan gunakan waktu rilis sensor.
      </p>
      <button
        onClick={() =>
          setError(
            "Unduh Sensor + Estimasi untuk fitur, Kejadian/Truth untuk label terpisah, serta Metadata dan Manifest untuk provenance. Ekspor hanya mencakup transaksi yang sudah tersimpan; pengumpulan tetap berjalan.",
          )
        }
      >
        Panduan dataset
      </button>
      {error && <small role="status">{error}</small>}
    </section>
  )
}
