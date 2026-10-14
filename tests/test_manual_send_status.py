import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import manual_send_status as status

class ManualStatusTests(unittest.TestCase):
    def test_native_ledger_checkpoint_is_found_without_manual_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'flow_pairs.json').write_text(json.dumps({'jobs':{'143_recipe':{'folder':'job','manual_send':True}}}))
            scene={'number':1,'status':'submitted','prompt':'exact prompt','manual_send_ready':{'at':'now','tab_id':17}}
            state={'manual_send':True,'status':'running','project':'project','scenes':[scene]}
            with patch.object(status.pipeline,'read_state',return_value=(Path('job'),state)):
                row=status.checkpoints(root)[0]
                self.assertEqual(row['id'],'143_recipe');self.assertEqual(row['tab_id'],17);self.assertEqual(row['prompt'],'exact prompt')
                scene['manual_send_observed_at']='sent'
                self.assertEqual(status.checkpoints(root),[])

    def test_completed_sources_are_not_sent_again(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'manual_ui_142_hook.json').write_text(json.dumps({'id':'142_hook','pipeline_folder':'job'}))
            with patch.object(status.pipeline,'read_state',return_value=(Path('job'),{'manual_send':True,'status':'complete'})):
                self.assertEqual(status.checkpoints(root),[])
