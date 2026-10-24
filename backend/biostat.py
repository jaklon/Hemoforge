"""Offline BIOSTAT Gen 2 + Trace + ViaMass teaching twin.

All kinetics, controller gains, sensor cadence/noise and capacitance conversion
are illustrative assumptions, not vendor specifications or validated RBC scale-up.
The plant state is private; only scheduled sensor outputs and attributed estimates
cross the snapshot boundary. No instrument, network or paid inference is used.
"""

import hashlib
import math
import random
import time

from backend.culture_simulation import Culture, FRESH_MEDIUM, INTERVENTION_SECONDS, INTERVENTION_HOURS
from backend.virtual_lab import Session, END_HOUR
from backend.lab_interventions import active_intervention
from backend.lab_alerts import LabAlarms

VERSION = "biostat-gen2-teaching-v1"
PROFILE = {
    "id": "biostat-str-gen2", "name": "BIOSTAT STR 50 · Gen 2",
    "pat": ["BioPAT Trace", "BioPAT ViaMass"],
    "min_volume_ml": 12500, "max_volume_ml": 50000,
    "feed_multiplier_ml": 50, "retention_fraction": 0.98,
    "biological_profile": "Illustrative erythroblast expansion → differentiation; not validated at 50 L",
    "unmeasured": ["glutamine_mmol_l", "ammonium_mmol_l", "viability_percent", "osmolality", "co2", "enucleation_percent"],
}
# Culture-hour cadence, delay, expiry. Deliberately accelerated teaching schedules.
SCHEDULE = {"core": (0.5, 0.0, 2.0), "viamass": (1.0, 0.02, 3.0), "trace": (2.0, 0.1, 5.0)}


