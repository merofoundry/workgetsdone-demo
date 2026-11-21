import './stage-guard.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const base = process.env.WGD_BASE || 'https://workgetsdone.staging.merofoundry.app';
const checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, evidence: detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); if (!passed) throw new Error(name); };
const passwordFor = name => {
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(line => line.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  if (!line) throw new Error(`Missing ${name} verification credential`);
  return line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim();
};
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failure;
async function signIn(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); page.errors = []; page.on('pageerror', error => page.errors.push(error.message));
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill(`${name}@workgetsdone.test`);
  await page.getByLabel('Password', { exact: true }).fill(passwordFor(name));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  return { context, page };
}
try {
  const bob = await signIn('bob'); const page = bob.page;
  check('bob: signed in', true, { path: new URL(page.url()).pathname });
  const stamp = Date.now().toString(36); const company = `WGD-MATRIX assoc company ${stamp}`; const contactLast = `WGD-MATRIX assoc ${stamp}`; const contact = `Casey ${contactLast}`;
  await page.goto(base + '/companies'); await page.getByRole('button', { name: 'New company' }).click();
  const createCompany = page.getByRole('dialog', { name: 'New company' }); await createCompany.getByLabel('Name', { exact: true }).fill(company); await createCompany.getByRole('button', { name: 'Create company' }).click();
  await page.getByRole('heading', { name: company, exact: true }).waitFor(); const companyPath = new URL(page.url()).pathname;
  await page.goto(base + '/contacts'); await page.getByRole('button', { name: 'New contact' }).click();
  const createContact = page.getByRole('dialog', { name: 'New contact' });
  await createContact.getByLabel('First name', { exact: true }).fill('Casey'); await createContact.getByLabel('Last name', { exact: true }).fill(contactLast); await createContact.getByLabel('Email', { exact: true }).fill(`casey-${stamp}@example.test`);
  await createContact.getByRole('button', { name: 'Create contact' }).click();
  await page.getByRole('heading', { name: contact, exact: true }).waitFor(); const contactPath = new URL(page.url()).pathname;
  check('bob: created a company and a contact', /^\/companies\/[0-9a-f-]{36}$/.test(companyPath) && /^\/contacts\/[0-9a-f-]{36}$/.test(contactPath), { companyPath, contactPath });
  await page.goto(base + companyPath); await page.getByRole('heading', { name: company, exact: true }).waitFor();
  const panel = page.locator('.panel', { has: page.getByRole('heading', { name: 'Associations' }) });
  await page.getByRole('button', { name: 'Link a contact' }).click();
  const link = page.getByRole('dialog', { name: 'Link a contact' });
  await link.getByLabel('Contact', { exact: true }).fill(contactLast); await link.getByRole('button', { name: new RegExp(contactLast) }).click();
  await link.getByLabel('Role').fill('Sponsor'); await link.getByLabel('Primary contact').check(); await link.getByRole('button', { name: 'Link contact' }).click();
  await link.waitFor({ state: 'detached' });
  const row = panel.locator('.subproject', { hasText: contact }); await row.waitFor();
  await row.getByText('Primary', { exact: true }).waitFor();
  check('bob: linked the contact as Sponsor and primary, Primary tag shown', (await row.innerText()).includes('Sponsor'), { row: (await row.innerText()).replace(/\s+/g, ' ') });
  await page.screenshot({ path: new URL('hosted-associations-bob.png', evidence).pathname, fullPage: true });
  await row.getByRole('button', { name: 'Clear primary' }).click();
  await row.getByRole('button', { name: 'Set as primary' }).waitFor(); check('bob: cleared the primary contact', (await row.getByText('Primary', { exact: true }).count()) === 0, {});
  await page.goto(base + contactPath); await page.getByRole('heading', { name: contact, exact: true }).waitFor();
  await page.getByRole('link', { name: company, exact: true }).waitFor(); check('bob: the contact page lists the company', true, {});
  await page.goto(base + companyPath); await page.getByRole('heading', { name: company, exact: true }).waitFor();
  await row.getByRole('button', { name: 'Unlink' }).click(); await page.getByRole('dialog', { name: 'Unlink contact?' }).getByRole('button', { name: 'Confirm' }).click();
  await panel.getByText('No associations yet.').waitFor(); check('bob: unlinked the contact', true, {});
  for (const [path, name, kind] of [[contactPath, contact, 'contact'], [companyPath, company, 'company']]) {
    await page.goto(base + path); await page.getByRole('heading', { name, exact: true }).waitFor();
    await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Delete ${kind}?` }); await dialog.getByRole('button', { name: 'Confirm' }).waitFor();
    await page.waitForFunction(() => { const b = [...document.querySelectorAll('dialog button')].find(el => el.textContent === 'Confirm'); return b && !b.disabled; }, null, { timeout: 30000 });
    await dialog.getByRole('button', { name: 'Confirm' }).click(); await page.waitForURL(url => url.pathname === `/${kind === 'company' ? 'companies' : 'contacts'}`, { timeout: 60000 });
    check(`bob: deleted the ${kind} through the UI`, true, { path: new URL(page.url()).pathname });
  }
  check('no script errors', page.errors.length === 0, { errors: page.errors });
  await bob.context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-associations-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted association UI browser verification (Task 22b)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed. Evidence: ${evidence.pathname.slice(root.pathname.length)}hosted-associations-results.json.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
