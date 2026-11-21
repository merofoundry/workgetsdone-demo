"""Guard (H-2): the admin generator must never emit a rule that writes app_user.password, and every service rule set is admin gated."""
import importlib.util, sys, unittest
from pathlib import Path
here = Path(__file__).parent
def load():
    sys.argv = ['x', '/tmp/wgd-plans/guard-admin.json']; sys.path.insert(0, str(here)); import provision_lib; provision_lib.P.OPS.clear()
    spec = importlib.util.spec_from_file_location('provision_admin', here / 'provision-admin.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
def has_password(v):
    if isinstance(v, dict): return 'password' in v or any(has_password(x) for x in v.values())
    if isinstance(v, list): return any(has_password(x) for x in v)
    return False
class AdminGenerator(unittest.TestCase):
    def test_no_password_or_admin_write(self):
        for o in load().P.OPS:
            if o['name'] != 'create_rule': continue
            for a in o['arguments']['body']['actions']:
                if a['type'] in ('update_record', 'create_record'):
                    self.assertFalse(has_password(a.get('data', {})), o['key']); self.assertNotIn('is_admin', a.get('data', {}), o['key'])
    def test_every_service_has_an_admin_gate_with_404(self):
        ops = load().P.OPS; gates = [o for o in ops if o['key'].endswith('.gate') and o['name'] == 'create_rule']
        self.assertEqual(sorted(o['key'] for o in gates), ['rule.users.list.gate', 'rule.users.update.gate'])
        for o in gates:
            req = o['arguments']['body']['actions'][0]; self.assertEqual(req['type'], 'require_query'); self.assertEqual(req['failure_status'], 404)
            self.assertEqual(req['saved_query_id'], '6efa0c06-3d43-49f4-a280-154e66799afd')
    def test_google_link_is_written_only_by_the_oauth_rule(self):
        writes = {o['key']: o['arguments']['body'] for o in load().P.OPS if o['name'] == 'create_rule' and o['key'].startswith('rule.users.update.write')}
        self.assertEqual(sorted(writes), ['rule.users.update.write', 'rule.users.update.write.oauth'])
        data = lambda b: next(a for a in b['actions'] if a['type'] == 'update_record')['data']
        self.assertNotIn('oauth_provider', data(writes['rule.users.update.write'])); self.assertNotIn('oauth_subject', data(writes['rule.users.update.write']))
        self.assertEqual(sorted(k for k in data(writes['rule.users.update.write.oauth']) if k.startswith('oauth')), ['oauth_provider', 'oauth_subject'])
if __name__ == '__main__': unittest.main()
