import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
const root=new URL('../../',import.meta.url),base='https://workgetsdone.merofoundry.app';
const checks=[];const check=(name,pass,evidence={})=>{checks.push({name,pass:!!pass,evidence});console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(evidence)}`);if(!pass)throw new Error(name);};
const browser=await chromium.launch();let failure;
try{
 for(const name of ['bob','jane']){
  const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:'America/New_York'});const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.wgdCsp=[];document.addEventListener('securitypolicyviolation',event=>window.wgdCsp.push(event.violatedDirective));});
  await page.goto(base+'/sign-in');
  const password=readFileSync(new URL(`.env-${name}`,root),'utf8').split('\n').find(line=>line.startsWith(`${name.toUpperCase()}_PASSWORD=`)).split('=').slice(1).join('=').replace(/^['"]|['"]$/g,'').trim();
  await page.getByLabel('Email',{exact:true}).fill(`${name}@workgetsdone.test`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:/^Account:/}).waitFor();
  const registry=await page.request.get(base+'/services.json');const config=await registry.json();check(`${name}: deployed service registry`,Object.keys(config.services).length===23,{services:Object.keys(config.services).length});
  await expect(page.locator('.stat-tile')).toHaveCount(4);
  await expect(page.getByRole('heading',{name:'Next 14 days'})).toBeVisible();
  if(name==='bob')await expect(page.locator('.project-card')).toHaveCount(6);else await expect(page.getByText('No projects you can see yet.')).toBeVisible();
  check(`${name}: Overview reads loaded`,await page.getByText(/could not be loaded/).count()===0,{projects:await page.locator('.project-card').count()});
  await page.screenshot({path:new URL(`verification/2026-10-08-frontend/live-overview-${name}.png`,root).pathname,fullPage:true});
  if(name==='bob'){
   await page.locator('.project-card').first().click();await page.getByRole('heading',{name:'Timeline',exact:true}).waitFor();
   await expect(page.getByLabel('Add a note, or start with /task or /call')).toBeVisible();
   await expect(page.locator('.loading-state')).toHaveCount(0);
   check('Bob Project reads loaded',await page.getByText(/could not be loaded/).count()===0,{entries:await page.locator('.timeline-entry').count()});
   await page.getByRole('radio',{name:/^Tasks/}).click();await expect(page).toHaveURL(/kind=tasks/);
   await page.getByLabel('Add a note, or start with /task or /call').fill('/task Verify dialog wiring');await page.getByRole('button',{name:'Add',exact:true}).click();
   await expect(page.getByRole('dialog',{name:'New task'})).toBeVisible();await expect(page.getByLabel('Task name')).toHaveValue('Verify dialog wiring');await page.keyboard.press('Escape');
   check('Project QuickAdd opens a prelinked create dialog',await page.getByRole('dialog').count()===0);
   await page.screenshot({path:new URL('verification/2026-10-08-frontend/live-project-bob.png',root).pathname,fullPage:true});
   await page.setViewportSize({width:375,height:812});check('Live Project fits mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=375));
   await page.screenshot({path:new URL('verification/2026-10-08-frontend/live-project-mobile.png',root).pathname,fullPage:true});
  }
  await page.setViewportSize({width:1280,height:900});
  for(const collection of ['projects','tasks','calls','notes']){
   const label=collection[0].toUpperCase()+collection.slice(1);
   await page.getByRole('navigation',{name:'Main'}).getByRole('link',{name:label,exact:true}).click();
   await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
   await expect(page.locator('.loading-state')).toHaveCount(0);
   check(`${name}: ${collection} navigation loads`,new URL(page.url()).pathname==='/'+collection&&await page.getByText(/could not be loaded|could not be found/).count()===0,{rows:await page.locator(collection==='projects'?'.record-project':'.entry-title').count()});
   const rows=page.locator(collection==='projects'?'.record-project':'.entry-title');
   if(await rows.count()){
    await rows.first().click();await expect(page.getByRole('heading',{name:collection==='projects'?'Timeline':'Details',exact:true})).toBeVisible();
    await page.reload();await expect(page.getByRole('heading',{name:collection==='projects'?'Timeline':'Details',exact:true})).toBeVisible();
    check(`${name}: ${collection} detail and reload`,await page.getByText(/could not be loaded|could not be found/).count()===0);
    await page.setViewportSize({width:375,height:812});check(`${name}: ${collection} detail mobile`,await page.evaluate(()=>document.documentElement.scrollWidth<=375));
    await page.setViewportSize({width:1280,height:900});
   }
  }
  check(`${name}: no CSP/script errors`,errors.length===0&&(await page.evaluate(()=>window.wgdCsp)).length===0,{errors,csp:await page.evaluate(()=>window.wgdCsp)});
  await page.getByRole('button',{name:/^Account:/}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Sign in to your work'}).waitFor();check(`${name}: logout still works`,new URL(page.url()).pathname==='/sign-in');await context.close();
 }
}catch(error){failure=error.message;console.error(failure);}
finally{await browser.close();const filename='verification/2026-10-08-frontend/hosted-navigation-results.json';writeFileSync(new URL(filename,root),JSON.stringify({at:new Date().toISOString(),checks,failure:failure||null},null,2));appendFileSync(new URL('BUILD_LOG.md',root),`\n\n### ${new Date().toISOString()} — Hosted service-enabled frontend smoke\n\n${checks.filter(check=>check.pass).length}/${checks.length} checks passed. Evidence: ${filename}.\n${failure?`FAILED: ${failure}\n`:''}`);}
if(failure)process.exit(1);
