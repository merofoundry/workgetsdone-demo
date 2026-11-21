"""Generate a reviewable MCP authoring plan; never enables or activates a site.

Run from frontend/: python3 scripts/provision-services.py /tmp/wgd-frontend-plan.json
Apply with the connected MCP plan runner. Requires the reviewed MeroFoundry scope/result_field patch.
Result IDs become public/services.json only after scoped rules are verified and activated.
Existing application queries and rules are left intact.
"""
from pathlib import Path
from copy import deepcopy
import json
import sys

ROOT = Path(__file__).resolve().parent.parent
APP = '104c98da-971b-4a99-8fad-4fd2ef06eb3f'
BASE = json.loads((ROOT / 'services/ownership-queries.json').read_text())
OPS = []
def ref(key, path='id'): return {'$ref': key, 'path': path}
def op(key, tool, **args): OPS.append({'key': key, 'name': tool, 'arguments': {'application_id': APP, **args}})
def field(alias, name): return {'modelAlias': alias, 'fieldName': name}
def condition(alias, name, operator, value=None):
    r = {'field': field(alias, name), 'operator': operator}
    if value is not None: r['value'] = value
    return r
def group(*rules, combinator='and'): return {'combinator': combinator, 'rules': list(rules)}
def add_where(ast, *rules): ast['where'] = group(ast.get('where', group()), *rules); return ast
def query(key, ast): op('query.' + key, 'create_saved_query', body={'name': 'byof_' + key, 'ast': ast, 'isPublic': False, 'description': 'BYOF additive service query retaining the established ownership/revocation boundary.'}); return ref('query.' + key)
def membership(ast, outer='base'):
    # NOT EXISTS (caller WHERE NOT EXISTS (visible record)) expresses membership
    # without multiplying root rows when several grants cover the same record.
    visible = deepcopy(ast); visible['select'] = [field(visible['fromAlias'], 'key')]; visible.pop('orderBy', None); visible.pop('limit', None); visible.pop('groupBy', None); visible.pop('having', None)
    add_where(visible, condition(visible['fromAlias'], 'key', '=', field(outer, 'key')))
    # The relationship resolver sees enclosing aliases. Anchor joins explicitly
    # to this subquery's root when both the outer and inner root use one model.
    for join in visible.get('joins',[]):
        endpoint=None
        if join['modelName'] in [visible['fromModel'] + '_perm', visible['fromModel'] + '_revocation']:
            endpoint={'left':field(visible['fromAlias'],'key'),'right':field(join['alias'],visible['fromModel']+'_id')}
        elif visible['fromModel']=='contact' and join.get('relationshipName')=='contact_links':
            endpoint={'left':field(join['alias'],'contact'),'right':field(visible['fromAlias'],'key')}
        elif visible['fromModel']=='contact' and join.get('relationshipName','').startswith('contact_company_company_to_'):
            endpoint={'left':field('cc','company'),'right':field(join['alias'],'key')}
        elif join.get('relationshipName','').startswith(visible['fromModel']+'_') and '_to_' in join['relationshipName']:
            reference=join['relationshipName'].split('_to_')[0][len(visible['fromModel'])+1:]
            endpoint={'left':field(visible['fromAlias'],reference),'right':field(join['alias'],'key')}
        if endpoint:
            predicate=join.setdefault('onPredicate',{'terms':[]})
            if 'terms' in predicate: predicate['terms'].append(endpoint)

    sentinel = {'fromModel': 'app_user', 'fromAlias': 'byof_actor', 'select': [field('byof_actor', 'key')], 'where': group(condition('byof_actor', 'key', '=', ':current_user_id'), {'operator': 'not_exists', 'subquery': visible})}
    return {'operator': 'not_exists', 'subquery': sentinel}
def data_query(kind, extras=(), opened=False, source=None):
    plural = {'company': 'companies', 'contact': 'contacts', 'project': 'projects', 'task': 'tasks', 'call': 'calls', 'note': 'notes', 'note_file': 'note_files'}[kind]
    ast = deepcopy(BASE[source or f'visible_{plural}_all_keyed']); ast.pop('orderBy', None); ast['distinct'] = True; ast['limit'] = 1000
    ast['select']=[item for item in ast['select'] if (item.get('fieldName') or item.get('alias')) not in ['start_day','duration_minutes','yes','zero']]
    add_where(ast, condition(kind, 'deleted_at', 'is_null'), *extras)
    if opened and kind in ['task', 'call', 'project', 'note']: add_where(ast, group(condition(kind, 'archived' if kind in ['project', 'note'] else 'completed', 'is_null'), condition(kind, 'archived' if kind in ['project', 'note'] else 'completed', '!=', True), combinator='or'))
    return ast
