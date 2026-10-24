import type { LiveAnalysisSettings } from "./lab-live-analytics"

export default function LiveAnalysisControls({
  settings,
  setSettings,
  refresh,
  loading,
}: {
  settings: LiveAnalysisSettings
  setSettings: (settings: LiveAnalysisSettings) => void
  refresh: () => void
  loading: boolean
}) {
  return (
    <div className="vl-analysis-controls">
      <label>
        Horizon proyeksi
        <select
          value={settings.horizon}
          onChange={(event) =>
            setSettings({
              ...settings,
              horizon: Number(
                event.target.value,
              ) as LiveAnalysisSettings["horizon"],
            })
          }
        >
          {[12, 24, 48].map((value) => (
            <option key={value} value={value}>
              {value} jam
            </option>
          ))}
        </select>
      </label>
      <label>
        Target sel viabel (juta)
        <input
          type="number"
          min={1}
          max={1000000}
          step={1}
          value={settings.target_million}
          onChange={(event) =>
            setSettings({
              ...settings,
              target_million: Number(event.target.value),
            })
          }
        />
      </label>
      <button className="vl-small-button" disabled={loading} onClick={refresh}>
        {loading ? "Menghitung…" : "Hitung ulang analisis"}
      </button>
    </div>
  )
}
