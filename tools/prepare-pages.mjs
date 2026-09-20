/* tools/prepare-pages.mjs — builds a `docs/` folder for GitHub Pages
 * (Settings → Pages → Deploy from a branch → main /docs).
 *
 * The app is already a static site, so this is a copy plus a sanity check that
 * every file referenced by index.html / sw.js / the module graph exists.
 *
 * Run: node tools/prepare-pages.mjs
 */

import { cp, mkdir, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs');

const INCLUDE = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'data', 'README.md', '.nojekyll'];

async function listFiles(dir, out = []) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) await listFiles(p, out);
    else out.push(p.replace(`${OUT}/`, ''));
  }
  return out;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const entry of INCLUDE) {
    const src = join(ROOT, entry);
    if (!existsSync(src)) { console.warn(`skip (missing): ${entry}`); continue; }
    await cp(src, join(OUT, entry), { recursive: true });
  }

  // Verify every local asset referenced from the shell actually exists.
  const missing = [];
  const check = async (rel) => {
    const clean = rel.replace(/^\.\//, '').split('?')[0].split('#')[0];
    if (!clean || /^https?:/.test(clean) || clean.startsWith('data:')) return;
    if (!existsSync(join(OUT, clean))) missing.push(clean);
  };

  const html = await readFile(join(OUT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) await check(m[1]);

  const sw = await readFile(join(OUT, 'sw.js'), 'utf8');
  const listBlock = sw.slice(sw.indexOf('SHELL_ASSETS'), sw.indexOf('];', sw.indexOf('SHELL_ASSETS')));
  for (const m of listBlock.matchAll(/'\.\/([^']+)'/g)) await check(m[1]);

  // Walk the module graph for imports.
  const jsFiles = await listFiles(join(OUT, 'js'));
  const seen = new Set();
  const queue = [...jsFiles];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let src;
    try { src = await readFile(join(OUT, file), 'utf8'); } catch { continue; }
    for (const m of src.matchAll(/(?:import|export)\s+(?:[\s\S]*?from\s+)?['"](\.[^'"]+)['"]/g)) {
      const target = resolve(dirname(join(OUT, file)), m[1]);
      const rel = target.replace(`${OUT}/`, '');
      if (!existsSync(target)) missing.push(`${file} → ${m[1]}`);
      else if (rel.endsWith('.js')) queue.push(rel);
    }
  }

  const manifest = JSON.parse(await readFile(join(OUT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) await check(icon.src);

  if (missing.length) {
    console.error(`\x1b[31m${missing.length} referenced file(s) missing:\x1b[0m`);
    for (const m of missing) console.error(`  - ${m}`);
    process.exit(1);
  }

  await writeFile(join(OUT, '.nojekyll'), '');
  const files = await listFiles(OUT);
  const bytes = (await Promise.all(files.map(async (f) => (await stat(join(OUT, f))).size))).reduce((a, b) => a + b, 0);
  console.log(`\x1b[32m✓ docs/ ready\x1b[0m  ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
  console.log('  Settings → Pages → Deploy from a branch → main / docs');
}

await main();