def aggregate(ast):
    alias=ast['fromAlias'] + '_count'
    return {'fromModel': ast['fromModel'], 'fromAlias': alias, 'select': [{'function': 'count', 'field': field(alias, 'id'), 'alias': 'n'}], 'where': group(membership(ast,alias))}
def rollup_query(kind):
    ast=aggregate(data_query(kind,opened=True));alias=ast['fromAlias']
    date='occurred_at' if kind=='note' else 'start_date'
    ast['select']=[{**field(alias,'project'),'alias':'project'},{'function':'count','field':field(alias,'id'),'alias':'n'},{'function':'max','field':field(alias,date),'alias':'lastActivityAt'}]
    ast['groupBy']=[field(alias,'project')];ast['limit']=1000
    return ast
def match(name): return {'==': [{'var': 'webhook.name'}, name]}
def guarded(name, *conditions): return {'and': [match(name), {'==': [{'var': 'actor.type'}, 'user']}, *conditions]}
def rule(key, name, phase, actions, priority=0, condition=None):
    op('rule.' + key, 'create_rule', body={'name': 'byof ' + key, 'trigger': 'webhook_received', 'phase': phase, 'condition': condition or guarded(name), 'actions': actions, 'priority': priority, 'run_as': 'actor', 'isActive': False, 'scope': {'service_config_id': ref('service.' + name)}})
def require(q, params=None, status=404): return {'type': 'require_query', 'saved_query_id': q, 'params': {'template': params or {}}, 'failure_status': status}
def setfields(fields): return {'type': 'set_fields', 'fields': fields}
def parameters(ast):
    text=json.dumps(ast)
    return {key: '{{after.normalized.' + key + '}}' for key in ['id','windowStart','windowEnd','today','tomorrow'] if ':' + key + '"' in text}
def pipeline(name, datasets, gate=None):
    op('service.' + name, 'create_service', name=name, service_type='webhook_in', base_url='mero://inbound/' + name, auth_type='none', settings={'public': False}, description='WorkGetsDone BYOF service; scoped ownership queries and explicit parameter normalization.')
    rule(name + '.normalize', name, 'post_save', [{'type': 'run_function', 'params': {'function_id': ref('function.normalize'), 'payload': '{{payload}}'}}], priority=-100)
    priority=-90
    if gate is not None:
        gate_id=query(name.replace('.', '_') + '_gate', gate)
        rule(name + '.gate', name, 'post_save', [require(gate_id, parameters(gate)), setfields({'gatePassed': True})], priority=priority, condition=guarded(name, {'var': 'after.valid'})); priority+=1
    expected=[]
    for key, ast, count_only in datasets:
        expected.append({'key':key,'count':count_only})
        stem=name.replace('.', '_') + '_' + key
        dataset=aggregate(ast) if count_only else deepcopy(ast)
        # Fetch a sentinel row past the bound rather than silently truncate.
        if not count_only: dataset['limit']=1001
        q_id=query(stem + ('_count' if count_only else '_rows'),dataset)
        capture={**require(q_id,parameters(ast)),'result_field':key+'Rows','allow_empty':True}
        rule(name+'.'+key+'.dataset',name,'post_save',[capture],priority=priority,condition=guarded(name,{'var':'after.valid'}));priority+=1
    gate_condition=[{'or':[{'!':{'var':'after.valid'}},{'var':'after.gatePassed'}]}] if gate else []
    rule(name + '.respond', name, 'response', [{'type':'patch_response','patches':[{'op':'replace','path':'/status_code','value':503},{'op':'replace','path':'/body','value':{'error':{'message':'This information could not be loaded. Please try again.'}}}]}, {'type':'run_function','params':{'function_id':ref('function.respond'),'name':name,'expected':expected}}, {'type':'patch_response','patches':[{'op':'replace','path':'/status_code','value':'{{after.resultStatus}}'},{'op':'replace','path':'/body','value':'{{after.result}}'}]}], condition=guarded(name,*gate_condition))

for function in ['normalize','respond']:
    op('function.' + function, 'create_function', name='byof-' + function, source=(ROOT / ('services/' + function + '.ts')).read_text(), idempotency_key='wgd-byof-' + function + '-v1')

