"""Milestone F, Task 16: files.read (attachment metadata) and files.delete (soft delete, SHARE required).

python3 provision-files.py [out.json]
files.read: gate = visible note_file by key; datasets: file, notes (note title), users (uploader name), companies, contacts, projects (parent names),
note_fileWritable and note_fileShareable counts. files.delete: shareable guard (404 DENIED) then update_record mark_deleted/deleted_at/deleted_by.
The model has no file-typed field, so there is no download service (platform gap, Milestone I).
"""
import json, sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
DENIED = {'error': {'message': 'This record could not be found.'}}
LIVE = json.loads((P.ROOT / 'services/sharing-queries.json').read_text())
P.op('function.normalize.F2', 'update_function', function_id=L.NORMALIZE, source=(P.ROOT / 'services/normalize.ts').read_text(), idempotency_key='wgd-full-build-normalize-F2')
P.op('function.respond.F2', 'update_function', function_id=L.RESPOND, source=(P.ROOT / 'services/respond.ts').read_text(), idempotency_key='wgd-full-build-respond-F2')
def patch(status, body): return [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': status}, {'op': 'replace', 'path': '/body', 'value': body}]}]
def key_of(kind, ast): return P.add_where(ast, P.condition(kind, 'key', '=', ':id'))
# ---- files.read
gate = P.data_query('note_file', [P.condition('note_file', 'key', '=', ':id')]); gate['limit'] = 1
users = deepcopy(LIVE['app_users_active']['ast'])
writable = P.add_where(deepcopy(P.BASE['note_file_writable']), P.condition('note_file', 'key', '=', ':id'))
shareable = P.add_where(deepcopy(P.BASE['note_file_shareable']), P.condition('note_file', 'key', '=', ':id')); shareable['limit'] = 1
P.pipeline('files.read', [('file', gate, False), ('notes', P.data_query('note'), False), ('users', users, False), ('companies', P.data_query('company'), False), ('contacts', P.data_query('contact'), False), ('projects', P.data_query('project'), False),
                          ('note_fileWritable', writable, True), ('note_fileShareable', shareable, True)], gate=gate)
P.rule('files.read.denied', 'files.read', 'response', patch(404, DENIED), priority=10, condition=P.guarded('files.read', {'var': 'after.valid'}, {'!': {'var': 'after.gatePassed'}}))
for o in P.OPS:
    if o['name'] == 'create_rule': o['arguments']['body']['isActive'] = True
FIXED = {'function.normalize': L.NORMALIZE, 'function.respond': L.RESPOND}
def pin(v):
    if isinstance(v, list): return [pin(x) for x in v]
    if isinstance(v, dict):
        if v.get('$ref') in FIXED: return FIXED[v['$ref']]
        return {k: pin(x) for k, x in v.items()}
    return v
for o in P.OPS: o['arguments'] = pin(o['arguments'])
# Reuse live saved queries with identical ASTs (found by comparing against the earlier plans) instead of creating copies; the file dataset reuses the gate (limit 1).
REUSE = {'query.files_read_users_rows': '3e4d9736-55c1-4eae-9df0-644a7fbdce9a', 'query.files_read_companies_rows': 'da2e5528-c103-457d-b1d8-48fac95cf44f',
         'query.files_read_contacts_rows': 'd4f6d681-9984-4d8e-91be-d9df79e7d440', 'query.files_read_projects_rows': '4e934773-8f37-4613-9014-c42de37f1f23', 'query.files_read_file_rows': {'$ref': 'query.files_read_gate', 'path': 'id'}}
P.OPS[:] = [o for o in P.OPS if o['key'] not in REUSE]
def reuse(v):
    if isinstance(v, list): return [reuse(x) for x in v]
    if isinstance(v, dict):
        if v.get('$ref') in REUSE: return REUSE[v['$ref']]
        return {k: reuse(x) for k, x in v.items()}
    return v
for o in P.OPS: o['arguments'] = reuse(o['arguments'])
# the pipeline helper also queued its own normalize/respond functions; drop them (the live ones are pinned above)
P.OPS[:] = [o for o in P.OPS if o['key'] not in ('function.normalize', 'function.respond')]
# ---- files.delete
name = 'files.delete'
L.write_service(name, 'BYOF: soft-delete an attachment (requires SHARE on it); the file object is kept, the row is hidden.')
ast = deepcopy(P.BASE['note_file_shareable']); ast['select'] = [P.field('note_file', 'id'), P.field('note_file', 'key')]
ast.pop('orderBy', None); P.add_where(ast, P.condition('note_file', 'key', '=', ':id')); ast['limit'] = 1
L.guard(name, 'shareable', ast, {'id': L.n('id')}, status=404, priority=-80, capture={'targetId': '{{query_rows.0.id}}'})
ok = P.guarded(name, {'var': 'after.valid'}, {'var': 'after.targetId'})
L.write(name, [{'type': 'update_record', 'target_record_id': '{{after.targetId}}', 'data': {'mark_deleted': True, 'deleted_at': L.NOW, 'deleted_by': L.ACTOR}, 'trigger_rules': False}], ok)
L._rule(name + '.denied', name, 'response', patch(404, DENIED), priority=10, condition=P.guarded(name, {'var': 'after.valid'}, {'!': {'var': 'after.targetId'}}))
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/F2.json')
