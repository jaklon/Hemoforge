"""Offline dataset lineage, continuous clock and durable-recovery regressions."""
import asyncio
import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.biostat import BiostatSession
from backend.dataset_runtime import DatasetCampaign, DatasetRuntime, policy_for_batch
from backend.dataset_store import DatasetStore
from backend.dataset_scenarios import CATALOG
from backend.virtual_lab import Command, controller_matches


class DatasetTests(unittest.TestCase):
    def setUp(self):
        Path(".cache").mkdir(exist_ok=True)
        self.temp=tempfile.TemporaryDirectory(dir=Path(".cache").resolve(),prefix="dataset-test-")
        self.store=DatasetStore(Path(self.temp.name)/"dataset.sqlite3")
        self.no_network=patch("socket.create_connection",side_effect=AssertionError("Dataset must stay offline"));self.no_network.start()
        self.no_db=patch("backend.db.connect",side_effect=AssertionError("No external DB"));self.no_db.start()
    def tearDown(self):
        self.no_db.stop();self.no_network.stop();self.temp.cleanup()
    def campaign(self,seed=42,max_batches=0):
        return DatasetCampaign(BiostatSession(seed=seed),self.store,base_seed=seed,max_batches=max_batches)
    def advance(self,c,wall):
        for _ in range(round(wall*10)): c.advance_wall(.1)
    def test_server_clock_progresses_without_browser_and_duplicate_frames_cannot_double_tick(self):
        c=self.campaign();s=c.session
        self.assertFalse(s.controller)
        self.advance(c,4)
        self.assertAlmostEqual(s.hour,1)
        self.assertTrue(s.snapshot()["controller_connected"])
        hour=s.hour;seq=s.seq
        s.apply(Command(seq=seq+1,action="advance",seconds=.5))
        self.assertEqual(s.hour,hour);self.assertEqual(s.seq,seq)
        s.apply(Command(seq=seq+1,action="pause"));self.advance(c,4)
        self.assertEqual(s.hour,hour)
        s.apply(Command(seq=seq+2,action="play"));self.advance(c,1)
        self.assertGreater(s.hour,hour)
        hour=s.hour;c.advance_wall(3600);self.assertEqual(s.hour,hour)
        with self.assertRaises(ValueError):s.apply(Command(seq=s.seq+1,action="disturbance"))
    def test_replay_partition_checkpoint_and_controller_hash_are_stable(self):
        a=self.campaign(seed=7);b=self.campaign(seed=7)
        self.advance(a,20)
        for _ in range(10):b.advance_wall(2)
        self.assertEqual(a.session.sensor_readings,b.session.sensor_readings)
        token=a.session.token;a.flush()
        saved=dict(self.store.load())[a.id]
        text=json.dumps(saved)
        self.assertNotIn(token,text);self.assertNotIn("operator_token",text)
        restored=DatasetCampaign.restore(self.store,a.id,saved)
        self.assertTrue(controller_matches(restored.session,token));self.assertFalse(controller_matches(restored.session,"bad"))
        self.advance(a,10);self.advance(restored,10)
        self.assertEqual(a.session.sensor_readings,restored.session.sensor_readings)
        self.assertEqual(a.session.culture.state,restored.session.culture.state)
    def test_catalog_has_distinct_cases_rolls_batches_and_bounds_memory(self):
        self.assertGreaterEqual(len(CATALOG),20)
        c=self.campaign(max_batches=2);c.session.speed=12
        self.advance(c,160)
        c.flush()
        self.assertTrue(c.finished)
        self.assertEqual(c.batch_number,2)
        self.assertEqual(len(c.coverage),2)
        self.assertLess(len(c.session.sensor_readings),1000)
        rows=list(csv.DictReader(io.StringIO("".join(self.store.csv_rows(c.id,"runs")))))
        self.assertEqual(len(rows),2);self.assertTrue(all(row["status"]=="completed" for row in rows))
        self.assertEqual({row["batch_number"] for row in rows},{"1","2"})
        for position in range(len(CATALOG)):
            self.assertEqual({policy_for_batch(position+1+cycle*len(CATALOG)) for cycle in range(4)}, {"observe_only","sensor_rules_v1"})
    def test_sensor_exports_separate_truth_and_do_not_impute_rejected_channels(self):
        c=self.campaign();c.case=next(x for x in CATALOG if x["id"]=="trace_dropout").copy();c.onset=0
        self.advance(c,16);c.flush()
        sensors=list(csv.DictReader(io.StringIO("".join(self.store.csv_rows(c.id,"sensors")))))
        rejected=[r for r in sensors if r["quality"]=="rejected"]
        self.assertTrue(rejected);self.assertTrue(all(r["value"]=="" for r in rejected))
        self.assertNotIn("case_id",sensors[0]);self.assertNotIn("glutamine",sensors[0])
        self.assertNotIn("true_density",sensors[0]);self.assertNotIn("active_disturbances",sensors[0])
        truth=list(csv.DictReader(io.StringIO("".join(self.store.csv_rows(c.id,"truth")))))
        self.assertIn("glutamine",truth[0]);self.assertTrue(all(r["evidence"]=="synthetic_unvalidated" for r in truth))
        self.assertTrue(all(float(r["available_at_hour"])>=float(r["measured_at_hour"]) for r in sensors))
    def test_policy_uses_only_released_valid_receipts_and_records_untreated_controls(self):
        c=self.campaign();c.case=next(x for x in CATALOG if x["id"]=="acid_and_do").copy();c.onset=0;c.session.speed=1
        self.advance(c,12);c.flush()
        with self.store.connect() as db:
            rows=[(kind,json.loads(payload)) for kind,payload in db.execute("SELECT kind,payload FROM records WHERE campaign_id=?",(c.id,))]
        sensors={r["id"]:r for kind,r in rows if kind=="sensors"}
        actions=[r for kind,r in rows if kind=="events" and r["kind"]=="restore_virtual_supply"]
        self.assertTrue(actions)
        for action in actions:
            self.assertTrue(action["source_sensor_ids"])
            for id in action["source_sensor_ids"]:
                row=sensors[id];self.assertEqual(row["quality"]["status"],"passed")
                self.assertLessEqual(row["available_at_hour"],action["hour"])
                self.assertGreaterEqual(row["expires_at_hour"],action["hour"])
        c.policy="observe_only";c.corrected=[];before=len(c.pending_records);c.respond()
        self.assertEqual(len(c.pending_records),before)
    def test_quota_stops_writes_without_deleting_existing_records(self):
        c=self.campaign();before=self.store.counts(c.id)
        self.store.limit_bytes=1
        with self.assertRaises(OSError):c.flush()
        self.assertEqual(self.store.counts(c.id),before)
    def test_full_catalog_completes_with_finite_truth_and_explicit_comparison_runs(self):
        c=self.campaign(max_batches=len(CATALOG));c.session.speed=12
        for _ in range(3000):
            c.advance_wall(1)
            if c.finished:break
        c.flush()
        self.assertTrue(c.finished)
        self.assertEqual(set(c.coverage),{case["id"] for case in CATALOG})
        runs=list(csv.DictReader(io.StringIO("".join(self.store.csv_rows(c.id,"runs")))))
        self.assertEqual(len(runs),len(CATALOG))
        self.assertIn("observe_only",{r["policy"] for r in runs})
        self.assertTrue(all(r["status"]=="completed" for r in runs))
        with self.store.connect() as db:
            for (payload,) in db.execute("SELECT payload FROM records WHERE kind='truth'"):
                row=json.loads(payload)
                self.assertTrue(6<=row["ph"]<=8)
                self.assertTrue(0<=row["do"]<=100)
                self.assertTrue(0<row["volume_ml"]<=50000)
    def test_background_worker_survives_no_views_and_releases_single_writer_lock(self):
        async def scenario():
            runtime=DatasetRuntime(self.store);runtime.start()
            try:
                s=BiostatSession();runtime.create(s)
                await asyncio.sleep(.6)
                self.assertGreater(s.hour,0);self.assertFalse(s.controller)
                other=DatasetRuntime(self.store)
                with self.assertRaises(RuntimeError):other.start()
            finally:await runtime.close()
            again=DatasetRuntime(self.store);again.start()
            try:self.assertIn(s.id,again.campaigns)
            finally:await again.close()
        asyncio.run(scenario())
    def test_api_start_exports_origin_checks_and_controller_disconnect(self):
        from fastapi.testclient import TestClient
        from backend.api import app
        from backend.virtual_lab import sessions
        runtime=DatasetRuntime(self.store)
        headers={"origin":"http://127.0.0.1:8443","x-hemoforge-action":"virtual-lab"}
        with patch("backend.dataset_runtime.runtime",runtime),patch.dict(sessions,{},clear=True),TestClient(app) as client:
            response=client.post("/api/v1/lab/sessions",headers=headers,json={"execution_mode":"dataset","seed":42,"max_batches":2})
            self.assertEqual(response.status_code,201,response.text)
            result=response.json();id=result["session_id"];token=result["controller_token"]
            self.assertEqual(client.get("/api/v1/lab/datasets").status_code,200)
            self.assertEqual(client.get("/api/v1/lab/datasets",headers={"origin":"https://example.org"}).status_code,403)
            self.assertEqual(client.get("/api/v1/lab/datasets",headers={"sec-fetch-site":"cross-site"}).status_code,403)
            path=f"/api/v1/lab/sessions/{id}"
            with client.websocket_connect(path+"/stream",headers={"origin":headers["origin"]}) as ws:
                ws.send_json({"role":"controller","token":token})
                snap=ws.receive_json()
                self.assertEqual(snap["dataset"]["mode"],"server_clock")
                self.assertNotIn(token,json.dumps(snap))
            self.assertTrue(runtime.campaigns[id].session.running)
            manifest=client.get(path+"/dataset/manifest").json()
            self.assertNotIn(token,json.dumps(manifest))
            self.assertEqual(len(manifest["catalog"]),len(CATALOG))
            response=client.get(path+"/dataset/runs.csv")
            self.assertEqual(response.status_code,200)
            self.assertIn("synthetic_unvalidated",response.text)
            self.assertEqual(client.get(path+"/dataset/unknown.csv").status_code,404)

if __name__=="__main__":unittest.main()
