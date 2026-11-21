import { readFileSync } from 'node:fs';
// Compares ui17-before-<actor>.json with ui17-after-<actor>.json; exits 1 on any difference, printing it.
// ALLOWED_ADDED lists the controls the Task 24 shell deliberately adds on every route (hamburger and theme toggle);
// nothing else may appear or disappear.
// One further tolerance (Task 25 ruling): a route whose before capture had zero record ids may have any set after, because the
// restyle adds data-record-id to list rows, agenda rows and project cards that carried none. Routes that had ids must match exactly.
const evidence = new URL('../../verification/2026-10-11-full-build/', import.meta.url);
const ALLOWED_ADDED = new Set(['button: Toggle sidebar', 'button: Toggle dark mode']);
let failed = false;
const excludeAt = process.argv.indexOf('--exclude');
const excluded = excludeAt > -1 ? process.argv[excludeAt + 1] : undefined;
if (excludeAt > -1 && (!excluded || excluded.startsWith('--'))) { console.log('--exclude needs a route'); process.exit(2); }
if (excluded) console.log(`excluded ${excluded}: Task 26 replaced the route by design (architect ruling, ledger 2026-10-12)`);
for (const actor of ['bob', 'jane']) {
  const load = phase => JSON.parse(readFileSync(new URL(`ui17-${phase}-${actor}.json`, evidence), 'utf8'));
  const before = load('before'), after = load('after');
  for (const route of new Set([...Object.keys(before.routes), ...Object.keys(after.routes)])) {
    if (route === excluded) continue;
    const b = before.routes[route], a = after.routes[route];
    if (!b || !a) { failed = true; console.log(`${actor} ${route}: route only in ${b ? 'before' : 'after'}`); continue; }
    for (const key of ['recordIds', 'controls']) {
      if (key === 'recordIds' && b.recordIds.length === 0) { if (a.recordIds.length) console.log(`${actor} ${route} recordIds: new instrumentation, ${a.recordIds.length} ids after (before had none)`); continue; }
      const count = list => list.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map());
      const cb = count(b[key]), ca = count(a[key]);
      for (const v of new Set([...cb.keys(), ...ca.keys()])) {
        if ((cb.get(v) ?? 0) === (ca.get(v) ?? 0)) continue;
        if (key === 'controls' && ALLOWED_ADDED.has(v) && !cb.has(v)) continue;
        failed = true; console.log(`${actor} ${route} ${key}: ${v} before=${cb.get(v) ?? 0} after=${ca.get(v) ?? 0}`);
      }
    }
  }
}
if (failed) { console.log('UI-17 diff FAILED'); process.exit(1); }
console.log('UI-17 diff passed: identical record ids and controls for bob and jane on every route.');
