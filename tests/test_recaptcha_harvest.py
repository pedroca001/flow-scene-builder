import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import bridge as b
import flow_scene_builder as pipeline


class RecaptchaHarvestTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='flow_recaptcha_test_')
        self.root=Path(self.temp.name)
        self.patches=[patch.dict(os.environ,{'FLOW_WORK_ROOT':str(self.root/'work'),'FLOW_APP_ROOT':str(self.root/'app')}),patch.object(b,'APP',self.root/'app'),patch.object(b,'QUEUE',self.root/'app/queue.json')]
        for item in self.patches:item.start()
        image=self.root/'image.png';Image.new('RGB',(720,1280),'white').save(image)
        self.folder=pipeline.prepare(image,'recaptcha',downloads=self.root/'downloads',project='https://flow.google.com/u/1/project/test').resolve()
        b.enqueue(self.folder);b.dispatch({'op':'claim'})

    def tearDown(self):
        for item in reversed(self.patches):item.stop()
        self.temp.cleanup()

    def submit(self,failures=None):
        b.dispatch({'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[],'failures':failures or []})

    def harvest(self,failures,rpc='MZZa6b'):
        return b.dispatch({'op':'harvested','folder':str(self.folder),'scene':1,'failures':failures,'rpc':rpc,'request_aborted':True})

    def test_abort_baseline_survives_restart_without_token_or_extra_reservation(self):
        old='a'*64;new='b'*64
        self.submit([old])
        _,before=pipeline.read_state(self.folder)
        self.assertTrue(self.harvest([old,new]))
        _,after=pipeline.read_state(self.folder)
        self.assertEqual(after['scenes'][0]['status'],'submitted')
        self.assertEqual(after['scenes'][0]['failure_baseline'],[old])
        self.assertEqual(after['scenes'][0]['recaptcha_harvest']['aborted_failures'],[new])
        self.assertEqual(after.get('credits_reserved'),before.get('credits_reserved'))
        self.assertNotIn('token',json.dumps(after))
        with self.assertRaisesRegex(ValueError,'ja registrada'):self.harvest([old,new])

    def test_invalid_baseline_and_unknown_rpc_never_modify_scene(self):
        self.submit(['a'*64])
        for keys,rpc in [(['b'*64,'c'*64],'MZZa6b'),(['a'*64,'b'*64,'c'*64],'MZZa6b'),(['a'*64,'private-token'],'MZZa6b'),(['a'*64,'b'*64],'unknown')]:
            with self.assertRaises(ValueError):self.harvest(keys,rpc)
        _,state=pipeline.read_state(self.folder)
        self.assertEqual(state['scenes'][0]['failure_baseline'],['a'*64])
        self.assertNotIn('recaptcha_harvest',state['scenes'][0])

    def test_duplicate_historical_card_hash_is_counted_as_multiset(self):
        self.submit(['a'*64]);self.harvest(['a'*64,'a'*64])
        _,state=pipeline.read_state(self.folder)
        self.assertEqual(state['scenes'][0]['recaptcha_harvest']['aborted_failures'],['a'*64])

    def test_resume_removes_only_old_aborted_occurrences_without_hiding_real_failure(self):
        old='a'*64;aborted='b'*64
        self.submit([old]);self.harvest([old,aborted])
        self.assertEqual(pipeline.next_scene(self.folder)['failure_baseline'],[old])
        _,state=pipeline.read_state(self.folder)
        scene=state['scenes'][0]
        scene['recaptcha_harvest'].pop('original_failure_baseline')
        scene['failure_baseline']=[old,aborted]
        pipeline.write_state(self.folder,state)
        self.assertEqual(pipeline.next_scene(self.folder)['failure_baseline'],[old])
        self.assertEqual(pipeline.read_state(self.folder)[1]['scenes'][0]['status'],'submitted')

    def test_no_failed_card_still_requires_and_preserves_the_cdp_abort_receipt(self):
        self.submit()
        with self.assertRaisesRegex(ValueError,'transporte'):
            b.dispatch({'op':'harvested','folder':str(self.folder),'scene':1,'failures':[],'rpc':'MZZa6b'})
        self.harvest([])
        _,state=pipeline.read_state(self.folder)
        receipt=state['scenes'][0]['recaptcha_harvest']
        self.assertIs(receipt['request_aborted'],True);self.assertEqual(receipt['aborted_failures'],[])

    def test_configuration_waits_for_idle_preserves_settings_and_account_holds(self):
        with self.assertRaisesRegex(ValueError,'ocioso'):b.configure_recaptcha_harvest(True)
        b.atomic(b.QUEUE,[])
        b.atomic(b.APP/'settings.json',{'max_parallel':5,'flow_home':'https://flow.google.com/'})
        hold=b.APP/'account_holds.json';b.atomic(hold,{'test@example.com':{'reason':'unusual_activity'}})
        saved=hold.read_bytes()
        self.assertEqual(b.configure_recaptcha_harvest(True)['recaptcha_harvest'],True)
        settings=json.loads((b.APP/'settings.json').read_text())
        self.assertEqual(settings['max_parallel'],5);self.assertEqual(settings['flow_home'],'https://flow.google.com/')
        self.assertEqual(hold.read_bytes(),saved)
        self.assertEqual(b.configure_recaptcha_harvest(False)['recaptcha_harvest'],False)
        with self.assertRaises(ValueError):b.configure_recaptcha_harvest('true')

    def test_hold_prevents_replay_receipt(self):
        self.submit()
        _,state=pipeline.read_state(self.folder);state['account_hold']={'reason':'unusual_activity'};pipeline.write_state(self.folder,state)
        with self.assertRaisesRegex(ValueError,'pausada'):self.harvest(['a'*64])

    def test_authorized_missing_recovery_archives_abort_receipt_before_fresh_harvest(self):
        self.submit();self.harvest([])
        b.dispatch({'op':'recaptcha_delivery','folder':str(self.folder),'scene':1,'state':'rejected','reason':'PUBLIC_ERROR_UNUSUAL_ACTIVITY','http_status':200,'definitive_rejection':True})
        _,state=pipeline.read_state(self.folder)
        state['account_email']='owner@example.com';pipeline.write_state(self.folder,state)
        b.dispatch({'op':'pause','folder':str(self.folder),'error':'supervised recovery'})
        b.authorize_retries(self.folder,'Human authorized two bounded technical recoveries.')
        b.enqueue(self.folder);b.dispatch({'op':'claim'})
        observation={'email':state['account_email'],'home':state['project_creation']['home'],'model_key':'lower','outputs':1,'credits':0}
        b.dispatch({'op':'retry_missing','folder':str(self.folder),'scene':1,'evidence':{'asset_ids':[],'pending':0,'errors':0},'observation':observation})
        _,updated=pipeline.read_state(self.folder);scene=updated['scenes'][0]
        self.assertEqual(scene['status'],'ready');self.assertNotIn('recaptcha_harvest',scene)
        self.assertTrue(scene['technical_retry_intents'][0]['previous_submission']['recaptcha_harvest']['request_aborted'])
        self.assertEqual(scene['technical_retry_intents'][0]['previous_submission']['recaptcha_delivery']['state'],'rejected')
        b.dispatch({'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[],'failures':[],'observation':observation})
        self.harvest([])
        self.assertEqual(len(pipeline.read_state(self.folder)[1]['scenes'][0]['technical_retry_intents']),1)

    def test_accepted_delivery_cannot_be_reset_even_with_no_visible_pending(self):
        self.submit();self.harvest([])
        b.dispatch({'op':'recaptcha_delivery','folder':str(self.folder),'scene':1,'state':'accepted','http_status':200,'definitive_rejection':False})
        _,state=pipeline.read_state(self.folder);state.update(technical_retry_limit=2,retry_authorizations=[{'reason':'authorized'}]);pipeline.write_state(self.folder,state)
        with self.assertRaisesRegex(ValueError,'aceita'):
            b.dispatch({'op':'retry_missing','folder':str(self.folder),'scene':1})
        with self.assertRaisesRegex(ValueError,'ja registrada'):
            b.dispatch({'op':'recaptcha_delivery','folder':str(self.folder),'scene':1,'state':'rejected','http_status':200,'reason':'PUBLIC_ERROR_UNUSUAL_ACTIVITY','definitive_rejection':True})
        self.assertEqual(pipeline.read_state(self.folder)[1]['scenes'][0]['status'],'submitted')

    def test_uncertain_or_prepared_delivery_cannot_consume_a_retry(self):
        self.submit();self.harvest([])
        for status in ('prepared','uncertain'):
            _,state=pipeline.read_state(self.folder);state.update(technical_retry_limit=2,retry_authorizations=[{'reason':'authorized'}]);state['scenes'][0]['recaptcha_delivery']={'state':status};pipeline.write_state(self.folder,state)
            with self.assertRaisesRegex(ValueError,'incerta'):
                b.dispatch({'op':'retry_missing','folder':str(self.folder),'scene':1})
            self.assertNotIn('technical_retry_intents',pipeline.read_state(self.folder)[1]['scenes'][0])

    def test_rpc_recaptcha_rejection_does_not_hold_the_entire_account(self):
        self.submit();self.harvest([])
        b.dispatch({'op':'pause','folder':str(self.folder),'kind':'recaptcha_rejected','error':'PUBLIC_ERROR_UNUSUAL_ACTIVITY'})
        self.assertFalse((b.APP/'account_holds.json').exists())

    def test_confirmed_rejections_use_at_most_two_new_attempts_and_archive_delivery(self):
        _,state=pipeline.read_state(self.folder)
        state.update(account_email='owner@example.com',technical_retry_limit=2,retry_authorizations=[{'reason':'Human approved two attempts'}]);pipeline.write_state(self.folder,state)
        observation={'email':state['account_email'],'home':state['project_creation']['home'],'model_key':'lower','outputs':1,'credits':0}
        for attempt in range(3):
            b.dispatch({'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[],'failures':[],'observation':observation})
            self.harvest([])
            b.dispatch({'op':'recaptcha_delivery','folder':str(self.folder),'scene':1,'state':'rejected','reason':'PUBLIC_ERROR_UNUSUAL_ACTIVITY','http_status':200,'definitive_rejection':True,'capture_to_send_ms':20})
            request={'op':'retry_missing','folder':str(self.folder),'scene':1,'evidence':{'asset_ids':[],'pending':0,'errors':0},'observation':observation}
            if attempt<2:b.dispatch(request)
            else:
                with self.assertRaisesRegex(ValueError,'duas repeticoes'):b.dispatch(request)
        _,state=pipeline.read_state(self.folder);scene=state['scenes'][0]
        self.assertEqual(len(scene['technical_retry_intents']),2)
        self.assertEqual(scene['status'],'submitted')
        self.assertTrue(all(i['previous_submission']['recaptcha_delivery']['capture_to_send_ms']==20 for i in scene['technical_retry_intents']))
