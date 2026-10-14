import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import run_pair_batch as controller


class PairAdmissionTests(unittest.TestCase):
    def test_manual_receipt_registers_same_project_and_collects_completed_result(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);manifest=self.fixture(root);folder=root/'manual_hook'
            doc=json.loads(manifest.read_text());doc['operator_pause']=True;manifest.write_text(json.dumps(doc))
            project='https://flow.google.com/u/1/project/manual'
            (root/'manual_ui_002_hook.json').write_text(json.dumps(dict(id='002_hook',pipeline_folder=str(folder),project_url=project)))
            with patch.object(controller.bridge,'status',return_value=[dict(folder=str(folder),state='complete')]), \
                 patch.object(controller.bridge,'parallel_limit',return_value=5), \
                 patch.object(controller.pipeline,'read_state',return_value=(folder,dict(project=project,original_sha256='source_hash',manual_send=True))), \
                 patch.object(controller.pipeline,'verify',return_value={'final':'existing.mp4'}), \
                 patch.object(controller.pipeline,'digest',return_value='final_hash'),patch.object(controller.bridge,'start') as start:
                controller.step(manifest)
                saved=json.loads((root/'flow_pairs.json').read_text())['jobs']['002_hook']
                self.assertEqual(saved['folder'],str(folder));self.assertEqual(saved['final'],'existing.mp4');start.assert_not_called()

    def test_manual_receipt_rejects_wrong_project_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);manifest=self.fixture(root);folder=root/'manual_hook'
            (root/'manual_ui_002_hook.json').write_text(json.dumps(dict(id='002_hook',pipeline_folder=str(folder),project_url='expected')))
            with patch.object(controller.pipeline,'read_state',return_value=(folder,dict(project='other',original_sha256='source_hash'))):
                with self.assertRaisesRegex(ValueError,'identity mismatch'):controller.step(manifest)

    def fixture(self, root, jobs=None):
        manifest=dict(batch_name='test_pairs',account_email='authorized@example.com',flow_home='https://flow.google.com/u/1/',
                      pairs=[dict(id='001',audio='voice.mp3',style=0),dict(id='002',audio='voice.mp3',style=1)])
        (root/'manifest.json').write_text(json.dumps(manifest))
        (root/'flow_pairs.json').write_text(json.dumps(dict(jobs=jobs or {})))
        image=root/'source.png';image.write_bytes(b'unique native image receipt fixture')
        (root/'image_receipts').mkdir()
        for key in ('002_recipe','002_hook'):
            (root/'image_receipts'/(key+'.json')).write_text(json.dumps(dict(id=key,pair_id='002',kind=key.split('_')[1],path=str(image),sha256='source_hash')))
        return root/'manifest.json'

    def test_wrong_account_blocks_new_jobs_but_keeps_receipt_collection(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=str(root/'original_job')
            manifest=self.fixture(root,{'001_hook':dict(folder=folder,kind='hook',recovery_ready=True)})
            with patch.object(controller.bridge,'status',return_value=[dict(folder=folder,state='paused',error='Conta visivel difere do email autorizado.')]), \
                 patch.object(controller.bridge,'parallel_limit',return_value=20), \
                 patch.object(controller.bridge,'start') as start, patch.object(controller.bridge,'enqueue') as enqueue:
                result=controller.step(manifest)
                self.assertTrue(result['account_mismatch'])
                self.assertTrue(result['account_hold'])
                start.assert_not_called();enqueue.assert_not_called()
                self.assertTrue((root/'ready_edits.json').exists())

    def test_operator_pause_survives_maintenance_resume_and_still_collects_completed_pairs(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);hook=str(root/'hook');recipe=str(root/'recipe')
            manifest=self.fixture(root,{'001_hook':dict(folder=hook,kind='hook'),'001_recipe':dict(folder=recipe,kind='recipe')})
            doc=json.loads(manifest.read_text());doc.update(operator_pause=True,admission_paused=False);manifest.write_text(json.dumps(doc))
            rows=[dict(folder=f,state='complete') for f in (hook,recipe)]
            with patch.object(controller.bridge,'status',return_value=rows),patch.object(controller.bridge,'parallel_limit',return_value=20), \
                 patch.object(controller.pipeline,'verify',return_value={'final':'existing.mp4'}),patch.object(controller.pipeline,'digest',return_value='sha'), \
                 patch.object(controller.bridge,'start') as start,patch.object(controller.bridge,'enqueue') as enqueue:
                result=controller.step(manifest)
                self.assertTrue(result['admission_paused']);self.assertFalse(result['account_hold'])
                self.assertEqual(result['pairs_ready'],1);start.assert_not_called();enqueue.assert_not_called()

    def test_global_twenty_slot_limit_counts_other_work(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);manifest=self.fixture(root)
            others=[dict(folder='other_'+str(i),state='running') for i in range(19)]
            with patch.object(controller.bridge,'status',return_value=others), \
                 patch.object(controller.bridge,'parallel_limit',return_value=30), \
                 patch.object(controller.pipeline,'digest',return_value='source_hash'), \
                 patch.object(controller.bridge,'start',return_value={'folder':str(root/'only_admitted')}) as start, \
                 patch.object(controller.bridge,'authorize_retries'),patch.object(controller.bridge,'activate'):
                result=controller.step(manifest)
                self.assertEqual(result['active'],20)
                self.assertEqual(start.call_count,1)
                self.assertEqual(result['admitted'],['002_recipe'])

    def test_account_rebind_resumes_same_job_once_without_start(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=str(root/'original_job')
            manifest=self.fixture(root,{'001_hook':dict(folder=folder,kind='hook',recovery_ready=True)})
            doc=json.loads(manifest.read_text());doc['pairs']=doc['pairs'][:1];manifest.write_text(json.dumps(doc))
            row=dict(folder=folder,state='paused',error='')
            with patch.object(controller.bridge,'status',return_value=[row]), \
                 patch.object(controller.bridge,'parallel_limit',return_value=20), \
                 patch.object(controller.bridge,'start') as start,patch.object(controller.bridge,'enqueue') as enqueue:
                self.assertEqual(controller.step(manifest)['recovered'],['001_hook'])
                self.assertEqual(controller.step(manifest)['recovered'],[])
                enqueue.assert_called_once_with(folder)
                start.assert_not_called()

    def test_preparation_timeout_preserves_existing_project_and_stops_at_two_recoveries(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);folder=str(root/'original_job')
            manifest=self.fixture(root,{'001_recipe':dict(folder=folder,kind='recipe')})
            doc=json.loads(manifest.read_text());doc['pairs']=doc['pairs'][:1];manifest.write_text(json.dumps(doc))
            row=dict(folder=folder,state='paused',error='Tempo esgotado: abrir selecao do frame.')
            state=dict(project='https://flow.google.com/u/1/project/existing',project_creation=dict(status='ready'),scenes=[dict(status='ready')])
            with patch.object(controller.bridge,'status',return_value=[row]),patch.object(controller.bridge,'parallel_limit',return_value=20), \
                 patch.object(controller.pipeline,'read_state',return_value=(Path(folder),state)), \
                 patch.object(controller.bridge,'start') as start,patch.object(controller.bridge,'enqueue') as enqueue:
                self.assertEqual(controller.step(manifest)['recovered'],['001_recipe'])
                self.assertEqual(controller.step(manifest)['recovered'],['001_recipe'])
                self.assertEqual(controller.step(manifest)['recovered'],[])
                self.assertEqual(enqueue.call_count,2);start.assert_not_called()
                self.assertEqual(state['scenes'][0]['status'],'ready')

    def test_generic_timeout_never_resets_submitted_or_creating(self):
        for scene_status,creation_status in [('submitted','ready'),('ready','creating'),('ready','ready')]:
            with self.subTest(scene_status=scene_status,creation_status=creation_status),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);folder=str(root/'original_job')
                manifest=self.fixture(root,{'001_recipe':dict(folder=folder,kind='recipe')})
                doc=json.loads(manifest.read_text());doc['pairs']=doc['pairs'][:1];manifest.write_text(json.dumps(doc))
                row=dict(folder=folder,state='paused',error='Tempo esgotado: resposta da interface.')
                state=dict(project='https://flow.google.com/u/1/project/existing',project_creation=dict(status=creation_status),scenes=[dict(status=scene_status)])
                with patch.object(controller.bridge,'status',return_value=[row]),patch.object(controller.bridge,'parallel_limit',return_value=20), \
                     patch.object(controller.pipeline,'read_state',return_value=(Path(folder),state)), \
                     patch.object(controller.bridge,'start') as start,patch.object(controller.bridge,'enqueue') as enqueue:
                    self.assertEqual(controller.step(manifest)['recovered'],[])
                    enqueue.assert_not_called();start.assert_not_called()
                    self.assertEqual(state['scenes'][0]['status'],scene_status)

    def test_download_timeout_recovers_only_a_bound_result_with_authorized_receipt(self):
        valid_receipt=dict(email='authorized@example.com',home='https://flow.google.com/u/1/',model_key='lower',credits=0,outputs=1)
        for valid, changes in [(True, {}), (False, {'result_asset_id':None}),
                               (False, {'status':'ready'}),
                               (False, {'submission_receipt':dict(valid_receipt,email='other@example.com')})]:
            with self.subTest(changes=changes),tempfile.TemporaryDirectory() as temp:
                root=Path(temp);folder=str(root/'original_job')
                manifest=self.fixture(root,{'001_recipe':dict(folder=folder,kind='recipe')})
                doc=json.loads(manifest.read_text());doc['pairs']=doc['pairs'][:1];manifest.write_text(json.dumps(doc))
                scene=dict(status='submitted',result_asset_id='b52d3c27-089f-4274-bef3-04b46ef838a2',submission_receipt=valid_receipt)
                scene.update(changes)
                state=dict(project='https://flow.google.com/u/1/project/existing',project_creation=dict(status='ready'),scenes=[scene])
                row=dict(folder=folder,state='paused',error='Tempo esgotado: arquivo de download original do Flow.')
                with patch.object(controller.bridge,'status',return_value=[row]),patch.object(controller.bridge,'parallel_limit',return_value=20), \
                     patch.object(controller.pipeline,'read_state',return_value=(Path(folder),state)), \
                     patch.object(controller.bridge,'start') as start,patch.object(controller.bridge,'enqueue') as enqueue:
                    self.assertEqual(controller.step(manifest)['recovered'],['001_recipe'] if valid else [])
                    self.assertEqual(enqueue.call_count,int(valid));start.assert_not_called()
                    self.assertEqual(scene['status'],changes.get('status','submitted'))
                    if valid:
                        self.assertEqual(controller.step(manifest)['recovered'],['001_recipe'])
                        self.assertEqual(controller.step(manifest)['recovered'],[])
                        self.assertEqual(enqueue.call_count,2)


if __name__=='__main__':
    unittest.main()