window=lambda kind: [condition(kind,'start_date','>=',':windowStart'),condition(kind,'start_date','<',':windowEnd')]
today=lambda kind: [condition(kind,'start_date','>=',':today'),condition(kind,'start_date','<',':tomorrow')]
overdue=lambda: [condition('task','end_date','<',':today')]
pipeline('dashboard.stats', [
    ('todayTasks',data_query('task',today('task'),True),True),('todayCalls',data_query('call',today('call'),True),True),
    ('overdue',data_query('task',overdue(),True),True),('openTasks',data_query('task',opened=True),True),('openCalls',data_query('call',opened=True),True),
    ('unbilledCalls',data_query('call',[condition('call','billable','=',True),group(condition('call','billed','is_null'),condition('call','billed','!=',True),combinator='or')]),True),
    ('activeProjects',data_query('project',opened=True),True)])
contexts=[('companies',data_query('company'),False),('contacts',data_query('contact'),False),('projects',data_query('project'),False)]
pipeline('dashboard.agenda',[('tasks',data_query('task',window('task'),True),False),('calls',data_query('call',window('call'),True),False),('overdue',data_query('task',overdue(),True),False),*contexts])
pipeline('dashboard.rollup',[('projects',data_query('project',opened=True),False),('companies',data_query('company'),False),('taskRollups',rollup_query('task'),False),('callRollups',rollup_query('call'),False),('noteRollups',rollup_query('note'),False)])
project_gate=data_query('project',[condition('project','key','=',':id')]);project_gate['limit']=1
in_project=lambda kind: [group(*[condition(alias,'project','=',':id') for alias in [kind,*({'call':['t'],'note':['t','cl'],'note_file':['n','t','cl']}.get(kind,[]))]],combinator='or')]
project_sets=[('tasks',data_query('task',in_project('task')),False),('calls',data_query('call',in_project('call')),False),('notes',data_query('note',in_project('note')),False),('files',data_query('note_file',in_project('note_file')),False)]
pipeline('projects.read', [('project',project_gate,False),*contexts,
    ('openTasks',data_query('task',in_project('task'),True),True),('overdue',data_query('task',in_project('task')+overdue(),True),True),('openCalls',data_query('call',in_project('call'),True),True),
    ('notes',data_query('note',in_project('note'),True),True),('files',data_query('note_file',in_project('note_file')),True),
    ('unbilledCalls',data_query('call',in_project('call')+[condition('call','billable','=',True),group(condition('call','billed','is_null'),condition('call','billed','!=',True),combinator='or')]),True),
    ('projectWritable',add_where(deepcopy(BASE['project_writable']),condition('project','key','=',':id')),True)],gate=project_gate)
timeline_writable=[]
for kind in ['task','call','note']:
    ast=deepcopy(BASE[kind+'_writable']);ast['select']=[field(kind,'key')];ast['distinct']=True;ast['limit']=1000
    add_where(ast,condition(kind,'deleted_at','is_null'),*in_project(kind))
    timeline_writable.append((kind+'Writable',ast,False))
pipeline('projects.timeline', [*project_sets,*contexts,*timeline_writable], gate=project_gate)
def search_query(kind):
    ast=data_query(kind)
    fields={'key','company','name','first_name','last_name','subject','description'}
    ast['select']=[item for item in ast['select'] if item.get('fieldName') in fields]
    return ast
pipeline('search', [('companies',search_query('company'),False),('contacts',search_query('contact'),False),('projects',search_query('project'),False),('tasks',search_query('task'),False),('calls',search_query('call'),False),('notes',search_query('note'),False)])

if __name__=='__main__':
    output=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/wgd-frontend-plan.json')
    budgets={}
    for item in OPS:
        if item['name']=='create_rule':
            body=item['arguments']['body'];service=body['scope']['service_config_id']['$ref']
            key=service+':'+body['phase'];budgets[key]=budgets.get(key,0)+len(body['actions'])
    # The unchanged Google inbound rules consume four post_save actions.
    assert all(n+(4 if key.endswith(':post_save') else 0)<=20 for key,n in budgets.items()),budgets
    output.write_text(json.dumps({'buildLog':str(ROOT.parent/'BUILD_LOG.md'),'operations':OPS},indent=2)+'\n')
    print(f'{len(OPS)} operations written to {output}')
