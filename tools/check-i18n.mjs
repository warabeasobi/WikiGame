#!/usr/bin/env node
/* tools/check-i18n.mjs — finds translation keys used in code but missing from
 * the dictionaries, and keys defined but never used. Run: node tools/check-i18n.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { STRINGS } = await import(join(ROOT, 'js/core/i18n.js'));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'js')), ...walk(join(ROOT, 'tests'))];
const used = new Set();
const dynamic = new Set();
const ACH_IDS = [...Object.keys(STRINGS.en)].filter((k) => k.startsWith('ach.') && k.endsWith('.name')).map((k) => k.split('.')[1]);
used.add('does.not.exist'); // used by the unit test for fallback behaviour

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) used.add(m[1]);
  for (const m of src.matchAll(/\bt\(\s*`([^`]+)`/g)) {
    // Resolve the only dynamic patterns we use: achievement names/descs.
    const raw = m[1];
    if (raw.includes('ach.${')) {
      for (const id of ACH_IDS) {
        if (raw.includes('.name')) used.add(`ach.${id}.name`);
        if (raw.includes('.desc')) used.add(`ach.${id}.desc`);
      }
    } else if (raw.includes('settings.skin${')) {
      for (const s of ['Classic', 'Minimal', 'Retro', 'Amoled']) used.add(`settings.skin${s}`);
    } else {
      dynamic.add(`${file.replace(`${ROOT}/`, '')}: ${raw}`);
    }
  }
}

const en = new Set(Object.keys(STRINGS.en));
const id = new Set(Object.keys(STRINGS.id));

const missingEn = [...used].filter((k) => !en.has(k)).sort();
const missingId = [...used].filter((k) => !id.has(k)).sort();
const unused = [...en].filter((k) => !used.has(k)).sort();
const idOnly = [...id].filter((k) => !en.has(k)).sort();
const enOnly = [...en].filter((k) => !id.has(k)).sort();

console.log(`keys defined: en=${en.size} id=${id.size}  used in code: ${used.size}`);
if (dynamic.size) console.log(`dynamic keys (not checked):\n  ${[...dynamic].join('\n  ')}`);
console.log(`\nmissing in EN (${missingEn.length}): ${missingEn.join(', ') || '—'}`);
console.log(`missing in ID (${missingId.length}): ${missingId.join(', ') || '—'}`);
console.log(`defined only in ID (${idOnly.length}): ${idOnly.join(', ') || '—'}`);
console.log(`defined only in EN (${enOnly.length}): ${enOnly.join(', ') || '—'}`);
console.log(`defined but never used (${unused.length}): ${unused.join(', ') || '—'}`);

process.exit(missingEn.length + missingId.length + enOnly.length + idOnly.length > 0 ? 1 : 0);
