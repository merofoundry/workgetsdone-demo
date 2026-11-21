"""Milestone C: create/update/archive/association write services and the retrofit of the three legacy creates."""
import json, sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
MODELS = {'company': 'dbc0feab-13e1-4495-bee4-a2c84271e175', 'contact': '54a5f4e5-af5c-4824-99a4-eb5f44160229', 'project': '49b6dd3d-7c76-49d4-943b-a6b7b88bdb08', 'task': 'dda81674-76dc-4790-b885-ac8b5d691068', 'call': '8a3d9382-0ad7-4f18-98d0-cd914707a0c1', 'note': 'ddef37bc-28f6-458a-b30c-6575096e4709', 'contact_company': 'd2222d79-5985-4537-958e-ff3e120ba072'}
PLURAL = {'company': 'companies', 'contact': 'contacts', 'project': 'projects', 'task': 'tasks', 'call': 'calls', 'note': 'notes'}
FIELDS = {'company': ['name', 'address1', 'address2', 'city', 'state', 'postal_code', 'country', 'phone1', 'phone2', 'fax'],  # primary_contact is written only by companies.setPrimaryContact
          'contact': ['first_name', 'last_name', 'email1', 'email2', 'work_phone', 'home_phone', 'cell_phone', 'fax', 'address1', 'address2', 'city', 'state', 'postal_code', 'country', 'title'],
          'project': ['name', 'description', 'status', 'start_date', 'end_date', 'parent_project', 'contact', 'company'],
          'task': ['name', 'description', 'start_date', 'end_date', 'billable', 'billed', 'assignee', 'contact', 'project', 'company'],
          'call': ['subject', 'callee', 'start_date', 'end_date', 'billable', 'billed', 'followup', 'contact', 'project', 'company', 'task'],
          'note': ['description', 'body', 'occurred_at', 'contact', 'company', 'project', 'task', 'call']}
REFS = {'company': {}, 'contact': {}, 'project': {'parentProjectId': 'project', 'contactId': 'contact', 'companyId': 'company'},
        'task': {'contactId': 'contact', 'projectId': 'project', 'companyId': 'company'}, 'call': {'calleeId': 'contact', 'contactId': 'contact', 'projectId': 'project', 'companyId': 'company', 'taskId': 'task'},
        'note': {'contactId': 'contact', 'companyId': 'company', 'projectId': 'project', 'taskId': 'task', 'callId': 'call'}}
