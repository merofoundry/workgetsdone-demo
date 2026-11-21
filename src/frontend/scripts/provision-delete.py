"""Milestone E, Task 13: soft-delete services with a dry-run preview (companies, contacts, projects, tasks, calls, notes).

Child rows are written with one update_record per slot: the platform update_children action reads `record_ids` raw (no template
resolution), so byof-delete-plan returns up to N ordered `slots` ({id, data}) and each slot is its own conditioned rule. A service call
handles at most N children and answers {done, remaining}; the caller repeats until done. The target is soft-deleted only on the last batch.
"""
import json, sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
DENIED = {'error': {'message': 'This record could not be found.'}}
PLAN_SOURCE = (P.ROOT / 'services/delete-plan.ts').read_text()
P.op('function.normalize.E', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-E')
P.op('function.plan', 'create_function', name='byof-delete-plan', source=PLAN_SOURCE, idempotency_key='wgd-byof-delete-plan-v1')  # live function updated by fix.function.delete-plan.round1
def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
def response_rule(name, key, status, body, priority, *conds): L._rule(name + '.' + key, name, 'response', patch(status, body), priority=priority, condition=P.guarded(name, *conds))
def shareable(kind, extra=()):
    ast = deepcopy(P.BASE[kind + '_shareable'])
    ast['select'] = [P.field(kind, 'id'), P.field(kind, 'key'), *[P.field(kind, c) for c in extra]]
    ast.pop('orderBy', None); P.add_where(ast, P.condition(kind, 'key', '=', ':id')); ast['limit'] = 1
    return ast
def assoc(extras):
    ast = deepcopy(P.BASE['visible_contact_companies_all_keyed']); ast.pop('orderBy', None); ast['distinct'] = True; ast['limit'] = 1000
    P.add_where(ast, P.condition('contact_company', 'deleted_at', 'is_null'), P.group(P.condition('contact_company', 'mark_deleted', 'is_null'), P.condition('contact_company', 'mark_deleted', '!=', True), combinator='or'), *extras)
    return ast
def q(kind, field_, op='='): return P.data_query(kind, [P.condition(kind, field_, op, ':id')])
def delete_service(name, kind, description, datasets, slot_keys=(), slots=0, capture_cols=(), final=True):
    P.op('service.' + name, 'create_service', name=name, service_type='webhook_in', base_url='mero://inbound/' + name, auth_type='none', settings={'public': False}, description=description)
    L._rule(name + '.normalize', name, 'post_save', [{'type': 'run_function', 'params': {'function_id': L.NORMALIZE, 'payload': '{{payload}}', 'name': name}}], priority=-100)
    capture = {'targetId': '{{query_rows.0.id}}', **{'target' + c.capitalize(): '{{query_rows.0.' + c + '}}' for c in capture_cols}}
    L.guard(name, 'shareable', shareable(kind, capture_cols), {'id': L.n('id')}, status=404, priority=-80, capture=capture)
    for key, ast, count in datasets: L.read_dataset(name, key, ast, count=count, priority=-50, condition=P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}))
    ok = P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'})
    L.fn(name, 'plan', P.ref('function.plan'), {'actor': L.ACTOR}, priority=-40, condition=ok)
    can = P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'!': {'var': 'after.plan.blocked'}}, {'!': {'var': 'after.normalized.dryRun'}})
    settings = {'on_failure': 'abort'}
    L._rule(name + '.flag', name, 'post_save', [P.setfields({'guardsPassed': True})], priority=0, condition=can, settings=settings)
    for i in range(slots):
        data = {k: '{{after.slots.%d.data.%s}}' % (i, k) for k in slot_keys}
        cond = P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'!': {'var': 'after.plan.blocked'}}, {'!': {'var': 'after.normalized.dryRun'}}, {'>': [{'var': 'after.slotCount'}, i]})
        L._rule(name + '.slot.%d' % i, name, 'post_save', [{'type': 'update_record', 'target_record_id': '{{after.slots.%d.id}}' % i, 'data': data, 'trigger_rules': False}], priority=1 + i, condition=cond, settings=settings)
    if final:
        L._rule(name + '.final', name, 'post_save', [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'mark_deleted': True, 'deleted_at': L.NOW, 'deleted_by': L.ACTOR}, 'trigger_rules': False}], priority=50, condition=P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'!': {'var': 'after.plan.blocked'}}, {'!': {'var': 'after.normalized.dryRun'}}, {'var': 'after.last'}), settings=settings)
    L._rule(name + '.saved', name, 'post_save', [P.setfields({'saved': True})], priority=60, condition=can, settings=settings)
    response_rule(name, 'default-response', 503, {'error': {'message': 'The change could not be saved. Please try again.'}}, -100, {'var': 'after.guardsPassed'}, {'!': {'var': 'after.saved'}})
    response_rule(name, 'invalid-response', 422, '{{after.result}}', -90, {'!': {'var': 'after.valid'}})
    response_rule(name, 'denied', 404, DENIED, 10, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}})
    response_rule(name, 'dryrun', 200, '{{after.dryRunBody}}', 20, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'var': 'after.normalized.dryRun'})
    response_rule(name, 'blocked', 409, '{{after.blockedBody}}', 20, {'var': 'after.valid'}, {'var': 'after.targetId'}, {'!': {'var': 'after.normalized.dryRun'}}, {'var': 'after.plan.blocked'})
    response_rule(name, 'success-response', 200, '{{after.doneBody}}', 100, {'var': 'after.saved'})
