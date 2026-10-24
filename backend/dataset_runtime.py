"""Server-clock dataset campaign. Never calls an external model, database or device."""
import asyncio
import copy
import hashlib
import random
import sqlite3
import time
from contextlib import suppress
from datetime import datetime, timezone

from backend.biostat import BiostatSession, VERSION, PROFILE
from backend.dataset_scenarios import CATALOG, CATALOG_VERSION, DEFAULT_LOADS
from backend.dataset_store import DatasetStore, FORMAT_VERSION
from backend.lab_interventions import InterventionRequest, active_intervention, queue_intervention
from backend.virtual_lab import Command, END_HOUR, sessions

SESSION_FIELDS = ("id", "scenario", "seed", "created_at", "hour", "speed", "seq", "revision", "running", "phase", "reason",
                  "sample", "frozen", "analysis_seconds", "results", "assays", "interventions", "intervention_seconds",
                  "sensor_readings", "pending_readings", "next_sensor", "controller_events", "training_runs", "sensor_bias")


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def policy_for_batch(number):
    # Rotate untreated cases across cycles: a case must not be permanently tied
    # to one policy just because the catalogue length is divisible by four.
    return "observe_only" if (number + (number-1)//len(CATALOG)) % 4 == 0 else "sensor_rules_v1"


class DatasetCampaign:
    def __init__(self, session, store, *, base_seed=42, max_batches=0):
        self.session, self.store = session, store
        self.id, self.base_seed, self.max_batches = session.id, base_seed, max_batches
        self.controller_digest = digest(session.token)
        self.batch_number = 0
        self.credit = 0.0
        self.error = ""
        self.counts = {}
        self.coverage = []
        self.recent_events = []
        self.finished = False
        self.order = list(range(len(CATALOG)))
        random.Random(base_seed).shuffle(self.order)
        self._reset_batch()
        self.flush()

    def _reset_batch(self):
        s = self.session
        keep = {key:getattr(s,key) for key in ("id", "token", "operator_token", "controller", "viewers", "seq", "revision")}
        speed = s.speed
        self.batch_number += 1
        self.run_id = f"{self.id}-{self.batch_number:06d}"
        batch_seed = int(digest(f"{self.base_seed}/{self.batch_number}")[:8],16) % 2_147_483_647
        self.rng = random.Random(batch_seed)
        self.case = copy.deepcopy(CATALOG[self.order[(self.batch_number - 1) % len(CATALOG)]])
        fresh = BiostatSession(scenario=("balanced", "nutrient_limited", "metabolite_stress")[(self.batch_number-1)%3], seed=batch_seed)
        s.__dict__.update(fresh.__dict__)
        s.__dict__.update(keep)
        s.dataset_campaign = self
        s._controller_digest = self.controller_digest
        s.speed = speed
        s.running = True
        s.reason = "Dataset Live: jam server, skenario dan kebijakan koreksi otomatis; data sintetis."
        self.severity = round(self.rng.uniform(.65,1.25),4)
        self.onset = round(self.rng.uniform(82,125) * 2)/2 if self.batch_number % 3 == 0 else round(self.rng.uniform(4,35)*2)/2
        self.duration = round(self.rng.uniform(8,18)*2)/2
        self.response_delay = round(self.rng.uniform(.5,2),2)
        # Explicit untreated comparison runs; not an AI recommendation or safe control policy.
        self.policy = policy_for_batch(self.batch_number)
        self.split = "train" if batch_seed % 100 < 70 else "validation" if batch_seed % 100 < 85 else "test"
        self.started = self.ended = False
        self.corrected = []
        self.last_decision_hour = -10.0
        self.sensor_cursor = self.estimate_cursor = self.alarm_cursor = 0
        self.intervention_states = {}
        self.last_truth_hour = -1.0
        self.event_seq = 0
        self.pending_records = []
        self.parameters = {"initial_medium_profile":s.scenario,"initial_density_multiplier":round(self.rng.uniform(.8,1.2),6),
                           "initial_medium_multiplier":round(self.rng.uniform(.9,1.1),6)}
        s.culture.state[0] *= self.parameters["initial_density_multiplier"]
        s.culture.state[2:] = [v*self.parameters["initial_medium_multiplier"] for v in s.culture.state[2:]]
        self.event("batch_started", {"case_id":self.case["id"], "policy":self.policy, "seed":batch_seed}, actor="experiment_plan")
        self.record_run("running")
        s.revision += 1

    def meta(self):
        return {"campaign_id":self.id,"run_id":self.run_id,"batch_number":self.batch_number,"split":self.split,"evidence":"synthetic_unvalidated"}

    def record(self, kind, key, hour, payload):
        self.pending_records.append((self.run_id,kind,str(key),round(hour,6),{**copy.deepcopy(payload),**self.meta()}))

    def event(self, kind, details, actor="simulated_guard_rules", sources=None):
        self.event_seq += 1
        self.record("events", self.event_seq, self.session.hour, {"id":self.event_seq,"hour":round(self.session.hour,6),"wall_time_utc":datetime.now(timezone.utc).isoformat(),"kind":kind,
                    "actor":actor,"source_sensor_ids":sources or [],"details":details})
        self.recent_events=([*self.recent_events,{"kind":kind,"hour":round(self.session.hour,3),"actor":actor,"batch_number":self.batch_number}])[-12:]

    def record_run(self, status):
        self.record("runs","run",0,{"seed":self.session.seed,"started_at_utc":self.session.created_at,"case_id":self.case["id"],"case_label":self.case["label"],"policy":self.policy,
            "planned_event_hour":self.onset,"severity":self.severity,"duration_hours":self.duration,"model_version":VERSION,
            "status":status,"hours_recorded":round(self.session.hour,6),"parameters":self.parameters})

    def command(self, action, **values):
        s = self.session
        seq = s.seq
        s._dataset_internal = True
        try: s.apply(Command(seq=s.seq+1,action=action,**values))
        finally:
            s.seq = seq  # background ticks never consume the browser command sequence
            s._dataset_internal = False

    def plan(self):
        s = self.session
        if not self.started and s.hour >= self.onset:
            self.started = True
            targets = {}
            for key,value in self.case["loads"].items():
                targets[key] = (max(.01,value/self.severity) if key in {"aeration_efficiency","growth_multiplier"} else value*self.severity)
            s.culture.load_targets = targets
            if "fault" in self.case: s.faults.add(self.case["fault"])
            self.event("disturbance_started",{"case_id":self.case["id"],"targets":targets,"severity":self.severity},actor="experiment_plan")
            self.coverage = sorted(set([*self.coverage,self.case["id"]]))
        if self.started and not self.ended:
            if "bias" in self.case:
                # A slow bias is not called a detected fault without a reference assay.
                s.sensor_bias[self.case["bias"]] = min(.22, max(0,s.hour-self.onset)*.02)*self.severity
            if s.hour >= self.onset+self.duration:
                self.ended = True
                s.faults.clear()
                s.sensor_bias = {"trace":0.0,"viamass":0.0}
                s.culture.load_targets = dict(DEFAULT_LOADS)
                self.event("scheduled_maintenance",{"case_id":self.case["id"],"notice":"Time-based experiment maintenance; not sensor detection or proof of recovery."},actor="experiment_plan")

    def latest_valid(self, device):
        s = self.session
        row = next((r for r in reversed(s.sensor_readings) if r["device"]==device),None)
        return row if row and device not in s.faults and row["quality"]["status"]=="passed" and row["available_at_hour"]<=s.hour<=row["expires_at_hour"] else None

    def respond(self):
        s = self.session
        if self.policy=="observe_only" or active_intervention(s): return
        alerts = s.alarms.public(s.hour,s.sensor_readings,s.faults)
        mapping = {"ph":"acid_load","ph_high":"acid_load","do":"aeration_efficiency","do_high":"gas_enrichment",
                   "temperature_high":"thermal_load","temperature_low":"thermal_load"}
        for alert in alerts:
            key = mapping.get(alert["metric"])
            if alert["status"]!="active" or s.hour-alert["opened_at_hour"]<self.response_delay or alert["id"] in self.corrected: continue
            if key:
                # Restore equipment/load only after an observed alarm, never use hidden chemistry as a decision input.
                s.culture.load_targets[key] = DEFAULT_LOADS[key]
                self.corrected.append(alert["id"])
                s.alarms.acknowledge(alert["id"],s.hour)
                s.alarms.emit("correction",s.alarms.find(alert["id"]),s.hour)
                event={"id":f"AUTO-{len(s.controller_events)+1}","hour":round(s.hour,6),"kind":"correction","setpoints":dict(s.culture.setpoints)}
                s.controller_events.append(event)
                self.event("restore_virtual_supply",{"alert_id":alert["id"],"parameter":key,"target":DEFAULT_LOADS[key]},sources=[alert["reading_id"]])
        if s.hour-self.last_decision_hour < 2 or s.hour > END_HOUR-2 or len(s.interventions)>=40: return
        readings = [self.latest_valid(device) for device in ("core","trace","viamass")]
        if not all(readings): return
        trace = readings[1]
        glucose,lactate = trace["channels"].get("glucose_mmol_l"),trace["channels"].get("lactate_mmol_l")
        # Every action uses only available sensor values / attributed cell estimates.
        kind,amount = ("medium_exchange",50 if lactate and lactate>10 else 25) if lactate and lactate>6 else ("feed",25)
        slow = len(s.results)>=3 and all(s.results[-i]["count"] < s.results[-i-1]["count"]*.98 for i in (1,2))
        if kind=="feed" and (glucose is None or glucose>=5.3):
            if not slow: return
            kind,amount="medium_exchange",25
        if kind=="feed" and s.culture.volume_ml+amount*50>PROFILE["max_volume_ml"]: kind,amount="medium_exchange",25
        latest = next((r for r in reversed(s.results) if any(id.startswith("TRACE-") for id in r["source_sensor_ids"])),None)
        if not latest: return
        source_ids = [r["id"] for r in readings]
        old_controller = s.controller
        s.controller=True  # server controller, no browser or operator token grant
        try:
            request=InterventionRequest(request_id=digest(f"{self.run_id}/decision/{len(s.interventions)}")[:32],kind=kind,amount=amount,
                source_sample_id=latest["sample_id"],note="AUTOMATIC synthetic sensor rule; glucose/lactate or repeated estimated-count declines")
            record=queue_intervention(s,request,END_HOUR)
            record.update(actor="simulated_guard_rules",decision_sensor_ids=source_ids)
            self.command("execute",intervention_id=record["id"])
            self.last_decision_hour=s.hour
            self.event("intervention_approved",{"intervention_id":record["id"],"kind":kind,"amount":amount,"source_sample_id":latest["sample_id"],
                "glucose":glucose,"lactate":lactate,"estimated_declines":slow},sources=source_ids)
        except ValueError:
            # Missing post-transfer evidence blocks another dose, exactly as in guided Guard.
            pass
        finally: s.controller=old_controller

    def collect(self, force=False):
        s=self.session
        for row in s.sensor_readings[self.sensor_cursor:]: self.record("sensors",row["id"],row["available_at_hour"],row)
        self.sensor_cursor=len(s.sensor_readings)
        for row in s.results[self.estimate_cursor:]: self.record("estimates",row["sample_id"],row["available_at_hour"],row)
        self.estimate_cursor=len(s.results)
        for e in s.alarms.events:
            if e["seq"]>self.alarm_cursor:
                self.event("alarm_"+e["kind"],e,actor="sensor_alarm_engine")
                self.alarm_cursor=e["seq"]
        for record in s.interventions:
            if self.intervention_states.get(record["id"])!=record["status"]:
                self.event("intervention_"+record["status"],record,sources=record.get("decision_sensor_ids",[]))
                self.intervention_states[record["id"]]=record["status"]
        if force or s.hour-self.last_truth_hour>=.5-1e-8:
            self.last_truth_hour=s.hour
            c=s.culture
            load_active=any(abs(getattr(c,key)-DEFAULT_LOADS[key])>.02 or abs(c.load_targets.get(key,DEFAULT_LOADS[key])-DEFAULT_LOADS[key])>.02 for key in self.case["loads"])
            sensor_active=self.case.get("fault") in s.faults or abs(s.sensor_bias.get(self.case.get("bias"),0))>.001
            self.record("truth",f"{s.hour:.6f}",s.hour,{"hour":round(s.hour,6),"ph":c.ph,"do":c.do,"temperature":c.temperature,
                "glucose":c.state[2],"glutamine":c.state[3],"lactate":c.state[4],"ammonium":c.state[5],"viable_density":c.state[0],"dead_density":c.state[1],
                "volume_ml":c.volume_ml,"stage":c.stage,"active_disturbances":[self.case["id"]] if load_active or sensor_active else []})
            self.record("controls",f"{s.hour:.6f}",s.hour,{"hour":round(s.hour,6),**c.outputs,"setpoints":c.setpoints,"active_intervention":active_intervention(s)})

    def advance_wall(self, seconds):
        s=self.session
        if self.error or self.finished: return
        if not s.running:
            self.credit=0
            return
        if seconds>30:
            self.credit=0
            self.event("runtime_clock_gap",{"wall_seconds":round(seconds,3),"notice":"Long suspension/stall; no measurements fabricated during the gap."},actor="runtime")
            s.revision+=1
            return
        self.credit += max(0,min(30,seconds))
        # Fixed wall-time quantum, bounded catch-up. Independent from render rate and viewers.
        for _ in range(min(40,int((self.credit+1e-8)/.1))):
            self.credit=max(0,self.credit-.1)
            self.plan();self.respond()
            self.command("advance",seconds=.1)
            self.collect()
            if not s.running and s.hour<END_HOUR:
                s.running=True  # transfer completion is measured; campaign continues to the next receipt
            if s.hour>=END_HOUR-1e-8 and not active_intervention(s):
                self.collect(force=True);self.record_run("completed")
                self.event("batch_completed",{"hours":s.hour},actor="experiment_plan")
                if self.max_batches and self.batch_number>=self.max_batches:
                    self.finished=True;s.stop("Dataset campaign completed.");self.flush();break
                previous_records=self.pending_records
                self._reset_batch()
                self.pending_records=previous_records+self.pending_records
                # Old-run completion and new-run checkpoint commit in one transaction.
                self.flush()
        s.touched=s.last_tick=time.monotonic()
        s.revision+=1

    def checkpoint(self):
        s=self.session
        return {"format_version":FORMAT_VERSION,"catalog_version":CATALOG_VERSION,"controller_digest":self.controller_digest,
            "base_seed":self.base_seed,"max_batches":self.max_batches,"batch_number":self.batch_number,"run_id":self.run_id,
            "credit":self.credit,"error":self.error,"coverage":self.coverage,"finished":self.finished,"order":self.order,
            "case":self.case,"severity":self.severity,"onset":self.onset,"duration":self.duration,"response_delay":self.response_delay,
            "policy":self.policy,"split":self.split,"started":self.started,"ended":self.ended,"corrected":self.corrected,
            "last_decision_hour":self.last_decision_hour,"sensor_cursor":self.sensor_cursor,"estimate_cursor":self.estimate_cursor,
            "alarm_cursor":self.alarm_cursor,"intervention_states":self.intervention_states,"last_truth_hour":self.last_truth_hour,
            "event_seq":self.event_seq,"parameters":self.parameters,"session":{key:copy.deepcopy(getattr(s,key)) for key in SESSION_FIELDS},
            "recent_events":self.recent_events,
            "culture":copy.deepcopy(s.culture.__dict__),"faults":sorted(s.faults),"alarms":copy.deepcopy(s.alarms.__dict__)}

    def flush(self):
        self.record_run("completed" if self.finished else "paused" if not self.session.running else "running")
        self.store.save(self.id,self.checkpoint(),self.pending_records)
        self.pending_records=[]
        self.counts=self.store.counts(self.id)
        self.last_saved_revision=self.session.revision

    @classmethod
    def restore(cls,store,id,data):
        if data.get("format_version")!=FORMAT_VERSION or data.get("catalog_version")!=CATALOG_VERSION:
            raise ValueError("Dataset checkpoint version incompatible; preserve and export the database before upgrading.")
        self=cls.__new__(cls)
        self.id,self.store=id,store
        for key,value in data.items():
            if key not in {"session","culture","faults","alarms","format_version","catalog_version"}: setattr(self,key,value)
        s=BiostatSession()
        for key,value in data["session"].items(): setattr(s,key,value)
        s.culture.__dict__.update(data["culture"])
        s.faults=set(data["faults"]);s.alarms.__dict__.update(data["alarms"])
        s.dataset_campaign=self;s._controller_digest=self.controller_digest
        self.session=s;self.pending_records=[];self.counts=store.counts(id)
        self.last_saved_revision=-1
        # No fabricated culture progress while the API was offline.
        self.credit=0
        self.event("api_resumed_from_checkpoint",{"notice":"No offline catch-up; clock resumes from last committed state."},actor="runtime")
        return self

    def public(self):
        return {"mode":"server_clock","campaign_id":self.id,"run_id":self.run_id,"batch_number":self.batch_number,
            "case_id":self.case["id"],"case_label":self.case["label"],"policy":self.policy,"split":self.split,
            "status":"error" if self.error else "completed" if self.finished else "running" if self.session.running else "paused",
            "error":self.error,"counts":self.counts,"coverage":self.coverage,"catalog_size":len(CATALOG),"catalog_version":CATALOG_VERSION,
            "format_version":FORMAT_VERSION,"base_seed":self.base_seed,"storage_mb":round(self.store.bytes_used()/1024**2,2),"storage_limit_mb":self.store.limit_bytes//1024**2,
            "clock_notice":"Backend live; browser rendering does not advance or pause culture. API/PC must remain running.",
            "evidence":"synthetic_unvalidated","lag_seconds":round(self.credit,2),"recent_events":self.recent_events}


class DatasetRuntime:
    def __init__(self,store=None):
        self.store=store
        self.campaigns={}
        self.task=None
        self.lock_file=None

    def start(self):
        self.store=self.store or DatasetStore()
        # The live API must use one worker. Fail explicitly rather than silently duplicating a writer.
        self.lock_file=open(str(self.store.path)+".lock","a+b")
        self.lock_file.seek(0);self.lock_file.write(b"0");self.lock_file.flush();self.lock_file.seek(0)
        try:
            if __import__("os").name=="nt":
                import msvcrt
                msvcrt.locking(self.lock_file.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.lock_file,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as error:
            self.lock_file.close();self.lock_file=None
            raise RuntimeError("Dataset writer already active. Run this API with --workers 1.") from error
        for id,data in self.store.load():
            campaign=DatasetCampaign.restore(self.store,id,data)
            self.campaigns[id]=campaign;sessions[id]=campaign.session
        self.task=asyncio.create_task(self.loop())

    def create(self,session,max_batches=0):
        if self.store is None: self.store=DatasetStore()
        if len(self.campaigns)>=4: raise ValueError("Maximum four persistent campaigns. Open an existing Dataset Live session.")
        if any(c.session.running and not c.finished for c in self.campaigns.values()):
            raise ValueError("A Dataset Live campaign is already running. Open it or pause it before starting another.")
        campaign=DatasetCampaign(session,self.store,base_seed=session.seed,max_batches=max_batches)
        self.campaigns[session.id]=campaign
        return campaign

    async def loop(self):
        previous=time.monotonic();last_flush=previous
        try:
            while True:
                await asyncio.sleep(.25)
                now=time.monotonic();elapsed=now-previous;previous=now
                for campaign in list(self.campaigns.values()):
                    try:
                        if campaign.session.running and not campaign.error and not campaign.finished:
                            self.store.ensure_space()
                            campaign.advance_wall(elapsed)
                        if not campaign.error and now-last_flush>=1 and (campaign.pending_records or campaign.session.revision!=campaign.last_saved_revision): campaign.flush()
                    except (OSError,sqlite3.Error,ValueError,ArithmeticError) as error:
                        campaign.error="Pencatatan dijeda: "+str(error)
                        campaign.session.stop(campaign.error)
                if now-last_flush>=1: last_flush=now
        except asyncio.CancelledError:
            pass

    async def close(self):
        if self.task:
            self.task.cancel()
            with suppress(asyncio.CancelledError): await self.task
        try:
            for campaign in self.campaigns.values():
                if not campaign.error: campaign.flush()
        finally:
            if self.lock_file:
                self.lock_file.seek(0)
                if __import__("os").name=="nt":
                    import msvcrt
                    msvcrt.locking(self.lock_file.fileno(),msvcrt.LK_UNLCK,1)
                self.lock_file.close();self.lock_file=None


runtime=DatasetRuntime()
