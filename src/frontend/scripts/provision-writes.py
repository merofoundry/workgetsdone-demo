from pathlib import Path
from copy import deepcopy
import importlib.util
import json
import sys

spec=importlib.util.spec_from_file_location('provision',Path(__file__).with_name('provision-services.py'))
P=importlib.util.module_from_spec(spec);spec.loader.exec_module(P);P.OPS.clear()
MODELS={'task':'dda81674-76dc-4790-b885-ac8b5d691068','call':'8a3d9382-0ad7-4f18-98d0-cd914707a0c1','note':'ddef37bc-28f6-458a-b30c-6575096e4709'}
def normalized(name): return '{{after.normalized.'+name+'}}'
def service(name):
    P.op('service.'+name,'create_service',name=name,service_type='webhook_in',base_url='mero://inbound/'+name,auth_type='none',settings={'public':False},description='BYOF guarded write; existing record rules and creator grants remain active.')
    P.rule(name+'.normalize',name,'post_save',[{'type':'run_function','params':{'function_id':'b83e7be5-b091-4739-b3cf-17b2322ff51d','payload':'{{payload}}','name':name}}],priority=-100)
    P.rule(name+'.default-response',name,'response',[{'type':'patch_response','patches':[{'op':'replace','path':'/status_code','value':503},{'op':'replace','path':'/body','value':{'error':{'message':'The change could not be saved. Please try again.'}}}]}],priority=-100,condition=P.guarded(name,{'var':'after.guardsPassed'},{'!':{'var':'after.saved'}}))
    P.rule(name+'.invalid-response',name,'response',[{'type':'patch_response','patches':[{'op':'replace','path':'/status_code','value':422},{'op':'replace','path':'/body','value':'{{after.result}}'}]}],priority=-90,condition=P.guarded(name,{'!':{'var':'after.valid'}}))
    P.rule(name+'.success-response',name,'response',[{'type':'patch_response','patches':[{'op':'replace','path':'/status_code','value':200},{'op':'replace','path':'/body','value':{'data':{'ok':True}}}]}],priority=100,condition=P.guarded(name,{'var':'after.saved'}))
for kind,model in MODELS.items():
    name=kind+'s.create';service(name)
    for parent,source in [('projectId','project_writable'),('contactId','visible_contacts_all_keyed')]:
        ast=deepcopy(P.BASE[source]);P.add_where(ast,P.condition(ast['fromAlias'],'key','=',':parent'))
        q=P.query(name.replace('.','_')+'_'+parent+'_guard',ast)
        P.rule(name+'.'+parent+'.guard',name,'post_save',[P.require(q,{'parent':normalized(parent)}),P.setfields({parent+'Validated':True})],priority=-80 if parent=='projectId' else -70,condition=P.guarded(name,{'var':'after.valid'},{'!':{'!':{'var':'after.normalized.'+parent}}}))
    common={'project':normalized('projectId'),'contact':normalized('contactId')}
    if kind=='note':data={**common,'description':normalized('title'),'body':normalized('body'),'occurred_at':normalized('now'),'author':'{{actor.id}}','archived':False}
    else:data={**common,'name' if kind=='task' else 'subject':normalized('title'),'start_date':normalized('startAt'),'end_date':normalized('endAt'),'billable':normalized('billable'),'billed':False,'completed':False,**({'description':normalized('body'),'assignee':'{{actor.id}}'} if kind=='task' else {'callee':normalized('contactId'),'followup':False})}
    # If any parent guard refused, require_query stopped the post-save phase.
    P.rule(name+'.write',name,'post_save',[P.setfields({'guardsPassed':True}),{'type':'create_record','target_model_id':model,'data':data,'trigger_rules':True},P.setfields({'saved':True})],priority=0,condition=P.guarded(name,{'var':'after.valid'},*({'or':[{'!':{'var':'after.normalized.'+parent}},{'var':'after.'+parent+'Validated'}]} for parent in ['projectId','contactId'])))
for kind,field,changes in [('task','completed',[('complete',True),('reopen',False)]),('call','completed',[('complete',True),('reopen',False)]),('note','archived',[('archive',True),('unarchive',False)])]:
    for action,value in changes:
        name=kind+'s.'+action;service(name)
        ast=deepcopy(P.BASE[kind+'_writable']);P.add_where(ast,P.condition(kind,'key','=',':id'),P.condition(kind,'deleted_at','is_null'))
        q=P.query(name.replace('.','_')+'_guard',ast)
        P.rule(name+'.guard',name,'post_save',[P.require(q,{'id':normalized('id')}),P.setfields({'targetId':'{{query_rows.0.id}}'})],priority=-80,condition=P.guarded(name,{'var':'after.valid'}))
        data={field:value}
        if field=='completed':data['completed_at']='{{time.utc_instant}}' if value else None
        P.rule(name+'.write',name,'post_save',[P.setfields({'guardsPassed':True}),{'type':'update_record','target_record_id':'{{after.targetId}}','data':data,'trigger_rules':True},P.setfields({'saved':True})],priority=0,condition=P.guarded(name,{'var':'after.valid'},{'var':'after.targetId'}))
for operation in P.OPS:
    if operation['name']=='create_rule' and operation['key'].endswith('.write'):
        operation['arguments']['body']['settings']={'on_failure':'abort'}
output=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/wgd-write-plan.json');output.write_text(json.dumps({'buildLog':str(P.ROOT.parent/'BUILD_LOG.md'),'operations':P.OPS},indent=2)+'\n');print(f'{len(P.OPS)} write operations written to {output}')
