"""Guard (Task 21): the Google configure plan puts credentials only in the oauth2 credential service, names the callback service, and is written 0600."""
import importlib.util, json, os, stat, sys, tempfile, unittest
from pathlib import Path
here = Path(__file__).parent
def load():
    spec = importlib.util.spec_from_file_location('provision_google', here / 'provision-google.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
class GooglePlan(unittest.TestCase):
    def test_plan(self):
        m = load(); d = Path(tempfile.mkdtemp()); env = d / '.env-google-stage'; env.write_text("GOOGLE_CLIENT_ID=cid-test\nGOOGLE_CLIENT_SECRET='sec-test'\n"); env.chmod(0o600); m.ENV = env
        for extra, name in (([], 'create_service'), (['--service-id', 'abc'], 'update_service')):
            out = d / 'plan.json'; sys.argv = ['x', *extra, str(out)]; m.main()
            self.assertEqual(stat.S_IMODE(out.stat().st_mode), 0o600)
            plan = json.loads(out.read_text()); op = plan['operations'][0]; self.assertEqual(op['name'], name)
            self.assertEqual(op['arguments']['auth_config'], {'client_id': 'cid-test', 'client_secret': 'sec-test'})
            self.assertTrue(plan['redirectUri'].endswith('/api/v1/services/0e1bae77-8f8e-4e4e-ab86-d64505d581fc/inbound'))
            if name == 'create_service': self.assertEqual(op['arguments']['settings'], {'oauth_provider': 'google', 'callback_service_id': m.CALLBACK}); self.assertEqual(op['arguments']['auth_type'], 'oauth2')
    def test_refuses_open_permissions_and_missing_values(self):
        m = load(); d = Path(tempfile.mkdtemp()); env = d / '.env-google-stage'; env.write_text('GOOGLE_CLIENT_ID=a\n'); env.chmod(0o644); m.ENV = env; sys.argv = ['x', str(d / 'p.json')]
        with self.assertRaises(SystemExit): m.main()
        env.chmod(0o600)
        with self.assertRaises(SystemExit): m.main()
if __name__ == '__main__': unittest.main()
