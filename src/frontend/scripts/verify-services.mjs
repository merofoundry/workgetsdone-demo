import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../../verification/harness/wgd.js');
const root = new URL('../../', import.meta.url);
const summary = JSON.parse(readFileSync(new URL('verification/2026-10-08-frontend/authoring-summary.json',root),'utf8'));
const services = {'session.current':'54a9f902-ddf5-439f-9a94-910e594e0bf6'};
for (const group of [summary.frontend, summary.write]) for (const [key, value] of Object.entries(group)) if (key.startsWith('service.') && value.ok) services[key.slice(8)] = value.id;
const checks=[];
const mode=process.argv.includes('--cleanup')?'cleanup':process.argv.includes('--writes')?'writes':'reads';
const fixtures=(()=>{try{return JSON.parse(readFileSync(new URL('verification/2026-10-08-frontend/service-fixtures.json',root),'utf8'));}catch{return [];}})();
const check=(name,pass,evidence={})=>{checks.push({name,pass:!!pass,evidence});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(evidence)}`);if(!pass)throw new Error(name);};
export async function call(actor,name,input={}){
 const response=await fetch(`${W.BASE}/api/v1/services/${services[name]}/inbound`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',...(actor?{Cookie:Object.entries(actor.jar).map(([k,v])=>`${k}=${v}`).join('; ')}:{})},body:JSON.stringify(input)});
 return {status:response.status,body:await response.json().catch(()=>null)};
}
async function actor(name){
 const path=`/tmp/wgd-byof-${name}.session.json`;
 try{const cached=JSON.parse(readFileSync(path,'utf8'));if((await call(cached,'session.current')).status===200)return cached;}catch{}
 const line=readFileSync(new URL(`.env-${name}`,root),'utf8').split('\n').find(line=>line.startsWith(`${name.toUpperCase()}_PASSWORD=`));
 const session=await W.login(`${name}@workgetsdone.test`,line.slice(line.indexOf('=')+1).replace(/^['"]|['"]$/g,'').trim());
 writeFileSync(path,JSON.stringify(session),{mode:0o600});return session;
}
const baselineCache=new Map();
async function visible(session,name){
 if(!baselineCache.has(session.recordId)){
  const journal=JSON.parse(readFileSync('/tmp/wgd-services-baseline-journal.json','utf8'));
  services.__baseline=journal['verify.baseline.service'].data.id;
  const result=await call(session,'__baseline');
  if(result.status!==200||!result.body?.data)throw new Error(`Baseline service: ${result.status}`);
  baselineCache.set(session.recordId,result.body.data);
 }
 const rows=baselineCache.get(session.recordId)[name==='visible_tasks_all_keyed'?'tasks':'projects'];
 if(!Array.isArray(rows))throw new Error('Baseline rows missing');
 return Array.from(new Map(rows.map(row=>[row.key||row.id,row])).values());
}
const success=result=>result.status===200&&result.body?.data;
let failure;
try{
 const bob=await actor('bob'),jane=await actor('jane');
 const rollup=await call(bob,'dashboard.rollup',{limit:25});
 check('Bob rollup loads',success(rollup)&&Array.isArray(rollup.body.data.projects),{status:rollup.status,count:rollup.body?.data?.projects?.length,error:rollup.body?.error});
 const projects=rollup.body.data.projects;
 const project=projects[0];check('Bob has a project for detail verification',!!project);
 const id=project.id;
 if(mode==='reads'){
  for(const [name,session] of [['bob',bob],['jane',jane]]){
   const current=await call(session,'session.current');check(`${name}: current session unaffected`,success(current)&&current.body.data.id===session.recordId,{status:current.status});
   const stats=await call(session,'dashboard.stats');check(`${name}: stats`,success(stats)&&typeof stats.body.data.openTasks==='number',{status:stats.status,data:stats.body?.data,error:stats.body?.error});
   const baselineTasks=await visible(session,'visible_tasks_all_keyed');
   const openTasks=baselineTasks.filter(row=>!row.deleted_at&&row.completed!==true&&row.completed!=='true');
   check(`${name}: exact open-task total matches established ownership query`,stats.body.data.openTasks===openTasks.length,{service:stats.body.data.openTasks,baseline:openTasks.length});
   const agenda=await call(session,'dashboard.agenda');check(`${name}: agenda, including empty datasets`,success(agenda)&&Array.isArray(agenda.body.data.items)&&Array.isArray(agenda.body.data.overdue),{status:agenda.status,items:agenda.body?.data?.items?.length,overdue:agenda.body?.data?.overdue?.length,error:agenda.body?.error});
   const rollup=await call(session,'dashboard.rollup',{limit:25});check(`${name}: rollup`,success(rollup)&&Array.isArray(rollup.body.data.projects),{status:rollup.status,total:rollup.body?.data?.total,error:rollup.body?.error});
   const baselineProjects=await visible(session,'visible_projects_all_keyed');
   const active=baselineProjects.filter(row=>!row.deleted_at&&row.archived!==true&&row.archived!=='true');
   check(`${name}: project total matches ownership query`,rollup.body.data.total===active.length,{service:rollup.body.data.total,baseline:active.length});
   const search=await call(session,'search',{query:project.name.slice(0,10),kinds:['projects'],limit:25});check(`${name}: scoped search`,success(search)&&Array.isArray(search.body.data.matches),{status:search.status,count:search.body?.data?.matches?.length,error:search.body?.error,bodyKeys:Object.keys(search.body||{})});
  }
  for(const serviceName of Object.keys(services).filter(name=>name.startsWith('dashboard.')||name.startsWith('projects.')||name==='search')){
   const result=await call(null,serviceName,{id});check(`anonymous: ${serviceName} denied`,[401,403,404].includes(result.status),{status:result.status});
  }
  const detail=await call(bob,'projects.read',{id});check('Bob project detail',success(detail)&&detail.body.data.id===id,{status:detail.status,error:detail.body?.error,permissions:detail.body?.data?.permissions});
  for(const kind of ['everything','tasks','calls','notes','files']){
   const result=await call(bob,'projects.timeline',{id,kind,includeClosed:true});check(`Bob timeline ${kind}`,success(result)&&Array.isArray(result.body.data.entries)&&(kind==='everything'||result.body.data.entries.every(entry=>entry.kind+'s'===kind)),{status:result.status,entries:result.body?.data?.entries?.length,error:result.body?.error});
   if(result.body?.data?.nextCursor){const next=await call(bob,'projects.timeline',{id,kind,includeClosed:true,cursor:result.body.data.nextCursor});check(`Bob timeline ${kind} pagination`,success(next)&&!next.body.data.entries.some(entry=>result.body.data.entries.some(first=>first.id===entry.id)),{status:next.status});}
  }
  for(const name of ['projects.read','projects.timeline']){
   const denied=await call(jane,name,{id});check(`Jane cannot read Bob project through ${name}`,denied.status===404,{status:denied.status});
   const missing=await call(bob,name,{id:'ffffffff-ffff-4fff-8fff-ffffffffffff'});check(`Unknown project ${name} denied`,missing.status===404,{status:missing.status});
   const invalid=await call(bob,name,{id:'invalid'});check(`Malformed id ${name} refused`,invalid.status===422,{status:invalid.status});
  }
  for(const input of [{sort:'name'},{current_user_id:bob.recordId},{actor_id:bob.recordId}]){
   const result=await call(bob,'dashboard.stats',input);check(`Invalid/reserved input ${Object.keys(input)[0]} refused`,result.status===422,{status:result.status});
  }
 }else if(mode==='writes'){
  const detail=await call(bob,'projects.read',{id});check('Write fixture project is writable',success(detail)&&detail.body.data.permissions.write,{status:detail.status});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  for(const kind of ['task','call','note']){
   const title=`BYOF service verification ${stamp} ${kind}`;
   const payload={title,body:'Temporary service verification fixture',projectId:id,startAt:new Date().toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),billable:false};
   const denied=await call(jane,kind+'s.create',payload);check(`Jane cannot create ${kind} on Bob project`,denied.status===404,{status:denied.status});
   const anonymous=await call(null,kind+'s.create',payload);check(`Anonymous ${kind} create denied`,[401,403,404].includes(anonymous.status),{status:anonymous.status});
   const invalid=await call(bob,kind+'s.create',{...payload,title:''});check(`Empty ${kind} title refused`,invalid.status===422,{status:invalid.status});
   appendFileSync(new URL('BUILD_LOG.md',root),`\n- ${new Date().toISOString()} — Attempt temporary ${kind} create via consumer service; title ${title}.\n`);
   const created=await call(bob,kind+'s.create',payload);check(`Bob creates ${kind}`,success(created)&&created.body.data.ok===true,{status:created.status,error:created.body?.error});
   const timeline=await call(bob,'projects.timeline',{id,kind:kind+'s',includeClosed:true});
   const entry=timeline.body?.data?.entries?.find(entry=>entry.title===title);check(`${kind} persisted and writable in timeline`,success(timeline)&&entry?.canWrite&&typeof entry?.id==='string'&&/^[0-9a-f-]{36}$/i.test(entry.id),{status:timeline.status});
   fixtures.push({kind,id:entry.id,title,projectId:id});
   writeFileSync(new URL('verification/2026-10-08-frontend/service-fixtures.json',root),JSON.stringify(fixtures,null,2));
   const changes=kind==='note'?['archive','unarchive']:['complete','reopen'];
   for(const action of changes){
    const denied=await call(jane,`${kind}s.${action}`,{id:entry.id});check(`Jane ${kind} ${action} denied`,denied.status===404,{status:denied.status});
    const changed=await call(bob,`${kind}s.${action}`,{id:entry.id});check(`Bob ${kind} ${action}`,success(changed)&&changed.body.data.ok===true,{status:changed.status,error:changed.body?.error});
    const next=await call(bob,'projects.timeline',{id,kind:kind+'s',includeClosed:true});const persisted=next.body?.data?.entries?.find(item=>item.id===entry.id);
    check(`${kind} ${action} persisted`,!!persisted&&persisted[kind==='note'?'archived':'completed']===(action==='archive'||action==='complete'));
   }
  }
 }else{
  const journal=JSON.parse(readFileSync('/tmp/wgd-services-baseline-journal.json','utf8'));
  services.__baseline=journal['verify.baseline.service'].data.id;
  const discovery=await call(bob,'__baseline');check('Fixture discovery is actor-scoped',success(discovery)&&!!discovery.body.data.fixtures,{status:discovery.status});
  const known=new Set(fixtures.map(fixture=>fixture.title));let cleaned=0;
  for(const [kind,rows] of Object.entries(discovery.body.data.fixtures))for(const row of rows){
   const title=row.name||row.subject||row.description;
   check('Cleanup targets only this verification run',known.has(title),{kind});
   const fixture=fixtures.find(fixture=>fixture.title===title);fixture.nativeId=row.id;
   appendFileSync(new URL('BUILD_LOG.md',root),`\n- ${new Date().toISOString()} — Attempt soft-delete of temporary ${kind} ${row.id}; title ${title}.\n`);
   const result=await call(bob,'__baseline',{operation:'cleanup',kind,fixtureId:row.id});
   check(`Temporary ${kind} cleanup`,success(result)&&result.body.data.ok===true,{status:result.status,error:result.body?.error});
   fixture.cleaned=true;cleaned++;
  }
  writeFileSync(new URL('verification/2026-10-08-frontend/service-fixtures.json',root),JSON.stringify(fixtures,null,2));
  const after=await call(bob,'__baseline');
  check('All temporary fixtures hidden by soft-delete',success(after)&&Object.values(after.body.data.fixtures).every(rows=>rows.length===0),{cleaned});
 }
}catch(error){failure=error.message;console.error(failure);}
finally{
 const filename=`verification/2026-10-08-frontend/services-${mode}-results.json`;
 writeFileSync(new URL(filename,root),JSON.stringify({at:new Date().toISOString(),checks,failure:failure||null},null,2));
 appendFileSync(new URL('BUILD_LOG.md',root),`\n\n### ${new Date().toISOString()} — Production frontend service ${mode} verification\n\n${checks.filter(check=>check.pass).length}/${checks.length} checks passed. Evidence: ${filename}.\n${failure?`FAILED: ${failure}\n`:''}`);
}
if(failure)process.exit(1);
