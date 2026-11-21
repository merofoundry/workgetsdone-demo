"""Milestone D, Task 11: grants.list / grants.grant / grants.revoke, the share permission on reads, and the projects denied bodies."""
import json, sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
LIVE = json.loads((P.ROOT / 'services/sharing-queries.json').read_text())
RESPOND_RULES = json.loads((P.ROOT / 'services/respond-rules-live-2026-10-11.json').read_text())
SERVICES = json.loads((P.ROOT / 'public/services.json').read_text())['services']
SHARE_ACTION = 'b34a9c7c-0a9b-4409-b9f7-cf9230db092a'
DENIED = {'error': {'message': 'This record could not be found.'}}
LIST_KINDS = {'company': 'companies', 'contact': 'contacts', 'project': 'projects', 'task': 'tasks', 'call': 'calls', 'note': 'notes', 'note_file': 'note_files'}
GRANT_KINDS = {**LIST_KINDS, 'contact_company': 'contact_companies'}
kind_is = lambda kind: {'==': [{'var': 'after.normalized.objectKind'}, kind]}
P.op('function.normalize.D', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-D')
P.op('function.respond.D', 'update_function', function_id=L.RESPOND, source=(P.ROOT / 'services/respond.ts').read_text(), idempotency_key='wgd-full-build-respond-D')
def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
# ---- grants.list
name = 'grants.list'
P.op('service.' + name, 'create_service', name=name, service_type='webhook_in', base_url='mero://inbound/' + name, auth_type='none', settings={'public': False}, description='WorkGetsDone BYOF: who has access to an object (requires SHARE on it).')
L._rule(name + '.normalize', name, 'post_save', [{'type': 'run_function', 'params': {'function_id': L.NORMALIZE, 'payload': '{{payload}}', 'name': name}}], priority=-100)
for i, (kind, plural) in enumerate(LIST_KINDS.items()):
    ast = deepcopy(LIVE['grants_for_' + plural]['ast'])
    rules = ast['where']['rules']
    kept = [r for r in rules if not (r.get('field', {}).get('modelAlias') == 'g' and r['field']['fieldName'] == 'source' and r.get('value') == 'creator')]
    assert len(kept) == len(rules) - 1, kind
    ast['where']['rules'] = kept
    assert any(r.get('field', {}).get('modelAlias') == 'dp' and r['field']['fieldName'] == 'can_share' for r in kept), kind  # SHARE predicate kept
    # The live grants_for_* predicate checks the actor's direct grant (dp) without its revocation tombstone, so a revoked
    # manager would still pass; add the same rv_dp tombstone join the *_shareable queries use (fix.query.grants_list_<kind>.rv-dp).
    rv_g = next(j for j in ast['joins'] if j['alias'] == 'rv_g'); rv_dp = deepcopy(rv_g); rv_dp['alias'] = 'rv_dp'
    for term in rv_dp['onPredicate']['terms']:
        for side in ('left', 'right'):
            if term[side]['modelAlias'] == 'rv_g': term[side]['modelAlias'] = 'rv_dp'
            elif term[side]['modelAlias'] == 'g': term[side]['modelAlias'] = 'dp'
    ast['joins'].append(rv_dp)
    P.add_where(ast, P.condition('rv_dp', 'user_id', 'is_null'))
    P.add_where(ast, P.condition(ast['fromAlias'], 'key', '=', ':objectId')); ast['distinct'] = True; ast['limit'] = 1001
    q = P.query('grants_list_' + kind + '_rows', ast)
    L._rule(name + '.' + kind + '.dataset', name, 'post_save', [{**P.require(q, {'objectId': L.n('objectId')}), 'result_field': 'grantsRows', 'allow_empty': True}], priority=-90 + i, condition=P.guarded(name, {'var': 'after.valid'}, kind_is(kind)))
users = deepcopy(LIVE['app_users_active']['ast']); users['limit'] = 1001
q = P.query('grants_list_users_rows', users)
L._rule(name + '.users.dataset', name, 'post_save', [{**P.require(q, {}), 'result_field': 'usersRows', 'allow_empty': True}], priority=-80, condition=P.guarded(name, {'var': 'after.valid'}))
expected = [{'key': 'grants', 'count': False}, {'key': 'users', 'count': False}]
L._rule(name + '.respond', name, 'response', [*patch(503, {'error': {'message': 'This information could not be loaded. Please try again.'}}), {'type': 'run_function', 'params': {'function_id': L.RESPOND, 'name': name, 'expected': expected}}, {'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': '{{after.resultStatus}}'}, {'op': 'replace', 'path': '/body', 'value': '{{after.result}}'}]}], condition=P.guarded(name))
# ---- grants.grant / grants.revoke
def share_write(name, description, data):
    L.write_service(name, description)
    for kind in GRANT_KINDS:
        L._rule(name + '.guard.' + kind, name, 'post_save', [P.require(LIVE['share_check_' + kind]['id'], {'actor': L.ACTOR, 'target': L.n('objectId')}, 404)], priority=-80, condition=P.guarded(name, {'var': 'after.valid'}, kind_is(kind)))
    L.write(name, [{'type': 'create_record', 'target_model_id': SHARE_ACTION, 'data': data, 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}))
    L._rule(name + '.denied', name, 'response', patch(404, DENIED), priority=10, condition=P.guarded(name, {'var': 'after.valid'}, {'!': {'var': 'after.guardsPassed'}}))
