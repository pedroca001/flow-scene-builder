import base64,json,os,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import flow_scene_builder as p
import bridge as b
import candidate_selection as c

IDS=[f'{i:08d}-1111-4111-8111-111111111111' for i in range(1,5)]
def selection(winner='B'):
    labels=[winner]+[x for x in 'ABCD' if x!=winner]
    return {'winner':winner,'all_have_major_defects':True,'ranking':[{'candidate':x,'score':70-i,'reason':'Defeito em 2.3s; melhor continuidade relativa.'} for i,x in enumerate(labels)]}
class CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'FLOW_WORK_ROOT':str(self.root/'work')});self.env.start()
        Image.new('RGB',(720,1280),'white').save(self.root/'source.png')
        self.folder=p.prepare(self.root/'source.png','x4',downloads=self.root/'out',outputs=4)
        p.mark_submitted(self.folder,1,[])
    def tearDown(self):self.env.stop();self.temp.cleanup()
    def call(self,op,**kwargs):
        _,state=p.read_state(self.folder)
        return c.dispatch({'op':op,'scene':1,**kwargs},state,self.folder,lambda _:None)
    def test_bind_resume_guard_and_failed_slots(self):
        rows=self.call('batch_results',media_ids=IDS[::-1],failed=[])
        self.assertEqual(rows[0]['media_id'],IDS[0]);self.assertEqual(len(rows),4)
        self.assertEqual(self.call('batch_results',media_ids=IDS,failed=[]),rows)
        with self.assertRaises(ValueError):self.call('batch_results',media_ids=IDS[:3],failed=[])
        with self.assertRaises(ValueError):self.call('candidate_chunk',candidate='A',offset=2,data='AA==')
        with self.assertRaises(ValueError):self.call('select_candidate')
    def test_real_media_selected_once_and_integrity(self):
        rows=self.call('batch_results',media_ids=IDS,failed=[])
        for i,row in enumerate(rows):
            source=self.root/f'{i}.mp4'
            p.run_ff(['-f','lavfi','-i',f'color=c={"red blue green yellow".split()[i]}:s=720x1280:r=24:d=8','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',source])
            data=source.read_bytes()
            for offset in range(0,len(data),262144):self.call('candidate_chunk',candidate=row['label'],offset=offset,data=base64.b64encode(data[offset:offset+262144]).decode())
            self.call('candidate_ingest',candidate=row['label'])
        _,state=p.read_state(self.folder);ready=state['scenes'][0]['candidates']
        board=self.root/'sheet.jpg';info=c.sheet(ready[0]['path'],board,'A')
        self.assertEqual(len(info['timestamps']),15);self.assertEqual(info['timestamps'][0],0);self.assertGreater(info['timestamps'][-1],7.8)
        with Image.open(board) as im:self.assertEqual(im.size,(1440,1644))
        with patch.object(c,'evaluate',return_value=selection()) as judge:
            self.call('select_candidate');self.call('select_candidate');self.assertEqual(judge.call_count,1)
        _,state=p.read_state(self.folder)
        self.assertEqual(state['scenes'][0]['media_id'],IDS[1]);self.assertEqual(p.digest(self.folder/'cena_01.mp4'),ready[1]['sha256'])
        self.assertEqual(state['scenes'][0]['selection']['winner'],'B')
        with self.assertRaises(ValueError):self.call('candidate_chunk',candidate='B',offset=0,data='AA==')
    def test_forced_choice_accepts_defective_best_but_never_missing(self):
        rows=[{'label':x,'status':'failed' if x=='D' else 'complete'} for x in 'ABCD']
        c.validate_selection(selection(),rows)
        with self.assertRaises(ValueError):c.validate_selection(selection('D'),rows)
        bad=selection();bad['ranking'][3]['candidate']='B'
        with self.assertRaises(ValueError):c.validate_selection(bad,rows)
    def test_attempt_marker_prevents_unbounded_evaluation_retries(self):
        directory=self.root/'eval';directory.mkdir();(directory/'attempt.json').write_text('{}')
        rows=[{'label':x,'status':'complete','sha256':x,'path':'unused'} for x in 'ABCD']
        with patch.object(c,'evaluator_preflight') as preflight:
            with self.assertRaisesRegex(RuntimeError,'ja iniciada'):c.evaluate(rows,1,directory)
            preflight.assert_not_called()

    def test_x3_terra_and_twenty_unique_frames(self):
        folder=p.prepare(self.root/'source.png','x3',downloads=self.root/'out',outputs=3)
        p.mark_submitted(folder,1,[])
        _,state=p.read_state(folder)
        self.assertEqual(state['evaluation'],{'model':'gpt-5.6-terra','frames':20,'effort':'medium'})
        rows=c.dispatch({'op':'batch_results','scene':1,'media_ids':IDS[:3],'failed':[]},state,folder,lambda _:None)
        self.assertEqual([r['label'] for r in rows],list('ABC'))
        source=self.root/'twenty.mp4'
        p.run_ff(['-f','lavfi','-i','testsrc2=s=720x1280:r=24:d=8','-c:v','libx264','-preset','ultrafast',source])
        info=c.sheet(source,self.root/'twenty.jpg','A',20)
        self.assertEqual(len(set(info['frame_indices'])),20)
        self.assertEqual(len(info['files']),2)
        for page in info['files']:
            with Image.open(page) as im:self.assertEqual(im.size,(1440,1096))