DENIED = {'error': {'message': 'This record could not be found.'}}
CONFLICT = {'error': {'message': 'Someone else changed this record. Reload and try again.'}}
LINKED = {'error': {'message': 'The linked record could not be found.'}}
f = lambda name: '{{after.normalized.fields.' + name + '}}'
guarded_by = P.guarded
SUMMARY = json.loads((P.ROOT.parent / 'verification/2026-10-08-frontend/authoring-summary.json').read_text())['write']
LEGACY = {'tasks.create': 'task', 'calls.create': 'call', 'notes.create': 'note'}
SERVICE_IDS = {name: SUMMARY['service.' + name]['id'] for name in LEGACY}
has_ref = lambda: {'!': {'!': {'var': 'after.normalized.clientRef'}}}
P.op('function.normalize.C', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-C3')

def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
def response_rule(name, key, status, body, priority, *conds): L._rule(name + '.' + key, name, 'response', patch(status, body), priority=priority, condition=P.guarded(name, *conds))
def supplied(key): return {'!': {'!': {'var': 'after.normalized.' + key}}}
WRITE_LEVEL = ('project', 'company', 'task', 'call')
COLUMN = {'parentProjectId': 'parent_project', 'contactId': 'contact', 'companyId': 'company', 'projectId': 'project', 'calleeId': 'callee', 'taskId': 'task', 'callId': 'call'}
def ref_guards(name, kind, only=None, update=False):
    conds = []
    for i, (key, target) in enumerate(REFS[kind].items()):
        if only is not None and key not in only: continue
        if target in WRITE_LEVEL:
            # a parent the actor can only read (a viewer grant) must not be linkable: the guard is the writable query, not the visible rows
            ast = deepcopy(P.BASE[target + '_writable']); P.add_where(ast, P.condition(target, 'key', '=', ':ref'), P.condition(target, 'deleted_at', 'is_null')); ast['limit'] = 1
        else:
            ast = P.data_query(target, [P.condition(target, 'key', '=', ':ref')]); ast['limit'] = 1
        extra = [{'!': {'==': [{'var': 'after.normalized.' + key}, {'var': 'after.cur_' + key}]}}] if update else []  # an unchanged reference needs no check: a plain rename must not fail because the parent is only readable
        L.guard(name, key, ast, {'ref': L.n(key)}, status=422, priority=-78 + i, condition=P.guarded(name, {'var': 'after.valid'}, supplied(key), *extra))
    return conds  # a refused guard aborts post_save, so the write rule needs no per-key condition
def created_response(name, kind, legacy=False):
    """After the write, fetch the new row by client_ref and answer {data: {ok, id}}; no clientRef (legacy only) answers id null."""
    extra = [has_ref()] if legacy else []
    # The row is looked up by its client-generated uuid without ownership joins: the creator grants are written by nested
    # rules that may not be visible yet, and the id (record id) is available before the set-key rule has run.
    ast = {'fromModel': kind, 'fromAlias': kind, 'select': [P.field(kind, 'id'), P.field(kind, 'key')], 'where': P.group(P.condition(kind, 'client_ref', '=', ':clientRef'), P.condition(kind, 'deleted_at', 'is_null')), 'limit': 1}
    L.guard(name, 'created', ast, {'clientRef': L.n('clientRef')}, status=404, priority=10, condition=P.guarded(name, {'var': 'after.saved'}, *extra), result_field='createdRows', allow_empty=True)
    L.fn(name, 'created.shape', P.ref('function.created'), {}, priority=11, condition=P.guarded(name, {'var': 'after.saved'}, *extra))
    response_rule(name, 'created-response', 200, '{{after.createdBody}}', 101, {'var': 'after.saved'}, *extra)
def data_for(kind, create):
    data = {field: f(field) for field in FIELDS[kind]}
    if create:
        data['client_ref'] = L.n('clientRef'); data['version'] = 1
        if kind == 'project': data['owner'] = L.ACTOR; data['archived'] = False
        if kind in ('task', 'call'): data['completed'] = False
        if kind == 'task': data['assignee'] = L.ACTOR
        if kind == 'note': data['author'] = L.ACTOR; data['archived'] = False
    else: data['version'] = L.n('nextVersion')
    return data
def op_of(key): return next(o for o in P.OPS if o['key'] == key)
def create_service(kind):
    name = PLURAL[kind] + '.create'; L.write_service(name, 'BYOF guarded create; model validation, creator grant and set-key rules stay active.')
    conds = ref_guards(name, kind)
    L.write(name, [{'type': 'create_record', 'target_model_id': MODELS[kind], 'data': data_for(kind, True), 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, *conds))
    created_response(name, kind)
    response_rule(name, 'refs-invalid-response', 422, LINKED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.guardsPassed'}})
def update_service(kind):
    name = PLURAL[kind] + '.update'; L.write_service(name, 'BYOF guarded update with optimistic concurrency.')
    writable = deepcopy(P.BASE[kind + '_writable']); P.add_where(writable, P.condition(kind, 'key', '=', ':id'), P.condition(kind, 'deleted_at', 'is_null'))
    # the writable guard also reads the record's current reference columns so unchanged references skip their guard
    for key in REFS[kind]: writable['select'].append(P.field(kind, COLUMN[key]))
    L.guard(name, 'writable', writable, {'id': L.n('id')}, status=404, priority=-80, capture={'targetId': '{{query_rows.0.id}}', **{'cur_' + key: '{{query_rows.0.' + COLUMN[key] + '}}' for key in REFS[kind]}})
    # the writable guard above already proved the actor may write this row, so the version check needs no ownership joins; rows that predate the version column (null) accept any submitted version
    current = {'fromModel': kind, 'fromAlias': kind, 'select': [P.field(kind, 'key')], 'where': P.group(P.condition(kind, 'key', '=', ':id'), P.group(P.condition(kind, 'version', '=', ':version'), P.condition(kind, 'version', 'is_null'), combinator='or'), P.condition(kind, 'deleted_at', 'is_null')), 'limit': 1}
    L.guard(name, 'version', current, {'id': L.n('id'), 'version': L.n('version')}, status=409, priority=-79, condition=P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}), capture={'versionOk': True})
    conds = ref_guards(name, kind, update=True)
    L.write(name, [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': data_for(kind, False), 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}, *conds))
    response_rule(name, 'denied', 404, DENIED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}})
    response_rule(name, 'conflict', 409, CONFLICT, 10, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'!': {'var': 'after.versionOk'}})
    response_rule(name, 'refs-invalid-response', 422, LINKED, 10, {'var': 'after.valid'}, {'var': 'after.versionOk'}, {'!': {'var': 'after.guardsPassed'}})
