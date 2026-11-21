"""Shared helpers for the full-build generators. Imports provision-services.py as P."""
import importlib.util, json, sys
from copy import deepcopy
from pathlib import Path
spec = importlib.util.spec_from_file_location('provision', Path(__file__).with_name('provision-services.py'))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P); P.OPS.clear()
NORMALIZE = 'b83e7be5-b091-4739-b3cf-17b2322ff51d'
RESPOND = '387414ee-253f-4568-a084-d81df2c815b3'
ACTOR = '{{actor.id}}'; NOW = '{{time.utc_instant}}'
def n(key): return '{{after.normalized.' + key + '}}'
def _rule(key, name, phase, actions, priority=0, condition=None, settings=None):
    body = {'name': 'byof ' + key, 'trigger': 'webhook_received', 'phase': phase, 'condition': condition or P.guarded(name), 'actions': actions, 'priority': priority, 'run_as': 'actor', 'isActive': True, 'scope': {'service_config_id': P.ref('service.' + name)}}
    if settings: body['settings'] = settings
    P.op('rule.' + key, 'create_rule', body=body)
def write_service(name, description):
    P.op('service.' + name, 'create_service', name=name, service_type='webhook_in', base_url='mero://inbound/' + name, auth_type='none', settings={'public': False}, description=description)
    _rule(name + '.normalize', name, 'post_save', [{'type': 'run_function', 'params': {'function_id': NORMALIZE, 'payload': '{{payload}}', 'name': name}}], priority=-100)
    _rule(name + '.default-response', name, 'response', [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': 503}, {'op': 'replace', 'path': '/body', 'value': {'error': {'message': 'The change could not be saved. Please try again.'}}}]}], priority=-100, condition=P.guarded(name, {'var': 'after.guardsPassed'}, {'!': {'var': 'after.saved'}}))
    _rule(name + '.invalid-response', name, 'response', [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': 422}, {'op': 'replace', 'path': '/body', 'value': '{{after.result}}'}]}], priority=-90, condition=P.guarded(name, {'!': {'var': 'after.valid'}}))
    _rule(name + '.success-response', name, 'response', [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': 200}, {'op': 'replace', 'path': '/body', 'value': {'data': {'ok': True}}}]}], priority=100, condition=P.guarded(name, {'var': 'after.saved'}))
def guard(name, key, ast, params, status=404, priority=-80, condition=None, result_field=None, allow_empty=False, capture=None):
    q = P.query(name.replace('.', '_') + '_' + key + '_guard', ast)
    action = {**P.require(q, params, status)}
    if result_field: action['result_field'] = result_field
    if allow_empty: action['allow_empty'] = True
    actions = [action] + ([P.setfields(capture)] if capture else [])
    _rule(name + '.' + key + '.guard', name, 'post_save', actions, priority=priority, condition=condition or P.guarded(name, {'var': 'after.valid'}))
    return q
def fn(name, key, function_id, params, priority=-50, condition=None):
    _rule(name + '.' + key, name, 'post_save', [{'type': 'run_function', 'params': {'function_id': function_id, 'name': name, **params}}], priority=priority, condition=condition or P.guarded(name, {'var': 'after.valid'}))
def write(name, actions, condition, priority=0):
    _rule(name + '.write', name, 'post_save', [P.setfields({'guardsPassed': True}), *actions, P.setfields({'saved': True})], priority=priority, condition=condition, settings={'on_failure': 'abort'})
def read_dataset(name, key, ast, count=False, priority=-50, condition=None):
    dataset = P.aggregate(ast) if count else deepcopy(ast)
    if not count: dataset['limit'] = 1001
    q = P.query(name.replace('.', '_') + '_' + key + ('_count' if count else '_rows'), dataset)
    _rule(name + '.' + key + '.dataset', name, 'post_save', [{**P.require(q, P.parameters(ast)), 'result_field': key + 'Rows', 'allow_empty': True}], priority=priority, condition=condition or P.guarded(name, {'var': 'after.valid'}))
def _service_id(body):
    scope = body['scope']['service_config_id']
    return scope['$ref'] if isinstance(scope, dict) else scope
def budget_ok(ops, own_post_save=15, own_response=17):
    totals = {}
    for o in ops:
        if o['name'] != 'create_rule': continue
        body = o['arguments']['body']; key = (_service_id(body), body['phase'])
        totals[key] = totals.get(key, 0) + len(body['actions'])
    for (service, phase), count in totals.items():
        limit = own_post_save if phase == 'post_save' else own_response
        assert count <= limit, f'{service} {phase} has {count} actions, limit {limit}'
    return totals
def resolve_refs(value, ids):
    if isinstance(value, list): return [resolve_refs(v, ids) for v in value]
    if isinstance(value, dict):
        if '$ref' in value: return ids[value['$ref']]
        return {k: resolve_refs(v, ids) for k, v in value.items()}
    return value
def emit(path):
    budget_ok(P.OPS)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps({'operations': P.OPS}, indent=2) + '\n')
    kinds = {}
    for o in P.OPS: kinds[o['name']] = kinds.get(o['name'], 0) + 1
    print(f'{len(P.OPS)} operations -> {path} {kinds}')