count = lambda kind, field_: (q(kind, field_), True)
delete_service('companies.delete', 'company', 'BYOF soft delete of a company; blocked while projects, tasks, calls or associations reference it.', [
    ('projects', q('project', 'company'), True), ('tasks', q('task', 'company'), True), ('calls', q('call', 'company'), True), ('associations', assoc([P.condition('contact_company', 'company', '=', ':id')]), True)])
delete_service('contacts.delete', 'contact', 'BYOF soft delete of a contact; blocked while referenced; its associations are removed with it.', [
    ('projects', q('project', 'contact'), True), ('tasks', q('task', 'contact'), True),
    ('calls', P.data_query('call', [P.group(P.condition('call', 'callee', '=', ':id'), P.condition('call', 'contact', '=', ':id'), combinator='or')]), True),
    ('companies', q('company', 'primary_contact'), True), ('associations', assoc([P.condition('contact_company', 'contact', '=', ':id')]), False)],
    slot_keys=['mark_deleted', 'deleted_at'], slots=3)
descendants = lambda kind: P.data_query(kind, P.in_project(kind))
delete_service('projects.delete', 'project', 'BYOF soft delete of a project; blocked by sub-projects, or by children when no strategy is chosen.', [
    ('subprojects', q('project', 'parent_project'), True), ('tasks', descendants('task'), False), ('calls', descendants('call'), False), ('notes', descendants('note'), False), ('files', descendants('note_file'), False)], capture_cols=['company', 'contact'])
delete_service('projects.deleteChildren', 'project', 'BYOF: cascade (soft-delete) or reparent the children of a project in batches; call until done, then projects.delete.', [
    ('subprojects', q('project', 'parent_project'), True), ('tasks', descendants('task'), False), ('calls', descendants('call'), False), ('notes', descendants('note'), False), ('files', descendants('note_file'), False)],
    slot_keys=['mark_deleted', 'deleted_at', 'deleted_by', 'project', 'company', 'contact'], slots=4, capture_cols=['company', 'contact'], final=False)
delete_service('tasks.delete', 'task', 'BYOF soft delete of a task; its calls and notes move to the task project or company.', [('calls', q('call', 'task'), False), ('notes', q('note', 'task'), False)],
    slot_keys=['task', 'project', 'company', 'contact'], slots=6, capture_cols=['project', 'company', 'contact'])
delete_service('calls.delete', 'call', 'BYOF soft delete of a call; its notes move to the call task, project or company.', [('notes', q('note', 'call'), False)],
    slot_keys=['call', 'task', 'project', 'company', 'contact'], slots=7, capture_cols=['task', 'project', 'company', 'contact'])
delete_service('notes.delete', 'note', 'BYOF soft delete of a note; its attachments are soft-deleted with it.', [('files', q('note_file', 'note'), False)],
    slot_keys=['mark_deleted', 'deleted_at', 'deleted_by'], slots=7)
# identical queries are created once and shared (the two project services use the same shareable guard)
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
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/E.json')
