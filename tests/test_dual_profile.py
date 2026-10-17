import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import bridge
from shared_runtime import SharedUiLease, shared_root
from scripts.run_dual_profile_300_flow import merge_manifests


class DualProfileTests(unittest.TestCase):
    def test_pause_freezes_account_when_client_kind_misses_provider_restriction(self):
        folder=Path('/job').resolve();state={'account_email':'same@example.com'}
        with patch.object(bridge,'queue',return_value=[{'folder':str(folder),'state':'running'}]), \
             patch.object(bridge.pipeline,'read_state',return_value=(folder,state)), \
             patch.object(bridge.pipeline,'write_state'),patch.object(bridge,'update'), \
             patch.object(bridge,'hold_account') as hold:
            bridge._dispatch({'op':'pause','folder':str(folder),'kind':'generation_failed',
                              'error':'Notamos uma atividade incomum. As extensões do navegador podem causar problemas.'})
        self.assertEqual(hold.call_args.args[0],'same@example.com')

    def test_two_hosts_share_cadence_and_account_hold(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'FLOW_SHARED_ROOT':directory}):
            root=Path(directory).resolve();folder=root/'job'
            state={'min_submission_interval_seconds':30,'account_email':'same@example.com'}
            with patch.object(bridge.pipeline,'read_state',return_value=(folder,state)):
                for lane,expected in [('a',True),('b',False)]:
                    app=root/lane
                    with patch.object(bridge,'APP',app),patch.object(bridge,'QUEUE',app/'queue.json'):
                        bridge.atomic(bridge.QUEUE,[{'folder':str(folder),'state':'running'}])
                        gate=bridge._dispatch({'op':'submission_gate','folder':str(folder),'scene':1})
                        self.assertEqual(gate['ready'],expected)
                with patch.object(bridge,'APP',root/'a'),patch.object(bridge,'QUEUE',root/'a/queue.json'):
                    bridge.hold_account('same@example.com','Quota visible')
                with patch.object(bridge,'APP',root/'b'):
                    self.assertEqual(bridge.account_held(state)['error'],'Quota visible')

    def test_cross_host_lease_and_owner_guard(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ,{'FLOW_SHARED_ROOT':directory}):
            a,b=SharedUiLease(),SharedUiLease()
            try:
                first=a.acquire(Path(directory)/'a','job-a')
                self.assertTrue(first['acquired'])
                self.assertFalse(b.acquire(Path(directory)/'b','job-b')['acquired'])
                with self.assertRaises(ValueError):a.release('job-b',first['token'])
                a.release('job-a',first['token'])
                self.assertTrue(b.acquire(Path(directory)/'b','job-b')['acquired'])
                b.close()
                self.assertTrue(a.acquire(Path(directory)/'a','job-a')['acquired'])
            finally:a.close();b.close()

    def test_merge_preserves_previous_deliveries_and_refuses_conflicts(self):
        master={'jobs':{'001_hook':{'folder':'old'}},'deliveries':{'001':{'sha256':'old'}}}
        a={'pairs':[{'id':'037'}],'jobs':{'037_hook':{'folder':'a'}},'deliveries':{}}
        b={'pairs':[{'id':'169'}],'jobs':{'169_hook':{'folder':'b'}},'deliveries':{'169':{'sha256':'new'}}}
        merged=merge_manifests(master,[a,b])
        self.assertEqual(set(merged['deliveries']),{'001','169'})
        self.assertEqual(set(master['deliveries']),{'001'})
        with self.assertRaises(ValueError):merge_manifests(master,[a,a])
        with self.assertRaises(ValueError):merge_manifests(master,[{**a,'jobs':{'169_hook':{'folder':'bad'}}}])
        with self.assertRaises(ValueError):merge_manifests({**master,'jobs':{'037_hook':{'folder':'different'}}},[a])