def retrofit_create(name, kind):
    """Move a legacy create service to the schema fields and the created-id response."""
    service_id = SERVICE_IDS[name]; rules = {r: SUMMARY['rule.' + name + '.' + r]['id'] for r in ('write', 'success-response')}
    already = {'projectId', 'contactId'}
    others = {k for k in REFS[kind] if k not in already}
    # interim write rule: new data, old conditions, so creates keep working the moment normalize changes
    old_conds = [{'or': [{'!': {'var': 'after.normalized.' + k}}, {'var': 'after.' + k + 'Validated'}]} for k in ('projectId', 'contactId')]
    L.write(name, [{'type': 'create_record', 'target_model_id': MODELS[kind], 'data': data_for(kind, True), 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, *old_conds))
    write_op = op_of('rule.' + name + '.write')
    interim = deepcopy(write_op); interim.update(key='retrofit.' + name + '.write.interim', name='update_rule'); interim['arguments'] = {'application_id': write_op['arguments']['application_id'], 'rule_id': rules['write'], 'body': interim['arguments']['body']}
    P.OPS.remove(write_op)
    new_guards_before = len(P.OPS)
    ref_guards(name, kind, only=others)
    guard_ops = P.OPS[new_guards_before:]
    L.write(name, [{'type': 'create_record', 'target_model_id': MODELS[kind], 'data': data_for(kind, True), 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, *old_conds))
    final_write = op_of('rule.' + name + '.write'); P.OPS.remove(final_write)
    final = {'key': 'retrofit.' + name + '.write', 'name': 'update_rule', 'arguments': {'application_id': final_write['arguments']['application_id'], 'rule_id': rules['write'], 'body': final_write['arguments']['body']}}
    created_response(name, kind, legacy=True)
    # the old static success body only answers legacy calls without a clientRef
    success = {'key': 'retrofit.' + name + '.success-response', 'name': 'update_rule', 'arguments': {'application_id': final['arguments']['application_id'], 'rule_id': rules['success-response'], 'body': {'name': 'byof ' + name + '.success-response', 'trigger': 'webhook_received', 'phase': 'response', 'condition': P.guarded(name, {'var': 'after.saved'}, {'!': {'var': 'after.normalized.clientRef'}}), 'actions': patch(200, {'data': {'ok': True, 'id': None}}), 'priority': 100, 'run_as': 'actor', 'isActive': True, 'scope': {'service_config_id': service_id}}}}
    return interim, guard_ops, final, success
# ---- build
for kind in ['company', 'contact', 'project']: create_service(kind)
for kind in PLURAL: update_service(kind)
for action, value in [('archive', True), ('unarchive', False)]:
    name = 'projects.' + action; L.write_service(name, 'BYOF guarded project archive toggle.')
    ast = deepcopy(P.BASE['project_writable']); P.add_where(ast, P.condition('project', 'key', '=', ':id'), P.condition('project', 'deleted_at', 'is_null'))
    L.guard(name, 'writable', ast, {'id': L.n('id')}, capture={'targetId': '{{query_rows.0.id}}'})
    L.write(name, [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'archived': value}, 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}))
    response_rule(name, 'denied', 404, DENIED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}})
