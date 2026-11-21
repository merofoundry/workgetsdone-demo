"""Milestone F, Task 15: notes.convertToTask service chain, the note query selects for converted_task, and the (now inactive) link rule.

python3 provision-convert.py [out.json]           full desired state (service, functions, queries, rules)
python3 provision-convert.py --fix1 [out.json]    delta that turns the first release into the fix-round-1 design (updates by live rule id)

Fix round 1 design: the chain is idempotent and does the archive/link itself. datasets: note, parentTask, parentCall, existingTask;
the write is skipped when an earlier attempt already created the task (existingTask), the lookup finds the task by client_ref OR source_note,
and noteUpdate archives and links the note. The model rule `task: link converted note` is deactivated (it ran inside the service's create,
so a failure there could leave a task without a linked note and a retry would create a duplicate). sharedWith was dropped to stay within
the 15 post_save action budget; its two rules were repurposed as the parentTask and parentCall datasets.
"""
import json, sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
FIX1 = '--fix1' in sys.argv; WRITE_RULES = '--write-rules' in sys.argv; ARGS = [a for a in sys.argv[1:] if a not in ('--fix1', '--write-rules')]
SERVICE = '7d76cf9f-0f31-4701-ac47-007d09cd1ea8'
LIVE = {'created_fn': '2c787203-6aa4-4e06-817d-b2f5168d8013', 'note_writable_guard': 'fead71a9-3d52-4317-bfd6-1b2da48130d9', 'notes.read': '1c3e90b9-5c70-43e4-a6df-52702249042f', 'convert_fn': '131af29d-33fd-4abd-86f1-6eaf25166ea3',
        'notes.list': 'e71654eb-1507-4e21-b099-2da6c801f048', 'companies.timeline': 'fc6a441e-cf29-45f5-ba89-6ded6d0790da', 'contacts.timeline': 'd8098366-54e9-4978-83f6-ccf66ca4df76', 'projects.timeline': '7ab35581-5358-4626-b9de-927dcc4fe852'}
# live rule ids of the first release; the fix round updates these in place (repurposed rules keep their id)
RULE_IDS = {'default-response': 'ac27832a-8e99-4f9c-b66d-365139e9acc8', 'success-response': 'fb9b1eb9-f605-45f5-9b99-9cce9c512141', 'parentTask.dataset': '0699cf7b-08d6-444d-a7b4-ee9b82ead74c', 'parentCall.dataset': 'd930ad04-1b3d-453d-8e55-59739cbaf7ac',
            'write': '4f3d4f9d-aa22-4319-9877-b11ba615b293', 'created': '9d4ce15b-f1e7-4a68-ac85-c95a4d04b0dd', 'created.shape': 'd2eb95d5-7ae3-4436-88ea-0141bbea3b18', 'created-response': '01bc646c-ecfd-4ea6-8c73-ebc2c157c135', 'blocked': '11d4e448-89e8-4489-b06c-6cea65a69302'}
LINK_RULE = '41defa72-b069-49c5-b7cf-177d68a3da36'
TASK = 'dda81674-76dc-4790-b885-ac8b5d691068'
DENIED = {'error': {'message': 'This record could not be found.'}}
name = 'notes.convertToTask'
def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
def response_rule(key, status, body, priority, *conds): L._rule(name + '.' + key, name, 'response', patch(status, body), priority=priority, condition=P.guarded(name, *conds))
var = lambda k: {'var': 'after.' + k}; no = lambda k: {'!': var(k)}
if not FIX1:
    P.op('function.normalize.F', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-F')
    P.op('function.respond.F', 'update_function', function_id=L.RESPOND, source=(P.ROOT / 'services/respond.ts').read_text(), idempotency_key='wgd-full-build-respond-F')
    P.op('function.created.F', 'update_function', function_id=LIVE['created_fn'], source=(P.ROOT / 'services/created.ts').read_text(), idempotency_key='wgd-full-build-created-F')
    P.op('function.convert', 'create_function', name='byof-convert-plan', source=(P.ROOT / 'services/convert-plan.ts').read_text(), idempotency_key='wgd-byof-convert-plan-v1')
    for svc, ast in json.loads((P.ROOT / 'services/convert-queries.json').read_text())['queries'].items(): P.op('update.query.' + svc, 'update_saved_query', saved_query_id=LIVE[svc], body={'ast': ast})
else:
    P.op('function.convert', 'update_function', function_id=LIVE['convert_fn'], source=(P.ROOT / 'services/convert-plan.ts').read_text(), idempotency_key='wgd-byof-convert-plan-v2')
L.write_service(name, 'BYOF: convert a note into a task (idempotent; the chain archives and links the note).')
ok = P.guarded(name, var('valid'), var('targetId'))
L._rule(name + '.writable.guard', name, 'post_save', [P.require(LIVE['note_writable_guard'], {'id': L.n('id')}, 404), P.setfields({'targetId': '{{query_rows.0.id}}'})], priority=-80, condition=P.guarded(name, var('valid')))
def dataset(key, query, params, result, priority, condition=None):
    L._rule(name + '.' + key, name, 'post_save', [{**P.require(query, params, 404), 'result_field': result, 'allow_empty': True}], priority=priority, condition=condition or ok)
dataset('note.dataset', LIVE['notes.read'], {'id': L.n('id')}, 'noteRows', -50)
parent = lambda kind: P.data_query(kind, [P.condition(kind, 'key', '=', ':ref')])
dataset('parentTask.dataset', P.query('notes_convertToTask_parent_task', parent('task')), {'ref': '{{after.noteRows.0.task}}'}, 'parentTaskRows', -49, P.guarded(name, var('valid'), var('targetId'), var('noteRows.0.task')))
dataset('parentCall.dataset', P.query('notes_convertToTask_parent_call', parent('call')), {'ref': '{{after.noteRows.0.call}}'}, 'parentCallRows', -48, P.guarded(name, var('valid'), var('targetId'), var('noteRows.0.call')))
dataset('existingTask.dataset', P.query('notes_convertToTask_existing_task', P.data_query('task', [P.condition('task', 'source_note', '=', ':id')])), {'id': L.n('id')}, 'existingTaskRows', -47)
L.fn(name, 'plan', P.ref('function.convert') if not FIX1 else LIVE['convert_fn'], {'actor': L.ACTOR}, priority=-40, condition=ok)
t = lambda k: '{{after.taskData.' + k + '}}'
data = {'name': t('name'), 'description': t('description'), 'project': t('project'), 'company': t('company'), 'contact': t('contact'), 'source_note': t('source_note'), 'client_ref': t('client_ref'),
        'assignee': L.ACTOR, 'version': 1, 'billable': False, 'billed': False, 'completed': False}
go = P.guarded(name, var('valid'), var('targetId'), no('blocked'), no('reuse'))
L.write(name, [{'type': 'create_record', 'target_model_id': TASK, 'data': data, 'trigger_rules': True}], go)
ready = P.guarded(name, var('valid'), var('targetId'), no('blocked'), {'or': [var('saved'), var('reuse')]})
lookup = {'fromModel': 'task', 'fromAlias': 'task', 'select': [P.field('task', 'id'), P.field('task', 'key')], 'where': P.group(P.group(P.condition('task', 'client_ref', '=', ':clientRef'), P.condition('task', 'source_note', '=', ':id'), combinator='or'), P.condition('task', 'deleted_at', 'is_null')), 'limit': 1}
dataset('created', P.query('notes_convertToTask_lookup', lookup), {'clientRef': L.n('fields.client_ref'), 'id': L.n('id')}, 'createdRows', 10, ready)
L.fn(name, 'created.shape', LIVE['created_fn'], {}, priority=11, condition=ready)
L._rule(name + '.noteUpdate', name, 'post_save', [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'converted_task': '{{after.createdRows.0.key}}', 'archived': True}, 'trigger_rules': False}, P.setfields({'linked': True})],
        priority=12, condition=P.guarded(name, var('valid'), var('targetId'), no('blocked'), {'or': [var('saved'), var('reuse')]}, var('createdRows.0.key')), settings={'on_failure': 'abort'})
