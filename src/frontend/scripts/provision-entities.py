"""Milestone B: companies and contacts read services."""
import sys
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); import provision_lib as L
P = L.P
P.op('function.respond.B', 'update_function', function_id=L.RESPOND, source=(P.ROOT / 'services/respond.ts').read_text(), idempotency_key='wgd-full-build-respond-B')
def assoc_query(extras=()):
    ast = deepcopy(P.BASE['visible_contact_companies_all_keyed']); ast.pop('orderBy', None); ast['distinct'] = True; ast['limit'] = 1000
    P.add_where(ast, P.condition('contact_company', 'deleted_at', 'is_null'), P.group(P.condition('contact_company', 'mark_deleted', 'is_null'), P.condition('contact_company', 'mark_deleted', '!=', True), combinator='or'), *extras)
    return ast
def writable_in(kind, extras):
    ast = deepcopy(P.BASE[kind + '_writable']); ast['select'] = [P.field(kind, 'key')]; ast['distinct'] = True; ast['limit'] = 1000
    P.add_where(ast, P.condition(kind, 'deleted_at', 'is_null'), *extras); return ast
def shareable(kind, plural):
    ast = deepcopy(P.BASE[kind + '_shareable'])
    P.add_where(ast, P.condition(kind, 'key', '=', ':id')); ast['limit'] = 1; return ast
contexts = P.contexts if hasattr(P, 'contexts') else [('companies', P.data_query('company'), False), ('contacts', P.data_query('contact'), False), ('projects', P.data_query('project'), False)]
for kind, plural, parent_field in [('company', 'companies', 'company'), ('contact', 'contacts', 'contact')]:
    gate = P.data_query(kind, [P.condition(kind, 'key', '=', ':id')]); gate['limit'] = 1
    by_parent = lambda child, k=kind, f=parent_field: [P.group(P.condition(child, f, '=', ':id'), *([P.condition(child, 'callee', '=', ':id')] if child == 'call' and k == 'contact' else []), combinator='or')]
    assoc_for = assoc_query([P.condition('contact_company', parent_field, '=', ':id')])
    P.pipeline(plural + '.list', [(plural, P.data_query(kind), False), *[c for c in contexts if c[0] != plural], ('associations', assoc_query(), False)])
    P.pipeline(plural + '.read', [(kind, gate, False), *[c for c in contexts if c[0] != plural], ('associations', assoc_for, False), (kind + 'Writable', P.add_where(deepcopy(P.BASE[kind + '_writable']), P.condition(kind, 'key', '=', ':id')), True), (kind + 'Shareable', shareable(kind, plural), True)], gate=gate)
    P.pipeline(plural + '.timeline', [('tasks', P.data_query('task', by_parent('task')), False), ('calls', P.data_query('call', by_parent('call')), False), ('notes', P.data_query('note', by_parent('note')), False), ('files', P.data_query('note_file', by_parent('note_file')), False), *contexts, ('taskWritable', writable_in('task', by_parent('task')), False), ('callWritable', writable_in('call', by_parent('call')), False), ('noteWritable', writable_in('note', by_parent('note')), False)], gate=gate)
# A refused gate aborts post_save with the platform's generic 404 body; the response phase restores the
# byte-identical denied body (BYOF-09 / PERM-18).
DENIED = {'error': {'message': 'This record could not be found.'}}
for name in [n + '.' + v for n in ['companies', 'contacts'] for v in ['read', 'timeline']]:
    P.rule(name + '.denied', name, 'response', [{'type': 'patch_response', 'patches': [{'op': 'replace', 'path': '/status_code', 'value': 404}, {'op': 'replace', 'path': '/body', 'value': DENIED}]}], priority=10, condition=P.guarded(name, {'var': 'after.valid'}, {'!': {'var': 'after.gatePassed'}}))
for o in P.OPS:
    if o['name'] == 'create_rule': o['arguments']['body']['isActive'] = True
# The normalize/respond functions already exist on stage; pin their ids instead of unresolved refs.
FIXED = {'function.normalize': L.NORMALIZE, 'function.respond': L.RESPOND}
def _pin(v):
    if isinstance(v, list): return [_pin(x) for x in v]
    if isinstance(v, dict):
        if v.get('$ref') in FIXED: return FIXED[v['$ref']]
        return {k: _pin(x) for k, x in v.items()}
    return v
for o in P.OPS: o['arguments'] = _pin(o['arguments'])
L.emit(sys.argv[1] if len(sys.argv) > 1 else '/tmp/wgd-plans/B.json')
