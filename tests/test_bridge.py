import base64, json, os, struct, subprocess, sys, tempfile, unittest, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image
from unittest.mock import patch
import bridge as b
import flow_scene_builder as f

class BridgeTests(unittest.TestCase):
    def test_local_rendering_is_bounded_without_reducing_cloud_job_limit(self):
        folders=[self.folder]+[f.prepare(self.root/'image.png',f'render{i}',downloads=self.root/'downloads',project='https://flow.google.com/u/1/project/test').resolve() for i in range(3)]
        with b.queue_lock():b.atomic(b.QUEUE,[{'folder':str(folder),'state':'running'} for folder in folders])
        gate=threading.Event();entered=threading.Event();lock=threading.Lock();active=0;peak=0;total=0
        def render(folder):
            nonlocal active,peak,total
            with lock:
                active+=1;total+=1;peak=max(peak,active)
                if active==2:entered.set()
            try:
                if not gate.wait(5):raise TimeoutError('Test render gate')
                return {'final':'test.mp4'}
            finally:
                with lock:active-=1
        with patch.object(f,'render',side_effect=render),ThreadPoolExecutor(max_workers=4) as workers:
            futures=[workers.submit(b.dispatch,{'op':'render','folder':str(folder)}) for folder in folders]
            try:
                self.assertTrue(entered.wait(2));self.assertEqual(peak,2);self.assertEqual(active,2)
            finally:gate.set()
            for future in futures:future.result(timeout=5)
        self.assertEqual(total,4);self.assertEqual(peak,2)
        self.assertTrue(all(row['state']=='complete' for row in b.queue()))
        with patch.object(b,'read_settings',return_value={'max_parallel':30}):self.assertEqual(b.parallel_limit(),30)
    def test_start_pins_single_generation_policy_and_reuses_it(self):
        result=b.start(self.root/'image.png','single_generation',outputs=1,output_root=self.root/'single',prepare_only=True,audio_retry_limit=0)
        folder,state=f.read_state(result['folder'])
        self.assertEqual(state['audio_retry_limit'],0)
        reused=b.start(self.root/'image.png','single_generation',outputs=1,output_root=self.root/'single',prepare_only=True,audio_retry_limit=0)
        self.assertTrue(reused['reused']);self.assertEqual(reused['folder'],str(folder))
    def test_configured_five_job_limit_and_invalid_values(self):
        with patch.object(b,'read_settings',return_value={'max_parallel':5}):
            self.assertEqual(b.parallel_limit(),5)
            self.assertIsNone(b.dispatch({'op':'claim','exclude':['a','b','c','d','e']}))
        for value in [0,31,True,'5']:
            with patch.object(b,'read_settings',return_value={'max_parallel':value}):
                with self.assertRaises(ValueError):b.parallel_limit()
    def test_thirty_job_limit(self):
        with patch.object(b,'read_settings',return_value={'max_parallel':30}):
            self.assertEqual(b.parallel_limit(),30)
            self.assertIsNone(b.dispatch({'op':'claim','exclude':[str(i) for i in range(30)]}))
    def test_authorized_missing_submission_recovery_preserves_history_and_rejects_existing_results(self):
        _,state=f.read_state(self.folder);state['account_email']='owner@example.com';f.write_state(self.folder,state)
        b.authorize_retries(self.folder,'User authorized two additional attempts')
        b.enqueue(self.folder);b.dispatch({'op':'claim'})
        old='11111111-1111-4111-8111-111111111111'
        obs={'email':'owner@example.com','home':state['project_creation']['home'],'model_key':'lower','credits':0,'outputs':1}
        submitted={'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[old],'failures':[],'observation':obs}
        b.dispatch(submitted)
        recovery={'op':'retry_missing','folder':str(self.folder),'scene':1,'evidence':{'pending':0,'errors':0,'asset_ids':[old]},'observation':obs}
        for evidence in [{'pending':1},{'errors':1},{'asset_ids':[old,'22222222-2222-4222-8222-222222222222']}]:
            with self.assertRaises(ValueError):b.dispatch({**recovery,'evidence':{**recovery['evidence'],**evidence}})
        with self.assertRaises(ValueError):b.dispatch({**recovery,'observation':{**obs,'credits':5}})
        with self.assertRaises(ValueError):b.dispatch({**recovery,'observation':{**obs,'email':'wrong@example.com'}})
        for _ in range(2):
            b.dispatch(recovery);b.dispatch(submitted)
        with self.assertRaisesRegex(ValueError,'Limite'):b.dispatch(recovery)
        scene=f.next_scene(self.folder)
        self.assertEqual(scene['status'],'submitted')
        self.assertEqual(len(scene['technical_retry_intents']),2)
        self.assertTrue(all(x['previous_submission']['submission_receipt']['credits']==0 for x in scene['technical_retry_intents']))
    def test_single_generation_job_blocks_audio_retry(self):
        b.enqueue(self.folder);b.dispatch({'op':'claim'})
        b.dispatch({'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[],'failures':[]})
        _,state=f.read_state(self.folder);state['audio_retry_limit']=0;f.write_state(self.folder,state)
        with self.assertRaisesRegex(ValueError,'uma geracao'):
            b.dispatch({'op':'retry_audio','folder':str(self.folder),'scene':1,'failure_key':'b'*64})
        scene=f.next_scene(self.folder)
        self.assertEqual(scene['status'],'submitted');self.assertEqual(scene.get('audio_retry_intents',[]),[])
    def test_doctor_compares_live_package_instead_of_stale_handshake(self):
        self.root.joinpath('app').mkdir(exist_ok=True)
        self.root.joinpath('app/connection.json').write_text(json.dumps({'time':0,'build':'old','expected':'old','current':True}))
        package=self.root/'package';package.mkdir()
        (package/'build_id.json').write_text(json.dumps({'build':'new'}))
        with patch.object(b,'__file__',str(self.root/'bridge.py')):
            result=b.doctor()
        self.assertFalse(result['extension_connection']['current'])
        self.assertEqual(result['extension_connection']['expected'],'new')
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='flow_bridge_test_');self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'FLOW_WORK_ROOT':str(self.root/'work'),'FLOW_APP_ROOT':str(self.root/'app')});self.env.start()
        self.app=patch.object(b,'APP',self.root/'app');self.app.start()
        self.q=patch.object(b,'QUEUE',self.root/'app/queue.json');self.q.start()
        image=self.root/'image.png';Image.new('RGB',(720,1280),'white').save(image)
        self.folder=f.prepare(image,'bridge_test',downloads=self.root/'downloads',project='https://flow.google.com/u/1/project/test').resolve()
    def tearDown(self):self.q.stop();self.app.stop();self.env.stop();self.temp.cleanup()
    def test_queue_permission_and_chunk_sequence(self):
        with self.assertRaises(ValueError):b.dispatch({'op':'next','folder':str(self.folder)})
        b.enqueue(self.folder);b.enqueue(self.folder);self.assertEqual(len(b.queue()),1)
        job=b.dispatch({'op':'claim'});self.assertEqual(job['folder'],str(self.folder))
        m={'folder':str(self.folder)}
        scene=b.dispatch({'op':'next',**m})
        self.assertEqual(f.digest(scene['browser_frame_path']),f.digest(scene['start_image_path']))
        self.assertIn(self.folder.name,Path(scene['browser_frame_path']).name)
        frame=b.dispatch({'op':'frame',**m});self.assertTrue(base64.b64decode(frame['data']).startswith(b'\x89PNG'))
        b.dispatch({'op':'submitted',**m,'scene':1,'baseline':['known']})
        with self.assertRaises(ValueError):b.dispatch({'op':'submitted',**m,'scene':1})
        with self.assertRaises(ValueError):b.dispatch({'op':'chunk',**m,'scene':2,'offset':0,'data':'AA=='})
        with self.assertRaises(ValueError):b.dispatch({'op':'chunk',**m,'scene':1,'offset':100,'data':'AA=='})
        b.dispatch({'op':'pause',**m,'error':'Test pause'})
        snapshot=b.watch(self.folder,0)
        self.assertEqual(snapshot['folder'],str(self.folder));self.assertIn('queue_age_seconds',snapshot);self.assertNotIn('queued',snapshot)
        self.assertEqual(snapshot['next_action'],'diagnose')
        self.assertEqual(snapshot['completed'],0)
        self.assertNotIn('"prompt":',json.dumps(snapshot))
        self.assertIsNone(b.dispatch({'op':'claim'}))
        b.enqueue(self.folder);b.dispatch({'op':'claim'})
        self.assertEqual(b.dispatch({'op':'next',**m})['status'],'submitted')
    def test_native_protocol_real_process(self):
        b.enqueue(self.folder)
        p=subprocess.Popen([sys.executable,str(Path(b.__file__)),'serve'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        def ask(obj):
            data=json.dumps(obj).encode();p.stdin.write(struct.pack('<I',len(data))+data);p.stdin.flush()
            head=p.stdout.read(4);self.assertEqual(len(head),4)
            return json.loads(p.stdout.read(struct.unpack('<I',head)[0]))
        try:
            self.assertEqual(ask({'id':1,'op':'claim'})['result']['folder'],str(self.folder))
            msg=ask({'id':2,'op':'frame','folder':str(self.folder),'offset':0})
            self.assertTrue(msg['ok']);self.assertLess(len(json.dumps(msg)),1048576)
        finally:p.stdin.close();p.wait(timeout=10);p.stdout.close();p.stderr.close()
    def test_bind_result_preserves_submission_and_rejects_active_jobs(self):
        asset='8c04beaa-5a48-4091-adf9-9ba7a9ab29fc'
        b.enqueue(self.folder);b.dispatch({'op':'claim'})
        f.mark_submitted(self.folder,1,['legacy'])
        with self.assertRaises(ValueError):b.bind_result(self.folder,asset)
        b.update(self.folder,state='paused')
        with self.assertRaises(ValueError):b.bind_result(self.folder,'https://example.com/signed')
        b.bind_result(self.folder,asset)
        scene=f.next_scene(self.folder)
        self.assertEqual(scene['status'],'submitted')
        self.assertFalse(scene['ready_to_submit'])
        self.assertEqual(scene['result_asset_id'],asset)
        self.assertEqual(scene['baseline_ids'],['legacy'])
    def test_repeated_start_reuses_active_or_paused_job(self):
        b.enqueue(self.folder)
        for state in ['queued','running','paused']:
            b.update(self.folder,state=state)
            r=b.start(self.root/'image.png','bridge_test',project='https://flow.google.com/u/1/project/test',outputs=1)
            self.assertTrue(r['reused']);self.assertEqual(r['queued'],str(self.folder))
            self.assertEqual(r['folder'],str(self.folder))
            self.assertEqual(b.queue()[0]['state'],state)
            self.assertEqual(len(b.queue()),1)
    def test_result_binding_is_permanent_and_rejects_baseline(self):
        old='11111111-1111-4111-8111-111111111111';new='22222222-2222-4222-8222-222222222222'
        b.enqueue(self.folder);b.dispatch({'op':'claim'});f.mark_submitted(self.folder,1,[old])
        args={'op':'result','folder':str(self.folder),'scene':1}
        with self.assertRaises(ValueError):b.dispatch({**args,'media_id':old})
        b.dispatch({**args,'media_id':new});b.dispatch({**args,'media_id':new})
        self.assertEqual(f.next_scene(self.folder)['result_asset_id'],new)
        with self.assertRaises(ValueError):b.dispatch({**args,'media_id':'33333333-3333-4333-8333-333333333333'})
    def test_audio_retries_are_bounded_and_preserve_submitted_state(self):
        b.enqueue(self.folder);b.dispatch({'op':'claim'})
        b.dispatch({'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[],'failures':['a'*64]})
        args={'op':'retry_audio','folder':str(self.folder),'scene':1}
        with self.assertRaises(ValueError):b.dispatch({**args,'failure_key':'a'*64})
        b.dispatch({**args,'failure_key':'b'*64});b.dispatch({**args,'failure_key':'b'*64})
        with self.assertRaises(ValueError):b.dispatch({**args,'failure_key':'b'*64})
        scene=f.next_scene(self.folder)
        self.assertEqual(scene['status'],'submitted');self.assertEqual(len(scene['audio_retry_intents']),2)

    def test_new_project_lifecycle_and_no_duplicate_click(self):
        folder=f.prepare(self.root/'image.png','new',downloads=self.root/'out',outputs=3)
        b.enqueue(folder);job=b.dispatch({'op':'claim','exclude':[str(self.folder)]})
        self.assertIsNone(job['project']);self.assertEqual(job['project_mode'],'new')
        args={'folder':str(folder)}
        with self.assertRaisesRegex(ValueError,'nomear'):b.dispatch({'op':'next',**args})
        creation=b.dispatch({'op':'project_intent',**args,'tab_id':123})
        self.assertRegex(creation['title'],r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$')
        with self.assertRaisesRegex(ValueError,'ja iniciada'):b.dispatch({'op':'project_intent',**args,'tab_id':123})
        home=creation.get('home',f.flow_home())
        url=f"{home}project/11111111-1111-4111-8111-111111111111"
        with self.assertRaises(ValueError):b.dispatch({'op':'project_bound',**args,'tab_id':999,'project':url})
        b.dispatch({'op':'project_bound',**args,'tab_id':123,'project':url})
        b.dispatch({'op':'project_ready',**args,'title':creation['title']})
        self.assertTrue(b.dispatch({'op':'next',**args})['ready_to_submit'])
        with patch('candidate_selection.evaluator_preflight'):
            reused=b.start(self.root/'image.png','new',output_root=self.root/'out')
        self.assertTrue(reused['reused']);self.assertEqual(reused['folder'],str(folder.resolve()))

    def test_new_project_stays_on_configured_google_account(self):
        with patch.object(f,'DEFAULT_HOME','https://flow.google.com/u/0/'):
            folder=f.prepare(self.root/'image.png','account_zero',downloads=self.root/'out')
        b.enqueue(folder);b.dispatch({'op':'claim'})
        args={'folder':str(folder),'tab_id':42}
        b.dispatch({'op':'project_intent',**args})
        with self.assertRaisesRegex(ValueError,'conta configurada'):
            b.dispatch({'op':'project_bound',**args,'project':'https://flow.google.com/u/1/project/11111111-1111-4111-8111-111111111111'})
        b.dispatch({'op':'project_bound',**args,'project':'https://flow.google.com/u/0/project/11111111-1111-4111-8111-111111111111'})
        self.assertIn('/u/0/',f.read_state(folder)[1]['project'])

    def test_ten_unique_claims_and_isolated_pause(self):
        from concurrent.futures import ThreadPoolExecutor
        folders=[f.prepare(self.root/'image.png',f'parallel_{n}',downloads=self.root/'out') for n in range(11)]
        with ThreadPoolExecutor(max_workers=11) as pool:list(pool.map(b.enqueue,folders))
        self.assertEqual(len(b.queue()),11)
        active=[]
        for _ in range(10):active.append(b.dispatch({'op':'claim','exclude':active})['folder'])
        self.assertEqual(len(set(active)),10)
        self.assertIsNone(b.dispatch({'op':'claim','exclude':active}))
        b.dispatch({'op':'pause','folder':active[0],'error':'isolated failure'})
        self.assertEqual(sum(row['state']=='running' for row in b.queue()),9)
        replacement=b.dispatch({'op':'claim','exclude':active[1:]})
        self.assertNotIn(replacement['folder'],active)
        self.assertIn(replacement['folder'],[str(folder.resolve()) for folder in folders])
        resumed=b.dispatch({'op':'claim','exclude':[]})
        self.assertIn(resumed['folder'],active[1:])

    def test_native_long_evaluation_does_not_block_another_job(self):
        # Real framed stdio process; a slow operation and a fast one must reply out of order.
        code="import time,bridge as b; b._dispatch=lambda m: (time.sleep(0.7) or 'slow') if m['op']=='slow' else 'fast'; b.serve()"
        p=subprocess.Popen([sys.executable,'-c',code],cwd=Path(b.__file__).parent,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            for msg in [{'id':1,'op':'slow','folder':str(self.root/'a')},{'id':2,'op':'fast','folder':str(self.root/'b')}]:
                data=json.dumps(msg).encode();p.stdin.write(struct.pack('<I',len(data))+data)
            p.stdin.flush()
            responses=[]
            for _ in range(2):
                head=p.stdout.read(4);responses.append(json.loads(p.stdout.read(struct.unpack('<I',head)[0])))
            self.assertEqual([r['id'] for r in responses],[2,1]);self.assertTrue(all(r['ok'] for r in responses))
        finally:p.stdin.close();p.wait(timeout=10);p.stdout.close();p.stderr.close()

    def test_explicit_legacy_project_jobs_do_not_run_together(self):
        b.enqueue(self.folder)
        other=f.prepare(self.root/'image.png','same_project',downloads=self.root/'out',project='https://flow.google.com/u/1/project/test')
        b.enqueue(other)
        first=b.dispatch({'op':'claim'})
        self.assertIsNone(b.dispatch({'op':'claim','exclude':[first['folder']]}))
        b.update(self.folder,state='complete')
        self.assertEqual(b.dispatch({'op':'claim','exclude':[]})['folder'],str(other.resolve()))
        self.assertEqual(len(b.watch_batch([self.folder,other],0)['jobs']),2)
