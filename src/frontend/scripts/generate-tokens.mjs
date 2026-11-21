import { readFileSync, writeFileSync } from 'node:fs';
const tokens = JSON.parse(readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'));
const kebabName = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const flattenRaw = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) => key.startsWith('_') ? [] : typeof value === 'object' ? flattenRaw(value, `${prefix}${key}-`) : [`  --${prefix}${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}: ${value};`]);
const flatten = object => { const lines = flattenRaw(object); const out = []; for (const line of lines) { out.push(line); const name = line.slice(4, line.indexOf(":")); const kebab = kebabName(name); if (kebab !== name) out.push(line.replace(`--${name}:`, `--${kebab}:`)); } return out; };
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const themeColors = Object.entries(tokens.color).filter(([, value]) => typeof value === 'object').flatMap(([name, steps]) => Object.keys(steps).map(step => `  --color-${kebab(name)}-${step}: var(--color-${kebab(name)}-${step});`));
const theme = `@theme inline {\n${themeColors.join('\n')}\n  --font-sans: "${tokens.font.familySans}", ui-sans-serif, system-ui, sans-serif;\n}\n`;
writeFileSync(new URL('../src/tokens.css', import.meta.url), `/* Generated from design/tokens.json. Do not edit. */\n:root {\n${flatten(tokens).join('\n')}\n}\n\n/* Tailwind utilities resolve to the :root custom properties above. */\n${theme}`);
