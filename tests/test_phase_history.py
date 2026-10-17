import unittest
from pathlib import Path
from unittest.mock import patch
import bridge as b
import flow_scene_builder as p

class PhaseHistoryTests(unittest.TestCase):
    def test_failed_probe_cannot_remain_eligible_for_immediate_reclaim(self):
        folder=Path('/mock/job');state={'scenes':[], 'cooldown_recovery':{'status':'probing','due_at':1}, 'retry_authorizations':[{'preserved':True}]}
        with patch.object(p,'read_state',return_value=(folder,state)), patch.object(p,'write_state'), patch.object(b,'update'), patch.object(b,'queue',return_value=[{'folder':str(folder),'state':'running'}]):
            b.dispatch({'op':'pause','folder':str(folder),'error':'Identificacao indisponivel'})
        self.assertEqual(state['cooldown_recovery']['status'],'failed')
        self.assertEqual(len(state['cooldown_probe_failures']),1)
        self.assertEqual(state['retry_authorizations'],[{'preserved':True}])

    def test_phases_have_durable_bounded_timings_and_ignore_duplicates(self):
        folder=Path('/mock/job');state={'scenes':[],'phase_history':[{'phase':str(i),'at':i} for i in range(500)]}
        with patch.object(p,'read_state',return_value=(folder,state)), patch.object(p,'write_state') as write, patch.object(b,'update'), patch.object(b,'queue',return_value=[{'folder':str(folder),'state':'running'}]):
            for phase in ['download','download','transfer']:
                b.dispatch({'op':'progress','folder':str(folder),'phase':phase})
        self.assertEqual(write.call_count,2)
        self.assertEqual(len(state['phase_history']),500)
        self.assertEqual([x['phase'] for x in state['phase_history'][-2:]],['download','transfer'])
        self.assertIsInstance(state['phase_history'][-1]['at'],float)
