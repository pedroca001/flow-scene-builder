import json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import bridge as b
import flow_scene_builder as f

class GuardrailTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.env=patch.dict(os.environ,{'FLOW_WORK_ROOT':str(self.root/'work'),'FLOW_APP_ROOT':str(self.root/'app')});self.env.start()
  self.app=patch.object(b,'APP',self.root/'app');self.app.start();self.q=patch.object(b,'QUEUE',self.root/'app/queue.json');self.q.start()
  self.image=self.root/'image.png';Image.new('RGB',(720,1280),'white').save(self.image)
 def tearDown(self):self.q.stop();self.app.stop();self.env.stop();self.tmp.cleanup()
 def prepared(self,**kw):
  return b.start(self.image,output_root=self.root/'out',outputs=1,prepare_only=True,account_email='owner@example.com',home='https://flow.google.com/u/2/',**kw)
 def test_preparation_never_claims_and_enqueue_needs_activation(self):
  job=self.prepared(model='lite',max_total_credits=20)
  self.assertEqual(job['seconds'],32);status=b.job_status(job['folder'])
  self.assertEqual(status['next_action'],'activate_after_approval');self.assertEqual(status['credits_reserved'],0);self.assertEqual(status['max_total_credits'],20);self.assertEqual(status['account_email'],'owner@example.com');self.assertEqual(status['model_key'],'lite')
  self.assertIsNone(b.dispatch({'op':'claim'}))
  with self.assertRaises(ValueError):b.enqueue(job['folder'])
  with self.assertRaises(ValueError):b.activate(job['folder'],'')
  b.activate(job['folder'],'User approved exactly one video up to20credits')
  self.assertEqual(b.dispatch({'op':'claim'})['folder'],job['folder'])
 def test_no_paid_start_and_idempotent_modes(self):
  with self.assertRaises(ValueError):b.start(self.image,outputs=1,model='lite',max_total_credits=20)
  a=self.prepared();self.assertTrue(self.prepared()['reused'])
  c=self.prepared(mode='frames_continuous');self.assertNotEqual(a['folder'],c['folder'])
 def test_account_budget_and_duplicate_submission_guards(self):
  folder=Path(self.prepared(model='lite',max_total_credits=4)['folder'])
  _,s=f.read_state(folder)
  obs={'email':'owner@example.com','home':'https://flow.google.com/u/2/','model_key':'lite','credits':5,'outputs':1}
  with self.assertRaisesRegex(ValueError,'Teto'):b.reserve_submission(folder,s,1,obs)
  self.assertEqual(f.read_state(folder)[1]['credits_reserved'],0)
  s['max_total_credits']=20;f.write_state(folder,s)
  for wrong in [{'email':'another@example.com'},{'home':'https://flow.google.com/u/1/'},{'credits':None},{'outputs':3},{'model_key':'lower'}]:
   with self.assertRaises(ValueError):b.reserve_submission(folder,s,1,{**obs,**wrong})
  b.reserve_submission(folder,s,1,obs)
  with self.assertRaisesRegex(ValueError,'ja registrado'):b.reserve_submission(folder,s,1,obs)
  self.assertEqual(f.read_state(folder)[1]['credits_reserved'],5)
  self.assertEqual(f.read_state(folder)[1]['scenes'][0]['submission_receipt']['credits'],5)
  with self.assertRaisesRegex(ValueError,'Antecessor'):b.reserve_submission(folder,s,2,obs)
 def test_quota_pauses_only_bound_account_and_stays_held_for_future_jobs(self):
  a=self.prepared();c=self.prepared(mode='frames_continuous')
  other=b.start(self.image,name='other',outputs=1,output_root=self.root/'out',account_email='other@example.com',home='https://flow.google.com/u/0/')
  b.activate(a['folder'],'User approved');b.activate(c['folder'],'User approved')
  b.dispatch({'op':'claim','exclude':[other['folder']]})
  b.dispatch({'op':'pause','folder':a['folder'],'error':'Quota exceeded','kind':'account_limit'})
  rows={j['folder']:j['state'] for j in b.queue()};self.assertEqual(rows[c['folder']],'paused');self.assertEqual(rows[other['folder']],'queued')
  with self.assertRaises(ValueError):b.enqueue(c['folder'])
  b.release_account('owner@example.com','User authorized after verifying renewed quota')
  b.enqueue(c['folder']);self.assertEqual(b.job_status(c['folder'])['state'],'queued')

 def test_new_preset_requires_continuous_mode_and_carries_action_intents(self):
  preset=f.ROOT/'presets/receita_vids_v2_flow_frames_8s.json'
  with self.assertRaisesRegex(ValueError,'Preset exige'):self.prepared(preset_file=preset)
  job=b.start(self.image,outputs=3,prepare_only=True,mode='frames_continuous',preset_file=preset,output_root=self.root/'out',account_email='owner@example.com')
  _,state=f.read_state(job['folder'])
  self.assertEqual(state['evaluation']['intents'][1],json.loads(preset.read_text())['intents'][1])
  self.assertEqual([s['source'] for s in state['scenes']],['original','last_frame_scene_01','last_frame_scene_02','last_frame_scene_03'])
  self.assertTrue(all('8 ' in s['prompt'] for s in state['scenes']))
  self.assertFalse(any('RV window' in s['prompt'] or 'Tropicana' in s['prompt'] for s in state['scenes']))
 def test_paid_retry_refused_even_from_native_protocol(self):
  job=self.prepared(model='lite',max_total_credits=20);b.activate(job['folder'],'User approved');b.dispatch({'op':'claim'})
  with self.assertRaisesRegex(ValueError,'gratuito'):b.dispatch({'op':'retry_audio','folder':job['folder'],'scene':1,'failure_key':'a'*64})

 def test_changed_price_cannot_spend_on_an_unaffordable_partial_video(self):
  job=self.prepared(model='lite',max_total_credits=20);folder=Path(job['folder']);_,state=f.read_state(folder)
  obs={'email':'owner@example.com','home':'https://flow.google.com/u/2/','model_key':'lite','credits':10,'outputs':1}
  with self.assertRaisesRegex(ValueError,'video completo'):b.reserve_submission(folder,state,1,obs)
  self.assertEqual(f.read_state(folder)[1]['credits_reserved'],0)
  b.reserve_submission(folder,state,1,{**obs,'credits':5})
  self.assertEqual(f.read_state(folder)[1]['credits_reserved'],5)
