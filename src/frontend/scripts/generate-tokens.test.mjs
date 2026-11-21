import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const generator = new URL('./generate-tokens.mjs', import.meta.url).pathname;
const output = new URL('../src/tokens.css', import.meta.url);
const tokens = JSON.parse(readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'));
const run = () => { execFileSync(process.execPath, [generator]); return readFileSync(output, 'utf8'); };
const css = run();
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}\n', css.indexOf(':root {')) + 3);
const themeMatch = css.match(/@theme inline \{[\s\S]*?\n\}/);
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const palettes = ['brand', 'gray', 'success', 'error', 'warning', 'orange', 'blue-light', 'pink', 'purple'];

test('emits an @theme block', () => assert.ok(themeMatch, 'missing @theme block'));

test('every palette step is a :root variable and a theme reference', () => {
  for (const name of palettes) {
    for (const step of Object.keys(tokens.color[name])) {
      const variable = `--color-${kebab(name)}-${step}`;
      assert.ok(rootBlock.includes(`  ${variable}: ${tokens.color[name][step]};`), `:root lacks ${variable}`);
      assert.ok(themeMatch[0].includes(`  ${variable}: var(${variable});`), `@theme lacks ${variable}`);
    }
  }
});

test('font-sans resolves to Outfit', () => {
  assert.match(themeMatch[0], /--font-sans: "Outfit", ui-sans-serif, system-ui, sans-serif;/);
});

test('no hex colour outside the :root block', () => {
  const outside = css.replace(rootBlock, '');
  assert.doesNotMatch(outside, /#[\da-f]{3,8}\b/i);
});

test('regeneration is deterministic', () => assert.equal(run(), run()));

test('every emitted variable is live: palettes, white, black and the sans family only', () => {
  const names = [...rootBlock.matchAll(/^  --([a-z0-9-]+):/gm)].map(match => match[1]);
  const allowed = [/^color-(white|black)$/, new RegExp(`^color-(${palettes.join('|')})-\\d+$|^color-gray-dark$`), /^font-family-sans$/];
  for (const name of names) assert.ok(allowed.some(pattern => pattern.test(name)), `unexpected variable --${name}`);
});

test('camelCase token keys are emitted as kebab-case variables', () => {
  assert.ok(rootBlock.includes('  --font-family-sans:'));
  assert.doesNotMatch(rootBlock, /--[a-z-]*[A-Z]/);
});
