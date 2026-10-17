import copy
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
import bridge as b

OLD='11111111-1111-1111-1111-111111111111'
NEW='22222222-2222-2222-2222-222222222222'

class CooldownRecoveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve();self.folder=self.root/'job'
        self.state={'account_email':'owner@example.com','project':'https://flow.google.com/u/2/project/test',
          'project_creation':{'home':'https://flow.google.com/u/2/'},'model_key':'lower','outputs_per_prompt':1,
          'technical_retry_limit':2,'retry_authorizations':[{'at':'authorized'}],
          'recovery_policy':{'delay_seconds':600,'authorization':'Pedro authorized ten-minute retries'},
          'executor_failures':[{'at':'2026-01-01T00:00:00+00:00','kind':'account_limit'}],
          'cooldown_recovery':{'status':'probing','due_at':time.time()-1,'failure_kind':'account_limit','error':'atividade incomum'},
          'scenes':[{'number':1,'status':'complete','media_id':OLD},
                    {'number':2,'status':'submitted','baseline_ids':[OLD],'submission_receipt':{'credits':0},'submitted':'original','ui_submission_observations':{'initial:0':{'observed_at':1}}}]}
        patches=[patch.object(b,'APP',self.root),patch.object(b,'QUEUE',self.root/'queue.json'),
          patch.dict(os.environ,{'FLOW_APP_ROOT':str(self.root),'FLOW_SHARED_ROOT':str(self.root)}),
          patch.object(b.pipeline,'read_state',side_effect=lambda folder:(self.folder,copy.deepcopy(self.state))),
          patch.object(b.pipeline,'write_state',side_effect=self.write)]
        for item in patches:item.start();self.addCleanup(item.stop)
        b.atomic(b.QUEUE,[{'folder':str(self.folder),'state':'running','queued':1}])
        b.atomic(self.root/'account_holds.json',{'owner@example.com':{'error':'Notamos atividade incomum'}})
    def write(self,folder,state):self.state=copy.deepcopy(state)
    def message(self,**evidence):
        return {'op':'cooldown_ready','folder':str(self.folder),
          'observation':{'email':'owner@example.com','home':'https://flow.google.com/u/2/','model_key':'lower','credits':0,'outputs':1},
          'evidence':{'asset_ids':[OLD],'pending':0,'errors':1,'blockers':None,'project':self.state['project'],'checked_at':time.time(),**evidence}}
    def test_due_known_failure_reserves_one_retry_and_preserves_prior_scene(self):
        before=copy.deepcopy(self.state['scenes'][0]);result=b.dispatch(self.message())
        self.assertTrue(result['resume']);self.assertEqual(self.state['scenes'][0],before)
        scene=self.state['scenes'][1];self.assertEqual(scene['status'],'ready')
        self.assertEqual(len(scene['technical_retry_intents']),1)
        self.assertEqual(scene['technical_retry_intents'][0]['previous_submission']['ui_submission_observations']['initial:0']['observed_at'],1)
        self.assertFalse(b.account_held(self.state));self.assertEqual(self.state['cooldown_recovery']['status'],'passed')
    def test_active_blocker_wrong_account_early_probe_and_quota_never_release(self):
        for change in ['blocker','account','early','quota']:
            with self.subTest(change=change):
                original=copy.deepcopy(self.state);message=self.message()
                if change=='blocker':message['evidence']['blockers']='Verify you are human'
                if change=='account':message['observation']['email']='wrong@example.com'
                if change=='early':self.state['cooldown_recovery']['due_at']=time.time()+60
                if change=='quota':b.atomic(self.root/'account_holds.json',{'owner@example.com':{'error':'quota exceeded'}})
                with self.assertRaises(ValueError):b.dispatch(message)
                self.assertEqual(self.state['scenes'][1]['status'],'submitted');self.assertTrue(b.account_held(self.state))
                self.state=original;b.atomic(self.root/'account_holds.json',{'owner@example.com':{'error':'atividade incomum'}})
    def test_pending_result_defers_without_releasing_or_consuming_attempt(self):
        result=b.dispatch(self.message(pending=1));self.assertFalse(result['resume'])
        self.assertTrue(b.account_held(self.state));self.assertEqual(self.state['cooldown_recovery']['status'],'waiting')
        self.assertGreater(self.state['cooldown_recovery']['due_at'],time.time()+590)
        self.assertNotIn('technical_retry_intents',self.state['scenes'][1])
    def test_existing_result_resumes_lookup_without_regenerating(self):
        result=b.dispatch(self.message(asset_ids=[OLD,NEW],errors=0))
        self.assertTrue(result['resume']);self.assertFalse(result['technical_retry_reserved'])
        self.assertEqual(self.state['scenes'][1]['status'],'submitted')
    def test_uncertain_click_and_exhausted_budget_never_regenerate(self):
        for mode in ['uncertain','exhausted']:
            original=copy.deepcopy(self.state)
            if mode=='uncertain':self.state['cooldown_recovery']['failure_kind']=None
            else:self.state['scenes'][1]['technical_retry_intents']=[{},{}]
            with self.assertRaises(ValueError):b.dispatch(self.message())
            self.assertEqual(self.state['scenes'][1]['status'],'submitted');self.assertTrue(b.account_held(self.state))
            self.state=original
    def test_deadline_is_persisted_and_claim_only_probes_after_due(self):
        self.state.pop('cooldown_recovery');b.atomic(b.QUEUE,[{'folder':str(self.folder),'state':'paused','queued':1,'error':'atividade incomum'}])
        first=b.schedule_cooldown(self.folder);self.assertEqual(first,b.schedule_cooldown(self.folder))
        self.assertEqual(first['due_at']-first['failed_at'],600)
        self.state['cooldown_recovery']['due_at']=time.time()+30
        b.update(self.folder,cooldown_recovery_due_at=time.time()+30)
        self.assertIsNone(b.dispatch({'op':'claim'}))
        self.state['cooldown_recovery']['due_at']=time.time()-1
        b.update(self.folder,cooldown_recovery_due_at=time.time()-1)
        self.assertTrue(b.dispatch({'op':'claim'})['cooldown_probe'])
        with self.assertRaisesRegex(ValueError,'ainda nao liberou'):b.dispatch({'op':'submitted','folder':str(self.folder),'scene':2})
    def test_old_paused_jobs_are_not_opened_or_admitted_by_recovery(self):
        self.state['cooldown_recovery'].update(status='waiting',due_at=time.time()-1)
        b.atomic(b.QUEUE,[{'folder':str(self.root/'deleted-legacy-job'),'state':'paused'},
                         {'folder':str(self.folder),'state':'paused','cooldown_recovery_due_at':time.time()-1}])
        with patch.object(b.pipeline,'read_state',side_effect=lambda folder:(self.folder,copy.deepcopy(self.state)) if str(folder)==str(self.folder) else (_ for _ in ()).throw(OSError('Old job unavailable'))):
            self.assertEqual(b.dispatch({'op':'claim'})['folder'],str(self.folder))
