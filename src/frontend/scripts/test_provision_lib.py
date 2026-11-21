import importlib.util, json, unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('lib', Path(__file__).with_name('provision_lib.py'))
L = importlib.util.module_from_spec(spec); spec.loader.exec_module(L)

class LibTests(unittest.TestCase):
    def setUp(self): L.P.OPS.clear()
    def test_write_service_has_four_fixed_rules(self):
        L.write_service('widgets.create', 'test')
        names = [o['key'] for o in L.P.OPS]
        self.assertEqual(names, ['service.widgets.create', 'rule.widgets.create.normalize', 'rule.widgets.create.default-response', 'rule.widgets.create.invalid-response', 'rule.widgets.create.success-response'])
        self.assertTrue(all(o['arguments']['body']['isActive'] is True for o in L.P.OPS if o['name'] == 'create_rule'))
    def test_guard_binds_params_and_status(self):
        L.write_service('widgets.update', 'test')
        L.guard('widgets.update', 'version', L.P.data_query('task', [L.P.condition('task', 'key', '=', ':id')]), {'id': L.n('id')}, status=409)
        rule = next(o for o in L.P.OPS if o['key'] == 'rule.widgets.update.version.guard')
        action = rule['arguments']['body']['actions'][0]
        self.assertEqual(action['type'], 'require_query'); self.assertEqual(action['failure_status'], 409); self.assertEqual(action['params']['template'], {'id': '{{after.normalized.id}}'})
    def test_budget_rejects_sixteen_post_save_actions(self):
        L.write_service('widgets.big', 'test')
        for i in range(15): L.guard('widgets.big', f'g{i}', L.P.data_query('task'), {}, priority=-70 + i)
        with self.assertRaises(AssertionError): L.budget_ok(L.P.OPS)
    def test_budget_accepts_fifteen(self):
        L.write_service('widgets.ok', 'test')
        for i in range(14): L.guard('widgets.ok', f'g{i}', L.P.data_query('task'), {}, priority=-70 + i)
        L.budget_ok(L.P.OPS)
    def test_resolve_refs(self):
        ops = [{'key': 'a', 'name': 'create_rule', 'arguments': {'body': {'scope': {'service_config_id': {'$ref': 'service.x', 'path': 'id'}}}}}]
        out = L.resolve_refs(ops, {'service.x': 'S1'})
        self.assertEqual(out[0]['arguments']['body']['scope']['service_config_id'], 'S1')
        with self.assertRaises(KeyError): L.resolve_refs(ops, {})
    def test_budget_counts_literal_service_id_scope(self):
        def rule(actions): return {'key': 'r', 'name': 'create_rule', 'arguments': {'body': {'phase': 'post_save', 'actions': actions, 'scope': {'service_config_id': 'SID-1'}}}}
        totals = L.budget_ok([rule([1] * 15)])
        self.assertEqual(totals, {('SID-1', 'post_save'): 15})
        with self.assertRaises(AssertionError): L.budget_ok([rule([1] * 10), rule([1] * 6)])
if __name__ == '__main__': unittest.main()
