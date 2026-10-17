import json
import os
import tempfile
import unittest
from pathlib import Path
from PIL import Image
import flow_scene_builder as f

class PipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix='flow_pipeline_test_');cls.root=Path(cls.tmp.name)
        cls.old_work=os.environ.get('FLOW_WORK_ROOT');os.environ['FLOW_WORK_ROOT']=str(cls.root/'technical')
        cls.image=cls.root/'original.png';Image.new('RGB',(720,1280),'white').save(cls.image)
        cls.clips=[]
        for i,color in enumerate(['red','blue','green','yellow']):
            p=cls.root/f'fixture_{i}.mp4';args=['-f','lavfi','-i',f'color=c={color}:s=720x1280:r=24:d=8']
            if i%2==0:args+=['-f','lavfi','-i',f'sine=frequency={440+i*100}:duration=8']
            args+=['-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p']
            if i%2==0:args+=['-c:a','aac','-shortest']
            f.run_ff(args+[p]);cls.clips.append(p)
    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()
        if cls.old_work is None:os.environ.pop('FLOW_WORK_ROOT',None)
        else:os.environ['FLOW_WORK_ROOT']=cls.old_work
    def make(self):return f.prepare(self.image,'teste_receita',downloads=self.root/'downloads')
    def test_complete_four_scene_pipeline(self):
        folder=self.make()
        self.assertEqual(f.digest(f.work_dir(folder)/'cena_01_inicio.png'),f.digest(f.work_dir(folder)/'cena_02_inicio.png'))
        for i,p in enumerate(self.clips,1):
            n=f.next_scene(folder);self.assertEqual(n['number'],i);self.assertTrue(n['ready_to_submit'])
            f.mark_submitted(folder,i,[f'previous_{i}']);self.assertFalse(f.next_scene(folder)['ready_to_submit'])
            with self.assertRaises(ValueError):f.mark_submitted(folder,i)
            f.ingest(folder,i,p,media_id=f'fixture_{i}')
        self.assertEqual(f.digest(f.work_dir(folder)/'cena_03_inicio.png'),f.digest(f.work_dir(folder)/'cena_02_ultimo_frame.png'))
        self.assertEqual(f.digest(f.work_dir(folder)/'cena_04_inicio.png'),f.digest(f.work_dir(folder)/'cena_03_ultimo_frame.png'))
        result=f.render(folder);self.assertTrue(result['ok']);self.assertAlmostEqual(result['metadata']['duration'],32,delta=.6)
        self.assertTrue(result['metadata']['audio']);self.assertEqual(result['metadata']['width'],720)
        self.assertEqual(result['metadata']['height'],1280)
        self.assertEqual({p.name for p in folder.iterdir()}, {'imagem_original.png','cena_01.mp4','cena_02.mp4','cena_03.mp4','cena_04.mp4','video_completo.mp4'})
        finalframe=self.root/'final_frame.png';f.last_frame(folder/'video_completo.mp4',finalframe)
        r,g,b=Image.open(finalframe).getpixel((100,100));self.assertGreater(r,200);self.assertGreater(g,200);self.assertLess(b,30)
        f.ingest(folder,4,self.clips[3],media_id='fixture_4') # idempotent import
        print('NATIVE_PIPELINE_OK: 4 cenas, 32s, 720x1280, audio, encadeamento e ordem validados')
    def test_reject_duplicate_and_out_of_order(self):
        folder=self.make()
        with self.assertRaises(ValueError):f.ingest(folder,2,self.clips[1])
        f.ingest(folder,1,self.clips[0],media_id='first')
        with self.assertRaises(ValueError):f.ingest(folder,2,self.clips[0],media_id='second')
        with self.assertRaises(ValueError):f.ingest(folder,2,self.clips[1],media_id='first')
        with self.assertRaises(ValueError):f.render(folder)
    def test_new_flow_title_becomes_final_mp4_name(self):
        folder=self.make()
        _,state=f.read_state(folder)
        title='2026-09-22 19:00:00.123'
        state['project_creation']={'status':'ready','title':title};f.write_state(folder,state)
        for i,p in enumerate(self.clips,1):
            f.mark_submitted(folder,i,[f'previous_{i}']);f.ingest(folder,i,p,media_id=f'titled_{i}')
        result=f.render(folder)
        expected_name=(title.replace(':','-') if os.name=='nt' else title)+'.mp4'
        self.assertEqual(Path(result['final']).name,expected_name)
        self.assertTrue((folder/expected_name).is_file())
    def test_signed_urls_never_persist(self):
        folder=self.make()
        with self.assertRaises(ValueError):f.mark_submitted(folder,1,['https://example.com/video?Signature=secret'])
        self.assertNotIn('Signature',(f.work_dir(folder)/'execucao.json').read_text(encoding='utf-8'))
    def test_separate_folders_and_preset(self):
        self.assertNotEqual(self.make(),self.make())
        with self.assertRaises(ValueError):f.validate_preset({'model':'lite','prompts':['a','b']})
    def test_explicit_continuous_mode_and_final_only_editor_export(self):
        folder=f.prepare(self.image,'continuous',downloads=self.root/'downloads',mode='frames_continuous',account_email='owner@example.com')
        self.assertFalse((f.work_dir(folder)/'cena_02_inicio.png').exists())
        for i,p in enumerate(self.clips,1):
            self.assertTrue(f.next_scene(folder)['ready_to_submit']);f.mark_submitted(folder,i);f.ingest(folder,i,p,media_id=f'continuous_{i}')
        _,state=f.read_state(folder)
        for i in range(1,4):
            self.assertEqual(state['scenes'][i]['predecessor']['sha256'],state['scenes'][i-1]['sha256'])
            self.assertEqual(f.digest(state['scenes'][i]['start_image']),f.digest(state['scenes'][i-1]['last_frame']))
        f.render(folder)
        result=f.export_editor(folder,self.root/'editor')
        self.assertEqual(result['editor_profile'],'conservative');self.assertTrue(result['review_required'])
        self.assertEqual(len(list((self.root/'editor').iterdir())),1)
        f.export_editor(folder,self.root/'editor')
        Path(result['final']).write_text('changed')
        with self.assertRaises(ValueError):f.export_editor(folder,self.root/'editor')
        audio=self.root/'too_long.wav';f.run_ff(['-f','lavfi','-i','sine=duration=40',audio])
        with self.assertRaisesRegex(ValueError,'maior'):f.export_editor(folder,self.root/'editor_other',audio)
if __name__=='__main__':unittest.main()
