import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),W=require('../../verification/harness/wgd.js');
const root=new URL('../../',import.meta.url),services=JSON.parse(readFileSync(new URL('frontend/public/services.json',root),'utf8')).services,checks=[];
const check=(name,pass,evidence={})=>{checks.push({name,pass:!!pass,evidence});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(evidence)}`);if(!pass)throw Error(name);};
async function call(actor,name,input={}){const r=await fetch(`${W.BASE}/api/v1/services/${services[name]}/inbound`,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',...(actor?{Cookie:Object.entries(actor.jar).map(([k,v])=>`${k}=${v}`).join('; ')}:{})},body:JSON.stringify(input)});return {status:r.status,body:await r.json().catch(()=>null)};}
async function actor(name){const path=`/tmp/wgd-byof-${name}.session.json`;try{const cached=JSON.parse(readFileSync(path,'utf8'));if((await call(cached,'session.current')).status===200)return cached;}catch{}const line=readFileSync(new URL(`.env-${name}`,root),'utf8').split('\n').find(s=>s.startsWith(`${name.toUpperCase()}_PASSWORD=`));const session=await W.login(`${name}@workgetsdone.test`,line.slice(line.indexOf('=')+1).replace(/^['"]|['"]$/g,'').trim());writeFileSync(path,JSON.stringify(session),{mode:0o600});return session;}
let failure;
try{
 const bob=await actor('bob'),jane=await actor('jane');
 for(const collection of ['projects','tasks','calls','notes']){
  const name=collection+'.list';let bobRows,janeRows;
  for(const [user,session] of [['bob',bob],['jane',jane]]){
   const result=await call(session,name,{includeClosed:true});check(`${user}: ${name}`,result.status===200&&Array.isArray(result.body?.data?.items),{status:result.status,total:result.body?.data?.total,error:result.body?.error});
   const data=result.body.data;if(user==='bob')bobRows=data.items;else janeRows=data.items;
   const open=await call(session,name);check(`${user}: ${name} open filter`,open.status===200&&open.body.data.items.every(row=>!row.completed&&!row.archived),{total:open.body?.data?.total});
   const next=await call(session,name,{includeClosed:true,cursor:25});check(`${user}: ${name} pagination`,next.status===200&&!next.body.data.items.some(row=>data.items.some(first=>first.id===row.id)),{rows:next.body?.data?.items?.length});
   const search=await call(session,name,{query:'__no_matching_record_20261008__'});check(`${user}: ${name} search`,search.status===200&&search.body.data.total===0);
  }
  const anonymous=await call(null,name);check(`anonymous: ${name} denied`,[401,403,404].includes(anonymous.status),{status:anonymous.status});
  const row=bobRows.find(row=>!janeRows.some(other=>row.id===other.id));check(`${collection}: private record available for read checks`,!!row);
  const detail=await call(bob,collection+'.read',{id:row.id});check(`bob: ${collection}.read`,detail.status===200&&detail.body?.data?.id===row.id,{status:detail.status});
  const denied=await call(jane,collection+'.read',{id:row.id});check(`jane: ${collection}.read denied`,denied.status===404,{status:denied.status});
  const missing=await call(bob,collection+'.read',{id:'ffffffff-ffff-4fff-8fff-ffffffffffff'});check(`${collection}: unknown detail`,missing.status===404,{status:missing.status});
  const invalid=await call(bob,collection+'.read',{id:'invalid'});check(`${collection}: invalid identifier`,invalid.status===422,{status:invalid.status});
 }
}catch(e){failure=e.message;console.error(failure);}
finally{const file='verification/2026-10-08-frontend/navigation-api-results.json';writeFileSync(new URL(file,root),JSON.stringify({at:new Date().toISOString(),checks,failure:failure||null},null,2)+'\n');appendFileSync(new URL('BUILD_LOG.md',root),`\n\n### ${new Date().toISOString()} — Navigation API verification\n\n${checks.filter(c=>c.pass).length}/${checks.length} checks passed. ${file}. ${failure?'FAILED: '+failure:''}\n`);}
if(failure)process.exit(1);