class BiostatCulture(Culture):
    def __post_init__(self):
        super().__post_init__()
        self.volume_ml = 12500.0
        self.hour = 0.0
        self._target_hour = 0.0
        self._integration_steps = 0
        self.ph, self.do, self.temperature = 7.3, 40.0, 37.0
        self.acid_load = 0.0
        self.aeration_efficiency = 1.0
        # Dataset-mode perturbations; zero/default values preserve guided behavior.
        self.thermal_load = self.gas_enrichment = 0.0
        self.extra_glucose = self.extra_glutamine = self.extra_lactate = 0.0
        self.growth_multiplier = 1.0
        self.load_targets = {}
        self.setpoints = {"ph": 7.3, "dissolved_oxygen": 40.0, "temperature": 37.0}
        self.outputs = {"stirrer_rpm": 100.0, "oxygen_percent": 21.0, "base_output_percent": 0.0,
                        "thermal_output_percent": 0.0}

    @property
    def stage(self):
        return "expansion" if self.hour < 72 else "differentiation"

    def advance(self, hours):
        if not math.isfinite(hours) or not 0 <= hours <= 6:
            raise ValueError("Integration interval outside 0–6 h.")
        # Fixed 0.01 h solver grid. Sub-step render fragments accumulate rather
        # than changing the physics integration. All sensor deadlines lie on it.
        self._target_hour += hours
        while (self._integration_steps + 1) / 100 <= self._target_hour + 1e-9:
            dt = 0.01
            # First-order equipment/load response instead of instant value injection.
            for key, target in self.load_targets.items():
                value = getattr(self, key)
                setattr(self, key, value + (target - value) * (1 - math.exp(-dt / 0.75)))
            stage_factor = 1.0 if self.stage == "expansion" else max(0, 0.25 * (1 - (self.hour - 72) / 72))
            ph_error = self.setpoints["ph"] - self.ph
            do_error = self.setpoints["dissolved_oxygen"] - self.do
            temp_error = self.setpoints["temperature"] - self.temperature
            rpm = max(80, min(220, 100 + do_error * 3))
            # O2 fraction of a virtual O2/N2 blend; nitrogen can lower the DO supply.
            oxygen = max(1, min(80, 21 + do_error * 2 + self.gas_enrichment))
            self.outputs = {"stirrer_rpm": round(rpm, 2), "oxygen_percent": round(oxygen, 2),
                            "base_output_percent": round(max(0, min(100, ph_error * 300)), 2),
                            "acid_output_percent": round(max(0, min(100, -ph_error * 300)), 2),
                            "thermal_output_percent": round(max(-100, min(100, temp_error * 50)), 2)}
            oxygen_factor = self.do / (5 + self.do)
            temp_factor = math.exp(-((self.temperature - 37) / 3) ** 2)
            def derivative(y):
                result = Culture.rates(y)
                # Reduce division and nutrient demand as the illustrative stage changes.
                death_flux = result[1] + 0.003 * max(0, y[1])
                division_flux = result[0] + death_flux
                result[0] = division_flux * stage_factor * oxygen_factor * temp_factor * self.growth_multiplier - death_flux
                for index in range(2, 6):
                    result[index] *= (0.35 + 0.65 * stage_factor) * oxygen_factor
                result[2] -= self.extra_glucose
                result[3] -= self.extra_glutamine
                result[4] += self.extra_lactate
                return result
            y = self.state
            a = derivative(y)
            b = derivative([v + dt * k / 2 for v, k in zip(y, a)])
            c = derivative([v + dt * k / 2 for v, k in zip(y, b)])
            d = derivative([v + dt * k for v, k in zip(y, c)])
            self.state = [max(0, v + dt * (aa + 2 * bb + 2 * cc + dd) / 6)
                          for v, aa, bb, cc, dd in zip(y, a, b, c, d)]
            kla = 0.7 * (rpm / 100) ** 1.2 * self.aeration_efficiency
            self.do = max(0, min(100, self.do + dt *
                          (kla * (100 * oxygen / 21 - self.do) - 35 * y[0] * (0.2 + 0.8 * stage_factor))))
            self.ph = max(6, min(8, self.ph + dt * (ph_error * 2 - max(0, a[4]) * 0.032 - self.acid_load)))
            self.temperature = max(30, min(42, self.temperature + dt * (temp_error * 1.5 + 0.015 * y[0] + self.thermal_load)))
            self._integration_steps += 1
            self.hour = self._integration_steps / 100

    def intervene(self, kind, amount):
        before = self.volume_ml
        if kind == "feed" and amount in (10, 25):
            added = amount * PROFILE["feed_multiplier_ml"]
            after = before + added
            if after > PROFILE["max_volume_ml"]:
                raise ValueError("Feed exceeds the 50 L teaching profile.")
            self.state = [v * before / after if i < 2 else
                          (v * before + FRESH_MEDIUM[i - 2] * added) / after
                          for i, v in enumerate(self.state)]
            self.volume_ml = after
            self.added_ml += added
            exchanged = 0.0
        elif kind == "medium_exchange" and amount in (25, 50):
            fraction = amount / 100
            # Optional virtual retention skid; not claimed to be supplied with Gen 2.
            for i in (0, 1):
                self.state[i] *= 1 - fraction * (1 - PROFILE["retention_fraction"])
            self.state[2:] = [(1 - fraction) * v + fraction * fresh
                             for v, fresh in zip(self.state[2:], FRESH_MEDIUM)]
            exchanged = before * fraction
            self.exchanged_ml += exchanged
            added = 0.0
        else:
            raise ValueError("Unsupported virtual intervention.")
        return {"volume_before_ml": before, "volume_after_ml": self.volume_ml,
                "added_medium_ml": added, "exchanged_medium_ml": exchanged,
                "retention_fraction": PROFILE["retention_fraction"] if exchanged else None}


