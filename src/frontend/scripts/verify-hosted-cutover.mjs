import './stage-guard.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
// Hosted smoke of every route as bob (desktop 1280x900) and jane (mobile 375x812). Two logins in total.
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const base = process.env.WGD_BASE;
const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : '';
const checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, evidence: detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); if (!passed) throw new Error(name); };
const passwordFor = name => {
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(l => l.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  if (!line) throw new Error(`Missing ${name} verification credential`);
  return line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim();
};
mkdirSync(evidence, { recursive: true });
const registry = JSON.parse(readFileSync(new URL('frontend/public/services.json', root), 'utf8')).services;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
const actors = [
  { name: 'bob', key: 'bob', viewport: { width: 1280, height: 900 }, admin: true, desktop: true },
  { name: 'jane', key: 'jane', viewport: { width: 375, height: 812 }, admin: false },
  // Task 25 fix round 1: bob at phone width over a detail page of each shape, the admin table and an attachment.
  { name: 'bob', key: 'bob-mobile', viewport: { width: 375, height: 812 }, admin: true, labels: ['project', 'task', 'admin-users', 'file'] },
].filter(a => !only || a.key === only);
const browser = await chromium.launch({ headless: true });
let failure;
try {
  for (const actor of actors) {
    const context = await browser.newContext({ viewport: actor.viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push('pageerror: ' + error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
    await page.addInitScript(() => {
      window.wgdCspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.wgdCspViolations.push(event.violatedDirective));
    });
    await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill(`${actor.name}@workgetsdone.test`);
    await page.getByLabel('Password', { exact: true }).fill(passwordFor(actor.name));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: /^Account:/ }).waitFor();
    check(`${actor.key}: signed in`, true, { viewport: actor.viewport });
    const post = async (name, input = {}) => {
      const r = await context.request.post(`${base}/api/v1/services/${registry[name]}/inbound`, { data: input, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      return { status: r.status(), body: await r.json().catch(() => null) };
    };
    const first = async (name, input = {}) => { const r = await post(name, input); return r.body?.data?.items?.[0]?.id; };
    const ids = { company: await first('companies.list'), contact: await first('contacts.list'), project: await first('projects.list', { includeClosed: true }), task: await first('tasks.list'), note: await first('notes.list') };
    // jane owns little: a kind with no visible row is skipped (listed in the evidence), bob must see every kind.
    const missing = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
    check(`${actor.key}: first records found${missing.length ? ' (skipping ' + missing.join(', ') + ')' : ''}`, actor.admin ? missing.length === 0 : true, { ...ids, skipped: missing });
    const allRoutes = [['/', 'overview'], ['/calendar', 'calendar'], ['/companies', 'companies'], [`/companies/${ids.company}`, 'company'], ['/contacts', 'contacts'], [`/contacts/${ids.contact}`, 'contact'],
      ['/projects', 'projects'], [`/projects/${ids.project}`, 'project'], ['/tasks', 'tasks'], [`/tasks/${ids.task}`, 'task'], ['/calls', 'calls'], ['/notes', 'notes'], [`/notes/${ids.note}`, 'note'], ['/account', 'account'], ['/admin/users', 'admin-users']];
    const kindOf = { company: /^\/companies\/[0-9a-f-]{36}$/, contact: /^\/contacts\/[0-9a-f-]{36}$/, project: /^\/projects\/[0-9a-f-]{36}$/, task: /^\/tasks\/[0-9a-f-]{36}$/, note: /^\/notes\/[0-9a-f-]{36}$/ };
    const routes = allRoutes.filter(([, label]) => !actor.labels || actor.labels.includes(label)).filter(([route]) => !missing.some(k => kindOf[k].test(route)) && !/\/undefined$/.test(route));
    if (actor.admin) {
      const projects = await post('projects.list', { includeClosed: true });
      let fileId = null;
      for (const project of projects.body?.data?.items ?? []) {
        const timeline = await post('projects.timeline', { id: project.id, kind: 'files', includeClosed: true });
        const entry = timeline.body?.data?.entries?.find(e => e.kind === 'file');
        if (entry) { fileId = entry.id; break; }
      }
      check('bob: found an attachment to open', !!fileId, { fileId });
      if (!actor.labels || actor.labels.includes('file')) routes.push([`/files/${fileId}`, 'file']);
    }
    for (const [route, label] of routes) {
      errors.length = 0;
      for (let attempt = 1; ; attempt++) {
        try { await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 60000 }); break; }
        catch (error) { if (attempt === 2) throw error; console.log(`retry ${route} after ${error.message.split('\n')[0]}`); }
      }
      const expectMissing = !actor.admin && route === '/admin/users';
      if (expectMissing) {
        await page.getByText('This page could not be found.').waitFor({ timeout: 30000 });
        check(`${actor.key} ${route}: not-found state shown`, true, {});
      } else {
        await page.locator('.page-header h1').first().waitFor({ timeout: 60000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        const text = await page.locator('body').innerText();
        check(`${actor.key} ${route}: header visible, no "could not be found"`, !/could not be found/i.test(text), { header: (await page.locator('.page-header h1').first().innerText()).slice(0, 60) });
      }
      const csp = await page.evaluate(() => window.wgdCspViolations);
      check(`${actor.key} ${route}: no console errors, zero CSP violations`, errors.length === 0 && csp.length === 0, { errors, csp });
      if (actor.viewport.width <= 375) check(`${actor.key} ${route}: fits ${actor.viewport.width}px`, await page.evaluate(w => document.documentElement.scrollWidth <= w, actor.viewport.width), {});
      await page.screenshot({ path: new URL(`cutover${tag}-${actor.key}-${label}.png`, evidence).pathname, fullPage: true });
    }
    if (actor.desktop) {
      // Evidence for the UI-17 data-drift note: the roster the admin table should render right now.
      const roster = await post('users.list', {});
      check('bob: users.list roster (admin table source)', roster.status === 200, { names: (roster.body?.data?.users ?? roster.body?.data?.items ?? []).map(u => u.displayName) });
      // Task 25: keyboard focus on a detail page, then light and dark screenshots of the restyled pages.
      const visible = f => (f.outlineStyle !== 'none' && parseFloat(f.outlineWidth) > 0) || (f.boxShadow && f.boxShadow !== 'none');
      const settle = async route => { await page.goto(base + route, { waitUntil: 'domcontentloaded' }); await page.locator('.page-header h1').first().waitFor({ timeout: 60000 }); await page.waitForLoadState('networkidle').catch(() => {}); await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); }); };
      const sample = () => page.evaluate(() => { const el = document.activeElement; const c = getComputedStyle(el); return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), outlineStyle: c.outlineStyle, outlineWidth: c.outlineWidth, outlineColor: c.outlineColor, boxShadow: c.boxShadow }; });
      // Tabs until the focused element matches `selector` (at most 90 stops) and returns its computed ring.
      const tabTo = async selector => { for (let i = 1; i <= 90; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(sel => document.activeElement?.matches(sel), selector)) return { stops: i, selector, ...(await sample()) }; } return { selector, notReached: true, outlineStyle: 'none', outlineWidth: '0px', boxShadow: 'none' }; };
      const probes = async mode => {
        const out = [];
        await settle(`/projects/${ids.project}`);
        for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); out.push({ stops: i + 1, selector: 'first six', ...(await sample()) }); }
        await settle(`/projects/${ids.project}`); out.push({ target: 'timeline chip', ...(await tabTo('[role="radio"]')) });
        await settle(`/projects/${ids.project}`); out.push({ target: 'QuickAdd input', ...(await tabTo('#quick-note')) });
        await settle('/projects'); out.push({ target: 'list row link', ...(await tabTo('a.record-project')) });
        await settle('/tasks'); out.push({ target: 'filter select', ...(await tabTo('select')) });
        await settle('/tasks'); out.push({ target: 'filter checkbox', ...(await tabTo('input[type="checkbox"]')) });
        await settle(`/projects/${ids.project}`);
        await page.getByRole('button', { name: /^New task/ }).first().click(); await page.getByRole('dialog').waitFor();
        out.push({ target: 'dialog button', ...(await tabTo('dialog button')) });
        await page.keyboard.press('Escape');
        check(`bob ${mode}: keyboard focus shows an outline or box-shadow on the first six stops, a chip, an input, a list row link, a select, a checkbox and a dialog button`, out.every(visible), out);
      };
      await probes('light');
      await page.getByRole('button', { name: 'Toggle dark mode' }).click();
      check('bob: dark toggle sets html.dark', await page.evaluate(() => document.documentElement.classList.contains('dark')), {});
      await probes('dark');
      await page.getByRole('button', { name: 'Toggle dark mode' }).click();
      const shot = async (label, route) => { await page.goto(base + route, { waitUntil: 'domcontentloaded' }); await page.locator('.page-header h1').first().waitFor({ timeout: 60000 }); await page.waitForLoadState('networkidle').catch(() => {}); await page.screenshot({ path: new URL(`restyle-${label}.png`, evidence).pathname, fullPage: true }); };
      const pages = [['overview', '/'], ['project', `/projects/${ids.project}`], ['tasks', '/tasks'], ['account', '/account']];
      for (const [label, route] of pages) await shot(`${label}-light`, route);
      await page.getByRole('button', { name: 'Toggle dark mode' }).click();
      for (const [label, route] of pages) await shot(`${label}-dark`, route);
      await page.getByRole('button', { name: 'Toggle dark mode' }).click();
      // Signed-out sign-in page in both schemes; with nothing stored the scheme follows prefers-color-scheme.
      for (const scheme of ['light', 'dark']) {
        const anon = await browser.newContext({ viewport: actor.viewport, colorScheme: scheme }); const anonPage = await anon.newPage();
        await anonPage.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' }); await anonPage.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
        check(`sign-in follows prefers-color-scheme ${scheme} on first visit`, (await anonPage.evaluate(() => document.documentElement.classList.contains('dark'))) === (scheme === 'dark'), {});
        await anonPage.screenshot({ path: new URL(`restyle-sign-in-${scheme}.png`, evidence).pathname, fullPage: true }); await anon.close();
      }
    }
    await context.close();
  }
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL(`hosted-cutover${tag}-results.json`, evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted cutover smoke${tag ? ' (' + tag + ')' : ''}\n\n${checks.filter(c => c.passed).length}/${checks.length} checks passed against ${base} (bob 1280x900, jane 375x812). Evidence: verification/2026-10-11-full-build/hosted-cutover${tag}-results.json and cutover${tag}-<actor>-<route>.png.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
