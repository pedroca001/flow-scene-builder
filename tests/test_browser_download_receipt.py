import json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
import bridge as b
import flow_scene_builder as p

class BrowserDownloadReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.env=patch.dict(os.environ,{'FLOW_WORK_ROOT':str(self.root/'work'),'FLOW_APP_ROOT':str(self.root/'app')});self.env.start()
        self.app=patch.object(b,'APP',self.root/'app');self.app.start()
        self.queue=patch.object(b,'QUEUE',self.root/'app/queue.json');self.queue.start()
        self.home=patch.object(Path,'home',return_value=self.root);self.home.start()
        (self.root/'Downloads').mkdir()
        Image.new('RGB',(720,1280)).save(self.root/'source.png')
        self.folder=p.prepare(self.root/'source.png','download',downloads=self.root/'out',project='https://flow.google.com/u/2/project/test')
        b.enqueue(self.folder)
        with patch.object(b,'read_settings',return_value={'recaptcha_harvest':True}):
            job=b.dispatch({'op':'claim'})
        self.assertIs(job['recaptcha_harvest'],False)
        b.dispatch({'op':'submitted','folder':str(self.folder),'scene':1,'baseline':[],'failures':[]})
        self.asset='11111111-1111-4111-8111-111111111111'
        b.dispatch({'op':'result','folder':str(self.folder),'scene':1,'media_id':self.asset})
    def tearDown(self):
        self.home.stop();self.queue.stop();self.app.stop();self.env.stop();self.temp.cleanup()
    def call(self,op,**args):
        return b.dispatch({'op':op,'folder':str(self.folder),'scene':1,**args})
    def test_new_stable_download_is_bound_and_different_file_cannot_be_ingested(self):
        prior=self.root/'Downloads/personal.mp4';prior.write_bytes(b'old personal file')
        baseline=self.call('download_snapshot')
        source=self.root/'Downloads/.com.google.Chrome.fixture';source.write_bytes(b'new result')
        meta={'duration':8,'width':720,'height':1280}
        with patch.object(p,'probe',return_value=meta),patch.object(b.time,'sleep'):
            receipt=self.call('await_download',baseline=baseline)
        self.assertEqual(receipt['path'],str(source.resolve()))
        self.assertEqual(receipt['media_id'],self.asset)
        with self.assertRaisesRegex(ValueError,'recibo'):
            self.call('ingest_download',path=str(prior),media_id=self.asset)
        with self.assertRaisesRegex(ValueError,'recibo'):
            self.call('ingest_download',path=str(source),media_id='22222222-2222-4222-8222-222222222222')
        self.assertTrue(prior.exists());self.assertTrue(source.exists())
    def test_programmatic_file_is_scoped_bound_and_hashed_before_ingestion(self):
        folder=self.root/'Downloads/flow_scene_builder_downloads';folder.mkdir()
        source=folder/(self.asset+'_123.mp4');source.write_bytes(b'programmatic bytes')
        with patch.object(p,'ingest',return_value={'number':1,'status':'complete','metadata':{'duration':8}}) as ingest:
            result=self.call('ingest_programmatic_download',path=str(source),media_id=self.asset,download_id=7,method='chrome.downloads.saveAsFalse')
        self.assertEqual(result['status'],'complete');ingest.assert_called_once()
        receipt=p.read_state(self.folder)[1]['scenes'][0]['browser_download_receipt']
        self.assertEqual(receipt['sha256'],p.digest(source));self.assertEqual(receipt['download_id'],7)
        with self.assertRaisesRegex(ValueError,'pasta temporaria'):
            self.call('ingest_programmatic_download',path=str(self.root/'Downloads/personal.mp4'),media_id=self.asset,download_id=7,method='chrome.downloads.saveAsFalse')
    def test_two_new_valid_files_are_ambiguous_and_preserved(self):
        baseline=self.call('download_snapshot')
        for name in ['one.mp4','two.mp4']:(self.root/'Downloads'/name).write_bytes(b'new')
        with patch.object(p,'probe',return_value={'duration':8,'width':720,'height':1280}),patch.object(b.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'Mais de um MP4'):self.call('await_download',baseline=baseline)
        self.assertEqual(len(list((self.root/'Downloads').iterdir())),2)
    def test_cadence_starts_after_observed_click_and_ack_is_idempotent(self):
        _,state=p.read_state(self.folder);state['min_submission_interval_seconds']=120;p.write_state(self.folder,state)
        with patch.object(b.time,'time',return_value=1000):self.assertTrue(self.call('submission_gate')['ready'])
        with patch.object(b.time,'time',return_value=1015):first=self.call('submission_observed')
        with patch.object(b.time,'time',return_value=1030):self.assertEqual(self.call('submission_observed'),first)
        with patch.object(b.time,'time',return_value=1134):self.assertFalse(self.call('submission_gate')['ready'])
        with patch.object(b.time,'time',return_value=1135):self.assertTrue(self.call('submission_gate')['ready'])
    def test_observed_retry_requires_a_reserved_audio_attempt(self):
        with self.assertRaisesRegex(ValueError,'nao reservada'):self.call('submission_observed',kind='audio_retry')
