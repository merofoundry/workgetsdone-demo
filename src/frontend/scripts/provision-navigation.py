"""Author only the seven additional navigation services; existing rules stay active."""
import importlib.util
import json
import sys
from pathlib import Path
from copy import deepcopy
spec=importlib.util.spec_from_file_location('services',Path(__file__).with_name('provision-services.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
s.OPS.clear()
ids={'function.normalize':'b83e7be5-b091-4739-b3cf-17b2322ff51d','function.respond':'387414ee-253f-4568-a084-d81df2c815b3'}
s.op('navigation.respond.v1','update_function',function_id=ids['function.respond'],source=(s.ROOT/'services/respond.ts').read_text(),idempotency_key='wgd-navigation-respond-v1')
s.pipeline('projects.list',[('projects',s.data_query('project'),False),('companies',s.data_query('company'),False),('taskRollups',s.rollup_query('task'),False),('callRollups',s.rollup_query('call'),False),('noteRollups',s.rollup_query('note'),False)])
for kind in ['task','call','note']:
 for mode in ['list','read']:
  extras=[s.condition(kind,'key','=',':id')] if mode=='read' else []
  ast=s.data_query(kind,extras)
  writable=deepcopy(s.BASE[kind+'_writable']);writable['select']=[s.field(kind,'key')];writable['distinct']=True
  s.add_where(writable,s.condition(kind,'deleted_at','is_null'),*extras)
  s.pipeline(kind+'s.'+mode,[(kind+'s',ast,False),*s.contexts,(kind+'Writable',writable,False)])
def resolve(value):
 if isinstance(value,list):return [resolve(x) for x in value]
 if isinstance(value,dict):
  if value.get('$ref') in ids:return ids[value['$ref']]
  return {k:resolve(v) for k,v in value.items()}
 return value
budgets={}
for operation in s.OPS:
 if operation['name']=='create_rule':
  body=operation['arguments']['body'];key=body['scope']['service_config_id']['$ref']+':'+body['phase'];budgets[key]=budgets.get(key,0)+len(body['actions'])
assert all(n+(5 if k.endswith(':post_save') else 2)<=20 for k,n in budgets.items()),budgets
output=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/wgd-navigation-plan.json')
output.write_text(json.dumps({'buildLog':str(s.ROOT.parent/'BUILD_LOG.md'),'operations':resolve(s.OPS)},indent=2)+'\n')
print(f'{len(s.OPS)} operations; maximum post_save actions including existing rules: {max(v+5 for k,v in budgets.items() if k.endswith(":post_save"))}')
