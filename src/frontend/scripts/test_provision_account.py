"""Guard (H-1): the account generator must never emit an active rule that writes a password. Run: python3 scripts/test_provision_account.py"""
import importlib.util, unittest
from pathlib import Path
here = Path(__file__).parent
spec = importlib.util.spec_from_file_location('provision_account', here / 'provision-account.py')
def load():
    import sys; sys.argv = ['x', '/tmp/wgd-plans/guard-account.json']
    sys.path.insert(0, str(here)); import provision_lib; provision_lib.P.OPS.clear()
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
def has_password(value):
    if isinstance(value, dict): return 'password' in value or any(has_password(v) for v in value.values())
    if isinstance(value, list): return any(has_password(v) for v in value)
    return False
class AccountGenerator(unittest.TestCase):
    def test_no_active_rule_writes_a_password(self):
        ops = load().P.OPS; rules = [o['arguments']['body'] for o in ops if o['name'] == 'create_rule']
        self.assertTrue(rules)
        for body in rules:
            if not body.get('isActive', True): continue
            for action in body['actions']:
                if action['type'] in ('update_record', 'create_record', 'upsert_record', 'update_field'):
                    self.assertFalse(has_password(action.get('data', {})) or has_password(action.get('fields', {})), body['name'])
    def test_no_session_revocation_or_sessions_listing(self):
        ops = load().P.OPS
        names = [o['arguments']['body']['name'] for o in ops if o['name'] == 'create_rule']
        self.assertFalse([n for n in names if '.slot.' in n or n.endswith('.sessions') or n.endswith('.password')])
        for o in ops:
            if o['name'] == 'create_rule': self.assertFalse([a for a in o['arguments']['body']['actions'] if a['type'] == 'list_records'])
    def test_change_password_stub_answers_503(self):
        rules = [o['arguments']['body'] for o in load().P.OPS if o['name'] == 'create_rule' and o['arguments']['body']['name'].endswith('changePassword.withdrawn')]
        self.assertEqual(len(rules), 1); self.assertIn(503, [p['value'] for p in rules[0]['actions'][0]['patches']])
if __name__ == '__main__': unittest.main()
