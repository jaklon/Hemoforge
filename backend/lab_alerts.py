"""Bounded training alarms from released virtual sensor receipts, never plant state."""
import copy
import math

# Teaching thresholds only; not vendor specifications or validated culture limits.
RULES = {
    "ph": {"device": "core", "channel": "ph", "label": "pH turun", "unit": "pH", "warning": 7.15, "critical": 7.0, "recovery": 7.22,
           "advice": "AUTO menaikkan keluaran basa. Tinjau beban asam dan pulihkan suplai buffer virtual di Guard.", "correction": "restore_buffer"},
    "do": {"device": "core", "channel": "dissolved_oxygen", "label": "DO rendah", "unit": "% air sat.", "warning": 25.0, "critical": 15.0, "recovery": 30.0,
           "advice": "AUTO menaikkan O2 dan RPM. Periksa dan pulihkan jalur gas virtual di Guard.", "correction": "restore_aeration"},
    "glucose": {"device": "trace", "channel": "glucose_mmol_l", "label": "Nutrisi menipis", "unit": "mmol/L", "warning": 5.0, "critical": 2.5, "recovery": 5.3,
                "advice": "Tinjau Trace terbaru, lalu pratinjau feed 1250 mL atau pertukaran medium. Konfirmasi dosis di Guard dan tunggu Trace pascatindakan.", "correction": "review_feed"},
}


class LabAlarms:
    def __init__(self):
        self.states = {}
        self.episodes = {key: 0 for key in RULES}
        self.events = []
        self.event_seq = 0

    def emit(self, kind, record, hour):
        self.event_seq += 1
        self.events.append({"seq": self.event_seq, "kind": kind, "alert_id": record["id"],
                            "metric": record["metric"], "severity": record["severity"], "hour": round(hour, 6)})
        self.events = self.events[-96:]

    def release(self, row):
        if row["quality"]["status"] != "passed":
            return
        for key, rule in RULES.items():
            value = row["channels"].get(rule["channel"])
            if row["device"] != rule["device"] or not isinstance(value, (float, int)) or not math.isfinite(value):
                continue
            old = self.states.get(key)
            active = old and old["status"] == "active"
            severity = "critical" if value < rule["critical"] else "warning" if value < rule["warning"] else None
            if active and not severity and value < rule["recovery"]:
                severity = "warning"
            if not active and not severity:
                continue
            if not active:
                self.episodes[key] += 1
                record = {"id": f"{key}-{self.episodes[key]}", "metric": key, "label": rule["label"], "device": rule["device"],
                          "unit": rule["unit"], "warning_below": rule["warning"], "critical_below": rule["critical"], "recovery_at": rule["recovery"],
                          "advice": rule["advice"], "correction": rule["correction"], "acknowledged": False,
                          "opened_at_hour": row["available_at_hour"], "resolved_at_hour": None, "severity": severity, "status": "active"}
                self.states[key] = record
                self.emit("raised", record, row["available_at_hour"])
            else:
                record = old
                if not severity:
                    record.update(status="resolved", resolved_at_hour=row["available_at_hour"])
                    self.emit("resolved", record, row["available_at_hour"])
                elif severity != record["severity"]:
                    if severity == "critical":
                        record["acknowledged"] = False
                    record["severity"] = severity
                    self.emit("escalated" if severity == "critical" else "improving", record, row["available_at_hour"])
            record.update(value=value, reading_id=row["id"], measured_at_hour=row["measured_at_hour"], available_at_hour=row["available_at_hour"])

    def public(self, hour, readings, faults):
        result = []
        for record in self.states.values():
            row = copy.deepcopy(record)
            latest = next((r for r in reversed(readings) if r["device"] == row["device"] and r["available_at_hour"] <= hour), None)
            valid = (latest and latest["quality"]["status"] == "passed" and latest["expires_at_hour"] >= hour
                     and row["device"] not in faults and math.isfinite(latest["channels"].get(RULES[row["metric"]]["channel"], math.nan)))
            if not valid:
                row.update(status="hold", value=None)
            result.append(row)
        return result

    def find(self, alert_id):
        record = next((r for r in self.states.values() if r["id"] == alert_id), None)
        if not record:
            raise ValueError("Alert episode is no longer current. Refresh Guard.")
        return record

    def acknowledge(self, alert_id, hour):
        record = self.find(alert_id)
        if not record["acknowledged"]:
            record["acknowledged"] = True
            self.emit("acknowledged", record, hour)
