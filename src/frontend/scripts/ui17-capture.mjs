import './stage-guard.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// UI-17 capture: node scripts/ui17-capture.mjs before|after. Logs in as bob and jane (two logins) and records, per route,
// the sorted data-record-id values present and the sorted accessible names of visible buttons, links and menu items
// (taken from the page's ARIA snapshot, which lists only rendered, accessible elements).
// Volatile text: every run of digits inside a name is masked to "#", so dates, times and counts that change between runs
// ("Oct 9", "3 open") compare equal while the control's presence and wording still compare. Run between :05 and :50 of an hour.
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) { console.error('Usage: node scripts/ui17-capture.mjs before|after'); process.exit(2); }
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const base = process.env.WGD_BASE;
mkdirSync(evidence, { recursive: true });
const passwordFor = name => {
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(l => l.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  if (!line) throw new Error(`Missing ${name} verification credential`);
  return line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim();
};
const registry = JSON.parse(readFileSync(new URL('frontend/public/services.json', root), 'utf8')).services;
const mask = name => name.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const ROLE = /^\s*- (button|link|menuitem)(?: "((?:[^"\\]|\\.)*)")?/;
const controlsFrom = snapshot => snapshot.split('\n').flatMap(line => { const m = ROLE.exec(line); return m ? [`${m[1]}: ${mask((m[2] ?? '').replace(/\\(.)/g, '$1'))}`] : []; }).sort();
const browser = await chromium.launch({ headless: true });
try {
  for (const actor of [{ name: 'bob', admin: true }, { name: 'jane', admin: false }]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Email', { exact: true }).fill(`${actor.name}@workgetsdone.test`);
    await page.getByLabel('Password', { exact: true }).fill(passwordFor(actor.name));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: /^Account:/ }).waitFor();
    const post = async (name, input = {}) => {
      const r = await context.request.post(`${base}/api/v1/services/${registry[name]}/inbound`, { data: input, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      return r.json().catch(() => null);
    };
    const first = async (name, input = {}) => (await post(name, input))?.data?.items?.[0]?.id;
    const ids = { companies: await first('companies.list'), contacts: await first('contacts.list'), projects: await first('projects.list', { includeClosed: true }), tasks: await first('tasks.list'), notes: await first('notes.list') };
    const routes = ['/', '/calendar', '/companies', ids.companies && `/companies/${ids.companies}`, '/contacts', ids.contacts && `/contacts/${ids.contacts}`, '/projects', ids.projects && `/projects/${ids.projects}`,
      '/tasks', ids.tasks && `/tasks/${ids.tasks}`, '/calls', '/notes', ids.notes && `/notes/${ids.notes}`, '/account'];
    if (actor.admin) {
      routes.push('/admin/users');
      let fileId = null;
      for (const project of (await post('projects.list', { includeClosed: true }))?.data?.items ?? []) {
        const entry = (await post('projects.timeline', { id: project.id, kind: 'files', includeClosed: true }))?.data?.entries?.find(e => e.kind === 'file');
        if (entry) { fileId = entry.id; break; }
      }
      if (!fileId) { const note = ids.notes && (await post('notes.read', { id: ids.notes }))?.data; fileId = note?.attachments?.[0]?.id ?? null; }
      if (!fileId) throw new Error('bob: no file id found for /files/<id>');
      routes.push(`/files/${fileId}`);
    }
    const result = { phase, actor: actor.name, base, capturedAt: new Date().toISOString(), maskedDigits: true, routes: {} };
    for (const route of routes.filter(Boolean)) {
      for (let attempt = 1; ; attempt++) {
        try { await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; } catch (error) { if (attempt === 2) throw error; }
      }
      await page.locator('h1').first().waitFor({ timeout: 60000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      const recordIds = [...new Set(await page.locator('[data-record-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-record-id'))))].sort();
      const controls = controlsFrom(await page.locator('body').ariaSnapshot());
      result.routes[route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, '<id>')] = { recordIds, controls };
      console.log(`${actor.name} ${route}: ${recordIds.length} record ids, ${controls.length} controls`);
    }
    writeFileSync(new URL(`ui17-${phase}-${actor.name}.json`, evidence), JSON.stringify(result, null, 2) + '\n');
    await context.close();
  }
} finally { await browser.close(); }
