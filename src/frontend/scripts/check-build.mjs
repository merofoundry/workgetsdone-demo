import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]); }
const errors = [];
for (const file of files('dist')) {
  if (file.endsWith('.svg')) errors.push(`Host rejects SVG entries: ${file}`);
  if (file.endsWith('.html') && /<script(?![^>]*\bsrc=)[^>]*>/i.test(readFileSync(file, 'utf8'))) errors.push(`Inline script: ${file}`);
}
for (const file of files('src').filter(file => /\.(css|tsx?|jsx?)$/.test(file) && !/tokens\.css|\.test\./.test(file))) {
  const source = readFileSync(file, 'utf8');
  if (/#[\da-f]{3,8}\b/i.test(source)) errors.push(`Colour outside tokens: ${file}`);
  if (/fetch\(\s*['"`]https?:/i.test(source)) errors.push(`Absolute fetch: ${file}`);
  const storage = /document\.cookie|sessionStorage/.test(source) || (/localStorage/.test(source) && file.split(sep).join('/') !== 'src/context/ThemeContext.tsx');
  if (storage) errors.push(`Browser storage outside URL/query state (localStorage is allowed only in src/context/ThemeContext.tsx): ${file}`);
}
// theme-color must mirror the token page backgrounds (gray.50 light, gray.950 dark): no hex drifts from design/tokens.json.
const tokenColors = JSON.parse(readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8')).color;
const themeColors = Object.fromEntries([...readFileSync('dist/index.html', 'utf8').matchAll(/<meta\s+name="theme-color"\s+media="\(prefers-color-scheme: (light|dark)\)"\s+content="([^"]+)"/g)].map(match => [match[1], match[2].toLowerCase()]));
if (themeColors.light !== tokenColors.gray['50'].toLowerCase()) errors.push(`theme-color (light) ${themeColors.light} does not match tokens gray.50 ${tokenColors.gray['50']}`);
if (themeColors.dark !== tokenColors.gray['950'].toLowerCase()) errors.push(`theme-color (dark) ${themeColors.dark} does not match tokens gray.950 ${tokenColors.gray['950']}`);
// CSP promise: no inline style attributes in the shipped HTML or CSS (FullCalendar's runtime emits its own in the JS chunks, which are not probed).
for (const file of files('dist').filter(file => /\.(html|css)$/.test(file))) if (/\sstyle\s*=\s*["']/i.test(readFileSync(file, 'utf8'))) errors.push(`Inline style attribute: ${file}`);
const css = files('dist').filter(file => file.endsWith('.css')).map(file => readFileSync(file, 'utf8')).join('\n');
if (!css.includes('--color-brand-500')) errors.push('Built CSS lacks --color-brand-500: token pipeline did not run');
for (const [, host] of css.matchAll(/@import\s+(?:url\()?\s*["']?https?:\/\/([^\/"')\s]+)/g)) if (host !== 'fonts.googleapis.com') errors.push(`Built CSS imports from disallowed host: ${host}`);
const manifest = JSON.parse(readFileSync('dist/merofoundry.json', 'utf8'));
if (manifest.entry !== 'index.html' || !manifest.immutable.includes('assets/*')) errors.push('Missing cache declaration');
if (errors.length) throw new Error(errors.join('\n'));
console.log('Bundle checks passed: no SVG assets, inline scripts, inline style attributes, token-matched theme-color, literal colours, absolute fetches or browser storage (the theme preference excepted); explicit caching.');
