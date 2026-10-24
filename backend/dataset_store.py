"""Local append-only synthetic dataset, atomic checkpoints and bounded CSV streaming."""
import csv
import io
import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

FORMAT_VERSION = "hemoforge-synthetic-culture-v1"
KINDS = ("sensors", "estimates", "events", "truth", "controls", "runs")


class DatasetStore:
    def __init__(self, path=None, limit_mb=512):
        self.path = Path(path or os.environ.get("HEMOFORGE_DATASET_PATH", "data/simulation/culture.sqlite3")).resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.limit_bytes = limit_mb * 1024 * 1024
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS checkpoints (
                    campaign_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
                CREATE TABLE IF NOT EXISTS records (
                    campaign_id TEXT NOT NULL, run_id TEXT NOT NULL, kind TEXT NOT NULL,
                    record_key TEXT NOT NULL, hour REAL NOT NULL, payload TEXT NOT NULL,
                    PRIMARY KEY(campaign_id, run_id, kind, record_key));
                CREATE INDEX IF NOT EXISTS records_export ON records(campaign_id,kind,run_id,hour,record_key);
                CREATE TABLE IF NOT EXISTS counts (campaign_id TEXT NOT NULL,kind TEXT NOT NULL,total INTEGER NOT NULL,
                    PRIMARY KEY(campaign_id,kind));
                CREATE TRIGGER IF NOT EXISTS count_dataset_records AFTER INSERT ON records BEGIN
                    INSERT INTO counts VALUES(NEW.campaign_id,NEW.kind,1) ON CONFLICT(campaign_id,kind) DO UPDATE SET total=total+1;
                END;
            """)
            db.execute("INSERT OR IGNORE INTO counts SELECT campaign_id,kind,count(*) FROM records GROUP BY campaign_id,kind")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA busy_timeout=10000")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def bytes_used(self):
        return sum(p.stat().st_size for p in self.path.parent.glob(self.path.name + "*") if p.is_file())

    def ensure_space(self):
        # No automatic deletion. Existing completed data remains downloadable.
        import shutil
        if self.bytes_used() >= self.limit_bytes or shutil.disk_usage(self.path.parent).free < 256 * 1024 * 1024:
            raise OSError("Batas penyimpanan dataset / ruang disk tercapai. Pencatatan dijeda; ekspor data sebelum melanjutkan.")

    def save(self, campaign_id, checkpoint, records):
        self.ensure_space()
        with self.connect() as db:
            db.executemany("INSERT INTO records VALUES (?,?,?,?,?,?) ON CONFLICT(campaign_id,run_id,kind,record_key) DO UPDATE SET payload=excluded.payload WHERE records.kind='runs'", [
                (campaign_id, run, kind, key, hour, json.dumps(payload, allow_nan=False, separators=(",", ":")))
                for run, kind, key, hour, payload in records])
            db.execute("INSERT INTO checkpoints(campaign_id,payload) VALUES (?,?) ON CONFLICT(campaign_id) DO UPDATE SET payload=excluded.payload,updated_at=CURRENT_TIMESTAMP",
                       (campaign_id, json.dumps(checkpoint, allow_nan=False, separators=(",", ":"))))

    def load(self):
        with self.connect() as db:
            return [(id, json.loads(payload)) for id, payload in db.execute("SELECT campaign_id,payload FROM checkpoints")]

    def counts(self, id):
        with self.connect() as db:
            return dict(db.execute("SELECT kind,total FROM counts WHERE campaign_id=?", (id,)))

    def csv_rows(self, id, kind):
        if kind not in KINDS:
            raise ValueError("Unknown dataset table")
        # Wide sensor channels would silently impute unavailable assays. Use long form.
        base = ["campaign_id", "run_id", "batch_number", "split", "evidence"]
        fields = {
            "sensors": ["id", "device", "channel", "value", "quality", "quality_flags", "measured_at_hour", "available_at_hour", "expires_at_hour", "stage", "volume_ml", "model_version"],
            "estimates": ["sample_id", "collected_at_hour", "available_at_hour", "volume_ml", "viable_cell_density_million_ml", "count", "unit", "source_sensor_ids", "calibration_profile", "stage", "model_version"],
            "events": ["id", "hour", "wall_time_utc", "kind", "actor", "source_sensor_ids", "details"],
            "truth": ["hour", "ph", "do", "temperature", "glucose", "glutamine", "lactate", "ammonium", "viable_density", "dead_density", "volume_ml", "stage", "active_disturbances"],
            "controls": ["hour", "stirrer_rpm", "oxygen_percent", "base_output_percent", "acid_output_percent", "thermal_output_percent", "setpoints", "active_intervention"],
            "runs": ["seed", "started_at_utc", "case_id", "case_label", "policy", "planned_event_hour", "severity", "duration_hours", "model_version", "status", "hours_recorded", "parameters"],
        }[kind]
        output = io.StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=base + fields, extrasaction="ignore")
        writer.writeheader()
        yield output.getvalue()
        with self.connect() as db:
            cursor = db.execute("SELECT payload FROM records WHERE campaign_id=? AND kind=? ORDER BY run_id,hour,record_key", (id, kind))
            while rows := cursor.fetchmany(256):
                output.seek(0); output.truncate(0)
                for (payload,) in rows:
                    row = json.loads(payload)
                    if kind == "sensors":
                        channels = row.pop("channels", {})
                        quality = row.pop("quality")
                        row.update(quality=quality["status"], quality_flags=quality["flags"])
                        values = [{**row, "channel": channel, "value": value} for channel, value in channels.items()] or [{**row, "channel": "", "value": ""}]
                    else:
                        values = [row]
                    for item in values:
                        for key, value in list(item.items()):
                            if isinstance(value, (dict, list)): item[key] = json.dumps(value, separators=(",", ":"))
                            # Guard against spreadsheet formula execution in free text.
                            elif isinstance(value, str) and value.startswith(("=", "+", "-", "@")): item[key] = "'" + value
                        writer.writerow(item)
                yield output.getvalue()
