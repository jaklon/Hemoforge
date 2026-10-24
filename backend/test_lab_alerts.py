"""Offline training-alarm/control tests. No database, network or physical device."""
import copy
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.api import app
from backend.biostat import BiostatSession
from backend.lab_alerts import LabAlarms
from backend.virtual_lab import Command, AlarmAction, sessions
from backend.lab_interventions import InterventionRequest, queue_intervention

HEADERS={"origin":"http://127.0.0.1:8443","x-hemoforge-action":"virtual-lab"}


def act(s, action, **values):
    s.apply(Command(seq=s.seq+1,action=action,**values))


def advance(s, hour):
    act(s,"speed",speed=1);act(s,"play")
    while s.hour<hour-1e-8:
        act(s,"advance",seconds=min(.5,hour-s.hour))


class AlarmTests(unittest.TestCase):
    def setUp(self):
        self.db=patch("backend.db.connect",side_effect=AssertionError("No database"));self.db.start();self.addCleanup(self.db.stop)
        self.net=patch("socket.create_connection",side_effect=AssertionError("No external network"));self.net.start();self.addCleanup(self.net.stop)

    def test_scenario_does_not_rewrite_receipts_or_publish_future_trace(self):
        s=BiostatSession();advance(s,1.2);old=copy.deepcopy(s.sensor_readings)
        act(s,"pause");act(s,"disturbance",disturbance="low_nutrients")
        self.assertEqual(s.sensor_readings,old)
        self.assertEqual(s.snapshot()["lab_alerts"],[])
        hour=s.hour;act(s,"advance",seconds=.5);self.assertEqual(s.hour,hour)
        advance(s,2.05);self.assertEqual(s.snapshot()["lab_alerts"],[])
        advance(s,2.11)
        a=s.snapshot()["lab_alerts"][0]
        self.assertEqual(a["metric"],"glucose");self.assertEqual(a["reading_id"],"TRACE-00200")
        self.assertLess(a["value"],5);self.assertEqual(s.sensor_readings[:len(old)],old)

    def test_ph_auto_response_acknowledgement_and_measured_recovery(self):
        s=BiostatSession();s.controller=True
        act(s,"disturbance",disturbance="ph_drop");advance(s,1)
        a=s.snapshot()["lab_alerts"][0]
        self.assertEqual(a["severity"],"critical");self.assertGreater(s.culture.outputs["base_output_percent"],90)
        s.alarm_action(AlarmAction(alert_id=a["id"],action="acknowledge"))
        self.assertEqual(s.snapshot()["lab_alerts"][0]["status"],"active")
        events=len(s.alarms.events);s.alarm_action(AlarmAction(alert_id=a["id"],action="acknowledge"))
        self.assertEqual(len(s.alarms.events),events)
        before=s.culture.ph;history=copy.deepcopy(s.sensor_readings)
        s.alarm_action(AlarmAction(alert_id=a["id"],action="restore_buffer"))
        self.assertEqual(s.culture.ph,before);self.assertEqual(s.sensor_readings,history)
        self.assertEqual(s.snapshot()["lab_alerts"][0]["status"],"active")
        advance(s,3)
        recovered=s.snapshot()["lab_alerts"][0]
        self.assertEqual(recovered["status"],"resolved");self.assertGreaterEqual(recovered["value"],7.22)
        self.assertGreater(recovered["measured_at_hour"],a["measured_at_hour"])

    def test_do_restriction_and_paired_correction_restore_future_readings(self):
        s=BiostatSession();s.controller=True
        act(s,"disturbance",disturbance="low_do");advance(s,1)
        a=next(r for r in s.snapshot()["lab_alerts"] if r["metric"]=="do")
        self.assertEqual(a["severity"],"critical")
        self.assertTrue(s.snapshot()["process_disturbance"]["aeration_restricted"])
        self.assertGreater(s.culture.outputs["oxygen_percent"],60);self.assertGreater(s.culture.outputs["stirrer_rpm"],150)
        s.alarm_action(AlarmAction(alert_id=a["id"],action="restore_aeration"));advance(s,2)
        a=next(r for r in s.snapshot()["lab_alerts"] if r["metric"]=="do")
        self.assertEqual(a["status"],"resolved");self.assertFalse(s.snapshot()["process_disturbance"]["aeration_restricted"])

    def test_nutrient_feed_waits_for_trace_after_atomic_transfer(self):
        s=BiostatSession();s.controller=True
        act(s,"disturbance",disturbance="low_nutrients");advance(s,1.2)
        a=next(r for r in s.snapshot()["lab_alerts"] if r["metric"]=="glucose")
        request=InterventionRequest(request_id="a"*32,kind="feed",amount=25,source_sample_id=s.results[-1]["sample_id"],note="Review low glucose Trace")
        record=queue_intervention(s,request,168);act(s,"execute",intervention_id=record["id"])
        for _ in range(8):act(s,"advance",seconds=.5)
        self.assertEqual(s.culture.volume_ml,13750)
        self.assertEqual(s.snapshot()["lab_alerts"][0]["reading_id"],a["reading_id"])
        self.assertEqual(s.snapshot()["lab_alerts"][0]["status"],"active")
        advance(s,2.11)
        a=next(r for r in s.snapshot()["lab_alerts"] if r["metric"]=="glucose")
        self.assertEqual(a["status"],"resolved");self.assertGreaterEqual(a["value"],5.3)

    def test_qc_stale_and_disconnect_never_confirm_recovery_or_allow_restore(self):
        s=BiostatSession();s.controller=True;act(s,"disturbance",disturbance="ph_drop");advance(s,1)
        a=s.snapshot()["lab_alerts"][0]
        act(s,"sensor_fault",sensor="core");advance(s,1.5)
        self.assertEqual(s.snapshot()["lab_alerts"][0]["status"],"hold")
        self.assertIsNone(s.snapshot()["lab_alerts"][0]["value"])
        with self.assertRaises(ValueError):s.alarm_action(AlarmAction(alert_id=a["id"],action="restore_buffer"))
        self.assertEqual(s.alarms.public(100,s.sensor_readings,set())[0]["status"],"hold")
        s.controller=False
        with self.assertRaises(ValueError):s.alarm_action(AlarmAction(alert_id=a["id"],action="restore_buffer"))

    def test_hysteresis_escalation_episode_ids_and_bounded_notifications(self):
        engine=LabAlarms()
        def release(value,h):
            engine.release({"id":f"CORE-{h}","device":"core","channels":{"ph":value},"quality":{"status":"passed"},"measured_at_hour":h,"available_at_hour":h})
        release(7.1,1);engine.acknowledge("ph-1",1)
        release(7.18,2);self.assertEqual(engine.states["ph"]["status"],"active")
        release(6.9,3);self.assertFalse(engine.states["ph"]["acknowledged"])
        count=len(engine.events);release(6.9,4);self.assertEqual(len(engine.events),count)
        release(7.23,5);self.assertEqual(engine.states["ph"]["status"],"resolved")
        release(7.1,6);self.assertEqual(engine.states["ph"]["id"],"ph-2")
        for h in range(7,150):release(6.9 if h%2 else 7.3,h)
        self.assertLessEqual(len(engine.events),96)

    def test_duplicate_scenario_command_and_conflicting_exercises_are_bounded(self):
        s=BiostatSession();c=Command(seq=1,action="disturbance",disturbance="ph_drop")
        s.apply(c);s.apply(c);self.assertEqual(len(s.training_runs),1)
        with self.assertRaises(ValueError):act(s,"disturbance",disturbance="low_do")
        self.assertEqual(len(s.training_runs),1)

    def test_operator_route_requires_local_origin_pairing_and_matching_active_alarm(self):
        s=BiostatSession();s.controller=True;s.operator_token="operator-test"
        act(s,"disturbance",disturbance="low_do");advance(s,1)
        alert=s.snapshot()["lab_alerts"][0]
        path=f"/api/v1/lab/sessions/{s.id}/alarm-actions"
        with patch.dict(sessions,{s.id:s},clear=True):
            client=TestClient(app);payload={"alert_id":alert["id"],"action":"restore_aeration"}
            self.assertEqual(client.post(path,headers=HEADERS,json=payload).status_code,403)
            headers={**HEADERS,"x-lab-operator":"operator-test"}
            self.assertEqual(client.post(path,headers={**headers,"origin":"https://example.org"},json=payload).status_code,403)
            self.assertEqual(client.post(path,headers=headers,json={**payload,"action":"set_ph_directly"}).status_code,422)
            self.assertEqual(client.post(path,headers=headers,json={**payload,"action":"restore_buffer"}).status_code,409)
            self.assertEqual(client.post(path,headers=headers,json=payload).status_code,200)
            self.assertEqual(client.post(path,headers=headers,json=payload).status_code,200)


if __name__=="__main__":unittest.main()