base = {'target_kind': L.n('objectKind'), 'target_key': L.n('objectId'), 'subject_user_key': L.n('userId')}
share_write('grants.grant', 'BYOF: grant a colleague viewer/editor/manager access (requires SHARE); the share_action intake rules expand and write it.', {**base, 'action': 'grant', 'level': L.n('level'), 'share_scope': L.n('scope'), 'revoked_source': None,
    # the share_action pre_save expand rule does not run for service-created rows, so normalize carries the expansion
    'perm_bits': L.n('share.permBits'), 'can_write': L.n('share.canWrite'), 'can_delete': L.n('share.canDelete'), 'can_share': L.n('share.canShare'),
    'access_label': L.n('share.accessLabel'), 'grant_source': L.n('share.grantSource'), 'write_target_key': L.n('share.writeTargetKey')})
share_write('grants.revoke', 'BYOF: revoke one grant by its source (requires SHARE); the creator grant is refused in normalize.', {**base, 'action': 'revoke', 'level': None, 'share_scope': None, 'revoked_source': L.n('source')})
# ---- share permission on reads
def shareable(kind):
    ast = deepcopy(P.BASE[kind + '_shareable']); P.add_where(ast, P.condition(kind, 'key', '=', ':id')); ast['limit'] = 1; return ast
EXISTING = {}
for plural, kind, prio in [('projects', 'project', -78), ('tasks', 'task', -50), ('calls', 'call', -50), ('notes', 'note', -50)]:
    svc = plural + '.read'; EXISTING[svc] = SERVICES[svc]
    L.read_dataset(svc, kind + 'Shareable', shareable(kind), count=True, priority=prio)
    live = RESPOND_RULES[svc]; body = {k: v for k, v in live.items() if k != 'id'}
    body = deepcopy(body); exp = body['actions'][1]['params']['expected']
    if not any(e['key'] == kind + 'Shareable' for e in exp): exp.append({'key': kind + 'Shareable', 'count': True})
    if not body.get('settings'): body.pop('settings', None)
    P.op('update.' + svc + '.respond', 'update_rule', rule_id=live['id'], body=body)
for svc in ['projects.read', 'projects.timeline']:
    EXISTING[svc] = SERVICES[svc]
    L._rule(svc + '.denied', svc, 'response', patch(404, DENIED), priority=10, condition=P.guarded(svc, {'var': 'after.valid'}, {'!': {'var': 'after.gatePassed'}}))
def pin(v):
    if isinstance(v, list): return [pin(x) for x in v]
    if isinstance(v, dict):
        if v.get('$ref', '')[:8] == 'service.' and v['$ref'][8:] in EXISTING: return EXISTING[v['$ref'][8:]]
        return {k: pin(x) for k, x in v.items()}
    return v
for o in P.OPS: o['arguments'] = pin(o['arguments'])
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/D.json')