name = 'contacts.associate'; L.write_service(name, 'BYOF: link a contact to a company (DM-CON-02).')
contact_w = deepcopy(P.BASE['contact_writable']); P.add_where(contact_w, P.condition('contact', 'key', '=', ':ref'), P.condition('contact', 'deleted_at', 'is_null'))
L.guard(name, 'contact', contact_w, {'ref': L.n('contactId')}, status=422, priority=-80)
company_w = deepcopy(P.BASE['company_writable']); P.add_where(company_w, P.condition('company', 'key', '=', ':ref'), P.condition('company', 'deleted_at', 'is_null'))
L.guard(name, 'company', company_w, {'ref': L.n('companyId')}, status=422, priority=-79)
L.write(name, [{'type': 'create_record', 'target_model_id': MODELS['contact_company'], 'data': {'contact': L.n('contactId'), 'company': L.n('companyId'), 'role': f('role'), 'is_primary': f('is_primary'), 'client_ref': L.n('clientRef'), 'version': 1}, 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}))
response_rule(name, 'refs-invalid-response', 422, LINKED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.guardsPassed'}})
name = 'contacts.dissociate'; L.write_service(name, 'BYOF: remove a contact-company link (soft delete).')
assoc_w = deepcopy(P.BASE['contact_company_writable']); P.add_where(assoc_w, P.condition('contact_company', 'key', '=', ':id'), P.condition('contact_company', 'deleted_at', 'is_null'))
L.guard(name, 'writable', assoc_w, {'id': L.n('associationId')}, capture={'targetId': '{{query_rows.0.id}}'})
L.write(name, [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'mark_deleted': True, 'deleted_at': L.NOW}, 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}))
response_rule(name, 'denied', 404, DENIED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}})
name = 'companies.setPrimaryContact'; L.write_service(name, 'BYOF: set the primary contact; the contact must be associated (DM-CMP-03).')
cw = deepcopy(P.BASE['company_writable']); P.add_where(cw, P.condition('company', 'key', '=', ':id'), P.condition('company', 'deleted_at', 'is_null'))
L.guard(name, 'writable', cw, {'id': L.n('id')}, capture={'targetId': '{{query_rows.0.id}}'})
assoc = deepcopy(P.BASE['visible_contact_companies_all_keyed']); P.add_where(assoc, P.condition('contact_company', 'company', '=', ':id'), P.condition('contact_company', 'contact', '=', ':contact'), P.group(P.condition('contact_company', 'mark_deleted', 'is_null'), P.condition('contact_company', 'mark_deleted', '!=', True), combinator='or')); assoc['limit'] = 1
L.guard(name, 'associated', assoc, {'id': L.n('id'), 'contact': L.n('contactId')}, status=422, priority=-79, condition=P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}, supplied('contactId')))  # a null contactId clears the primary contact
L.write(name, [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'primary_contact': L.n('contactId')}, 'trigger_rules': True}], P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}))
response_rule(name, 'denied', 404, DENIED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}})
response_rule(name, 'refs-invalid-response', 422, LINKED, 10, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'!': {'var': 'after.guardsPassed'}})
# legacy creates
RETRO = {}
for legacy_name, kind in LEGACY.items(): RETRO[legacy_name] = retrofit_create(legacy_name, kind)
# literal service ids for rules scoped to existing services
def pin(v):
    if isinstance(v, list): return [pin(x) for x in v]
    if isinstance(v, dict):
        if v.get('$ref', '')[:8] == 'service.' and v['$ref'][8:] in SERVICE_IDS: return SERVICE_IDS[v['$ref'][8:]]
        return {k: pin(x) for k, x in v.items()}
    return v
for o in P.OPS: o['arguments'] = pin(o['arguments'])
for o in [x for pair in RETRO.values() for x in (pair[0], pair[2], pair[3])]: o['arguments'] = pin(o['arguments'])
# identical guard queries are created once and shared
canon, remap = {}, {}
for o in [o for o in P.OPS if o['name'] == 'create_saved_query']:
    sig = json.dumps(o['arguments']['body']['ast'], sort_keys=True)
    if sig in canon: remap[o['key']] = canon[sig]; P.OPS.remove(o)
    else: canon[sig] = o['key']
def share(v):
    if isinstance(v, list): return [share(x) for x in v]
    if isinstance(v, dict):
        if v.get('$ref') in remap: return {**v, '$ref': remap[v['$ref']]}
        return {k: share(x) for k, x in v.items()}
    return v
for o in P.OPS: o['arguments'] = share(o['arguments'])
# order: normalize update, the three interim write retrofits, then the rest (new function first), then the final retrofits
front = [P.OPS.pop(0)]
assert front[0]['key'] == 'function.normalize.C'
interims = [RETRO[n][0] for n in LEGACY]
created_fn = {'key': 'function.created', 'name': 'create_function', 'arguments': {'application_id': P.APP, 'name': 'byof-created', 'source': (P.ROOT / 'services/created.ts').read_text(), 'idempotency_key': 'wgd-byof-created-v2'}}
tail = [RETRO[n][3] for n in LEGACY]  # final write == interim (guards abort post_save), so only the success bodies follow
P.OPS[:] = front + interims + [created_fn] + P.OPS + tail
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/C.json')