class BiostatSession(Session):
    def __post_init__(self):
        self.culture = BiostatCulture(self.scenario)
        self.sensor_readings = []
        self.pending_readings = []
        self.next_sensor = {name: 0.0 for name in SCHEDULE}
        self.faults = set()
        self.controller_events = []
        self.alarms = LabAlarms()
        self.training_runs = []
        self.sensor_bias = {"trace": 0.0, "viamass": 0.0}
        self.speed = 0.25
        self.reason = "Ready. Start BIOSTAT; sensors publish automatically with the visible 3D clock."

    def _sample(self, device, at):
        digest = hashlib.sha256(f"{VERSION}:{self.seed}:{device}:{at:.3f}".encode()).digest()
        rng = random.Random(int.from_bytes(digest, "big"))
        culture = self.culture
        if device == "core":
            channels = {"ph": round(culture.ph + rng.gauss(0, 0.005), 3),
                        "dissolved_oxygen": round(max(0, min(100, culture.do + rng.gauss(0, 0.3))), 3),
                        "temperature": round(culture.temperature + rng.gauss(0, 0.02), 3)}
        elif device == "trace":
            channels = {key: round(max(0, value * (1 + rng.gauss(0, 0.02))), 4)
                        for key, value in (("glucose_mmol_l", culture.state[2]), ("lactate_mmol_l", culture.state[4]))}
        else:
            # Size changes affect capacitance. Conversion is explicitly an uncalibrated soft sensor.
            size_factor = self.size_factor(at)
            channels = {"capacitance_pf_cm": round(max(0, culture.state[0] * size_factor *
                        (1 + rng.gauss(0, 0.025))), 6)}
        good = device not in self.faults
        if device in self.sensor_bias:
            channels = {key: round(value * (1 + self.sensor_bias[device]), 6) for key, value in channels.items()}
        return {"id": f"{device.upper()}-{round(at * 100):05d}", "device": device,
                "source_kind": "virtual_sensor", "measured_at_hour": round(at, 6),
                "available_at_hour": round(at + SCHEDULE[device][1], 6),
                "expires_at_hour": round(at + SCHEDULE[device][2], 6),
                "channels": channels if good else {},
                "quality": {"status": "passed" if good else "rejected", "flags": [] if good else ["sensor_fault"]},
                "stage": "expansion" if at < 72 else "differentiation",
                "volume_ml": culture.volume_ml, "model_version": VERSION}

    @staticmethod
    def size_factor(at):
        return max(0.45, 1 - max(0, at - 72) / 120)

    def _release(self):
        for row in list(self.pending_readings):
            if row["available_at_hour"] > self.hour + 1e-8:
                continue
            self.pending_readings.remove(row)
            self.sensor_readings.append(row)
            self.alarms.release(row)
            if row["device"] != "viamass" or row["quality"]["status"] != "passed":
                continue
            at = row["measured_at_hour"]
            # The adapter sees only released readings; no plant chemistry/count access.
            channels, sources = {}, [row["id"]]
            for device in ("core", "trace"):
                latest = next((r for r in reversed(self.sensor_readings) if r["device"] == device), None)
                if latest and latest["quality"]["status"] == "passed" and latest["expires_at_hour"] >= row["available_at_hour"]:
                    channels.update(latest["channels"])
                    sources.append(latest["id"])
            density = row["channels"]["capacitance_pf_cm"] / self.size_factor(at)
            self.results.append({"sample_id": f"PAT-{round(at * 100):05d}",
                "collected_at_hour": at, "available_at_hour": row["available_at_hour"],
                "volume_ml": row["volume_ml"], "viable_cell_density_million_ml": round(density, 6),
                "count": round(density * row["volume_ml"], 6), "unit": "million cells",
                "channels": channels, "source_kind": "model_estimate", "source_sensor_ids": sources,
                "calibration_profile": "illustrative-stage-size-v1 · NOT biologically calibrated",
                "stage": row["stage"], "quality": row["quality"],
                "model_version": VERSION, "evidence": "software_test_only"})

    def _advance_sensors(self, hours):
        target = self.hour + hours
        while True:
            at = min([*self.next_sensor.values(), *[r["available_at_hour"] for r in self.pending_readings]])
            if at > target + 1e-8:
                break
            self.culture.advance(max(0, at - self.hour))
            self.hour = at
            for device in SCHEDULE:
                if self.next_sensor[device] <= at + 1e-8:
                    self.pending_readings.append(self._sample(device, at))
                    self.next_sensor[device] = round(at + SCHEDULE[device][0], 6)
            self._release()
        self.culture.advance(max(0, target - self.hour))
        self.hour = target
        self._release()

    def snapshot(self):
        snapshot = super().snapshot()
        snapshot.pop("protocol")  # No manual assay/aliquot timing in schema 4.
        snapshot.update(schema_version=4, model_version=VERSION,
            device_profile=PROFILE, sensor_readings=self.sensor_readings,
            uncertainty_model={"core": {"ph_sd": 0.005, "do_sd_percentage_points": 0.3, "temperature_sd_c": 0.02},
                "trace": {"relative_sd": 0.02}, "viamass": {"relative_sd": 0.025},
                "calibration_validated": False, "biological_uncertainty_quantified": False},
            sensor_schedule={key: {"interval_hours": v[0], "delay_hours": v[1], "max_age_hours": v[2]}
                             for key, v in SCHEDULE.items()},
            pending_sensor_count=len(self.pending_readings), sensor_faults=sorted(self.faults),
            stage=self.culture.stage, stage_start_hour=0 if self.culture.stage == "expansion" else 72,
            controller={"mode": "AUTO", "setpoints": self.culture.setpoints,
                        "outputs": self.culture.outputs, "events": self.controller_events},
            estimate_notice="ViaMass-derived cell estimates use an illustrative stage/size conversion; not measured RBC yield.",
            lab_alerts=self.alarms.public(self.hour, self.sensor_readings, self.faults),
            alert_events=self.alarms.events,
            training_scenarios={"limit": 12, "runs": self.training_runs},
            process_disturbance={"acid_load_active": abs(self.culture.acid_load) > .02,
                                 "aeration_restricted": self.culture.aeration_efficiency < .95,
                                 "aeration_capacity": round(self.culture.aeration_efficiency,4)},
            intervention_protocol={"animation_seconds": INTERVENTION_SECONDS,
                "culture_minutes": INTERVENTION_HOURS * 60, "max_volume_ml": PROFILE["max_volume_ml"],
                "decision_max_age_hours": 3})
        campaign = getattr(self, "dataset_campaign", None)
        if campaign:
            snapshot["dataset"] = campaign.public()
            snapshot["controller_connected"] = True  # the backend owns this clock
            snapshot["batch_id"] = f"DS-{self.id[:6].upper()}-{campaign.batch_number:05d}"
        return snapshot

    def disturb(self, kind):
        if active_intervention(self) or self.hour > END_HOUR - 3 or len(self.training_runs) >= 12 or len(self.controller_events) >= 38:
            raise ValueError("Finish the transfer or start a fresh training session.")
        alerts = self.alarms.public(self.hour, self.sensor_readings, self.faults)
        if any(r["mitigated_at_hour"] is None for r in self.training_runs) or any(r["status"] in {"active", "hold"} for r in alerts):
            raise ValueError("Resolve the current exercise and wait for a fresh passed recovery reading first.")
        if kind == "ph_drop":
            self.culture.ph = min(self.culture.ph, 6.9)
            self.culture.acid_load = 1.0
        elif kind == "low_do":
            self.culture.do = min(self.culture.do, 14.0)
            self.culture.aeration_efficiency = 0.025
        elif kind == "low_nutrients":
            self.culture.state[2] = min(self.culture.state[2], 4.0)
        else:
            raise ValueError("Unknown teaching scenario.")
        record = {"id": f"SCN-{len(self.training_runs)+1}", "kind": kind, "started_at_hour": round(self.hour, 6), "mitigated_at_hour": None}
        self.training_runs.append(record)
        self.controller_events.append({"id": record["id"], "hour": round(self.hour, 6), "setpoints": dict(self.culture.setpoints), "kind": "disturbance"})
        self.reason = "Teaching disturbance injected. Continue visible culture; alarms wait for scheduled QC-passed sensor releases."

    def alarm_action(self, payload):
        record = self.alarms.find(payload.alert_id)
        if payload.action == "acknowledge":
            self.alarms.acknowledge(payload.alert_id, self.hour)
        else:
            public = next(r for r in self.alarms.public(self.hour, self.sensor_readings, self.faults) if r["id"] == payload.alert_id)
            if public["status"] != "active" or active_intervention(self) or not self.controller:
                raise ValueError("Fresh passed active alarm and connected idle reactor are required.")
            expected = {"restore_buffer": ("ph", "ph_drop"), "restore_aeration": ("do", "low_do")}
            metric, kind = expected[payload.action]
            run = next((r for r in reversed(self.training_runs) if r["kind"] == kind), None)
            if record["metric"] != metric or not run:
                raise ValueError("Correction does not match this training disturbance.")
            if run["mitigated_at_hour"] is None:
                if payload.action == "restore_buffer": self.culture.acid_load = 0.0
                else: self.culture.aeration_efficiency = 1.0
                run["mitigated_at_hour"] = round(self.hour, 6)
                self.controller_events.append({"id": f"FIX-{run['id']}", "hour": round(self.hour, 6), "setpoints": dict(self.culture.setpoints), "kind": "correction"})
                self.alarms.emit("correction", record, self.hour)
                self.reason = "Virtual supply restored. Resume culture and wait for a new passed sensor reading to verify recovery."
        self.revision += 1
        self.touched = time.monotonic()
        return {"accepted": True}

    def apply(self, command):
        if getattr(self, "dataset_campaign", None) and not getattr(self, "_dataset_internal", False):
            if self.dataset_campaign.error or self.dataset_campaign.finished:
                raise ValueError("Dataset paused by storage/error or completed. Inspect Dataset Live status.")
            if command.action == "advance":
                return  # a rendered frame must never double-advance the server clock
            if command.action not in {"play", "pause", "speed"}:
                raise ValueError("Dataset Live owns process actions. Use a guided session for manual experiments.")
        if command.seq <= self.seq:
            return
        if command.seq != self.seq + 1:
            raise ValueError("Command gap. Reconnect.")
        action = command.action
        active = active_intervention(self)
        if action in {"collect", "load", "analyze"}:
            raise ValueError("BIOSTAT uses scheduled online sensors. Manual FLEX2 is disabled for this profile.")
        if action == "play":
            if self.hour >= END_HOUR and self.phase != "intervening":
                raise ValueError("Run complete.")
            if active and active["status"] == "queued":
                raise ValueError("Wait for the rendered controller.")
            self.running = True
            self.reason = "BIOSTAT AUTO · sensors follow rendered culture time."
        elif action == "pause":
            self.stop("Paused. Plant, sensors and actuator animation follow the visible 3D clock.")
        elif action == "speed":
            self.speed = command.speed
        elif action == "setpoints":
            if active:
                raise ValueError("Finish the active intervention first.")
            if len(self.controller_events) >= 40:
                raise ValueError("Controller change limit reached.")
            self.culture.setpoints = {"ph": command.ph_setpoint,
                "dissolved_oxygen": command.do_setpoint, "temperature": command.temperature_setpoint}
            self.controller_events.append({"id": f"SP-{len(self.controller_events) + 1}",
                "hour": round(self.hour, 6), "setpoints": dict(self.culture.setpoints)})
            self.reason = "Virtual setpoints updated within teaching bounds. Local AUTO control remains active."
        elif action == "sensor_fault":
            if command.sensor in self.faults:
                self.faults.remove(command.sensor)
            else:
                self.faults.add(command.sensor)
            self.reason = f"{command.sensor} fault toggled; next scheduled output carries QC status."
        elif action == "disturbance":
            self.disturb(command.disturbance)
        elif action == "execute":
            if not active or active["id"] != command.intervention_id or active["status"] != "queued":
                raise ValueError("Decision is no longer queued.")
            self.intervention_seconds = 0
            active.update(status="executing", started_at_hour=round(self.hour, 6))
            self.phase, self.running = "intervening", True
            self.reason = "Executing the approved virtual pump transfer."
        elif action == "advance" and self.running:
            if self.phase == "intervening":
                seconds = min(command.seconds, INTERVENTION_SECONDS - self.intervention_seconds)
                self.intervention_seconds += seconds
                self._advance_sensors(seconds * INTERVENTION_HOURS / INTERVENTION_SECONDS)
                active["progress"] = min(1, self.intervention_seconds / INTERVENTION_SECONDS)
                if self.intervention_seconds >= INTERVENTION_SECONDS - 1e-8:
                    outcome = self.culture.intervene(active["kind"], active["amount"])
                    active.update(status="applied", progress=1, outcome=outcome, completed_at_hour=round(self.hour, 6))
                    for run in self.training_runs:
                        if run["kind"] == "low_nutrients" and run["mitigated_at_hour"] is None:
                            run["mitigated_at_hour"] = round(self.hour, 6)
                            alarm = self.alarms.states.get("glucose")
                            if alarm: self.alarms.emit("correction", alarm, self.hour)
                    self.phase = "complete"
                    self.stop("Transfer complete. Resume to observe new online sensor readings.")
            else:
                self._advance_sensors(min(END_HOUR - self.hour, command.seconds * self.speed))
                self.phase = "complete"
                if self.hour >= END_HOUR:
                    self.stop("Run complete. Start another scenario to compare cultures.")
        self.seq = command.seq
        self.revision += 1
        self.touched = self.last_tick = time.monotonic()