response_rule('created-response', 200, '{{after.createdBody}}', 101, var('linked'))
response_rule('denied', 404, DENIED, 10, var('valid'), no('targetId'))
response_rule('blocked', 409, '{{after.blockBody}}', 20, var('valid'), var('targetId'), var('blocked'))
link = {'name': 'task: link converted note', 'model_id': TASK, 'trigger': 'record_create', 'phase': 'post_save', 'priority': 110, 'condition': {'!=': [{'var': 'after.source_note'}, None]},
        'actions': [{'type': 'update_record', 'target_record_id': '{{after.source_note}}', 'data': {'converted_task': '{{record_id}}', 'archived': True}, 'trigger_rules': False}],
        'isActive': False, 'run_as': 'actor', 'scope': {}, 'settings': {'on_failure': 'abort'}}
if WRITE_RULES: Path(P.ROOT / 'services/convert-rules.json').write_text(json.dumps({'_note': 'Deactivated in fix round 1: it ran inside the service create, so a failed link could leave an unlinked task and a retry would duplicate it. The service chain (noteUpdate) now archives and links.', 'task: link converted note': link}, indent=2) + '\n')
# success/default responses follow the linked flag, not the saved flag
for o in P.OPS:
    if o['name'] != 'create_rule': continue
    b = o['arguments']['body']
    if b['name'] == 'byof ' + name + '.success-response': b['condition'] = P.guarded(name, var('linked'))
    if b['name'] == 'byof ' + name + '.default-response': b['condition'] = P.guarded(name, var('guardsPassed'), no('linked'))
if FIX1:
    out = []
    for o in P.OPS:
        if o['name'] == 'update_function': out.append({**o, 'key': 'fix.' + o['key']}); continue
        if o['name'] == 'create_saved_query': out.append({**o, 'key': 'fix.' + o['key']}); continue
        if o['name'] != 'create_rule': continue
        key = o['key'][len('rule.' + name + '.'):]
        if key in RULE_IDS or key in ('existingTask.dataset', 'noteUpdate'):
            body = deepcopy(o['arguments']['body']); body['scope'] = {'service_config_id': SERVICE}
            if key in RULE_IDS: out.append({'key': 'fix.rule.' + key, 'name': 'update_rule', 'arguments': {'application_id': P.APP, 'rule_id': RULE_IDS[key], 'body': body}})
            else: out.append({'key': 'fix.rule.' + key, 'name': 'create_rule', 'arguments': {'application_id': P.APP, 'body': body}})
    out.append({'key': 'fix.rule.link-converted-note.deactivate', 'name': 'update_rule', 'arguments': {'application_id': P.APP, 'rule_id': LINK_RULE, 'body': link}})
    def rekey(v):
        if isinstance(v, list): return [rekey(x) for x in v]
        if isinstance(v, dict):
            if v.get('$ref', '').startswith('query.'): return {**v, '$ref': 'fix.' + v['$ref']}
            return {k: rekey(x) for k, x in v.items()}
        return v
    P.OPS[:] = [{**o, 'arguments': rekey(o['arguments'])} for o in out]
else:
    P.OPS[:] = [o for o in P.OPS]
L.emit(ARGS[0] if ARGS else '/tmp/wgd-plans/F.json')
