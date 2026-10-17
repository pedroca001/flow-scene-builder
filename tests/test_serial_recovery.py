import unittest
from unittest.mock import patch
from scripts import run_serial_300_flow as serial


class SerialRecoveryTest(unittest.TestCase):
    def test_authorized_cooldown_keeps_controller_waiting_without_early_enqueue(self):
        rows=[{'state':'paused','error':'Notamos atividade incomum'},{'state':'complete'}]
        with patch.object(serial,'queue_row',side_effect=rows),patch.object(serial,'atomic') as atomic, \
             patch.object(serial.time,'sleep'),patch.object(serial.pipeline,'read_state',return_value=(None,{'recovery_policy':{'authorization':'Pedro'}})), \
             patch.object(serial.bridge,'schedule_cooldown',return_value={'due_at':1234567890,'status':'waiting'}) as schedule, \
             patch.object(serial.bridge,'enqueue') as enqueue,patch.object(serial.pipeline,'verify',return_value={'verified':True}):
            self.assertTrue(serial.wait_job({'folder':'same-job'},'status')['verified'])
        schedule.assert_called_once_with('same-job');enqueue.assert_not_called()
        self.assertTrue(any(c.args[1].get('retry_at_epoch')==1234567890 for c in atomic.call_args_list))
    def test_repeated_operational_failure_recovers_each_admission_without_more_retry_budget(self):
        paused = {"state": "paused", "error": "Controle do Flow nao encontrado."}
        rows = [{**paused, "queued": 1}, {**paused, "queued": 1},
                {**paused, "queued": 2}, {"state": "complete"}]
        with patch.object(serial, "queue_row", side_effect=rows), \
             patch.object(serial, "atomic"), patch.object(serial.time, "sleep"), \
             patch.object(serial.bridge, "enqueue") as enqueue, \
             patch.object(serial.bridge, "authorize_retries") as authorize, \
             patch.object(serial.pipeline, "read_state",return_value=(None,{})), \
             patch.object(serial.pipeline, "verify", return_value={"verified": True}):
            self.assertEqual(serial.wait_job({"folder": "same-job"}, "unused"), {"verified": True})
        self.assertEqual(enqueue.call_args_list, [unittest.mock.call("same-job"), unittest.mock.call("same-job")])
        authorize.assert_not_called()


if __name__ == "__main__":
    unittest.main()
