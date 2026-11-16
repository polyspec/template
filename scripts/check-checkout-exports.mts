// node scripts/check-checkout-exports.mts <link utility of kit>: every file that an npm package of this checkout names in its
// exports, main or bin exists, and each JavaScript entry of its exports loads, for a consumer that links this checkout with .links
// (T28.111). The packages are the npm providers that `link providers` of kit lists for this checkout, the list that make link of a
// consumer reads. A missing file or an entry that fails to load is a finding; the exit status is 1 when one is found.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [link] = process.argv.slice(2);
if (!link) throw new Error('Usage: check-checkout-exports.mts <link utility of kit>');
const root = process.cwd();
const listing = execFileSync(process.execPath, [link, 'providers', '--ecosystem', 'npm', root], { encoding: 'utf8' });
const folders = listing.split('\n').filter(Boolean).map(line => line.split('\t')[1] ?? '');

const targets = (value: unknown, out: string[]): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') for (const inner of Object.values(value)) targets(inner, out);
  return out;
};

let findings = 0;
let loaded = 0;
for (const folder of folders) {
  const directory = path.resolve(root, folder);
  const parsed: unknown = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const manifest: Record<string, unknown> = parsed !== null && typeof parsed === 'object' ? { ...parsed } : {};
  const name = typeof manifest.name === 'string' ? manifest.name : folder;
  const files = [...new Set(targets([manifest.exports ?? manifest.main ?? [], manifest.bin ?? []], []))];
  // Only the exports load: a bin runs a program when imported, and the main of the VS Code extension imports vscode, which only
  // the editor provides.
  const entries = new Set(targets(manifest.exports ?? [], []));
  const require = createRequire(path.join(directory, 'package.json'));
  for (const file of files) {
    const absolute = path.join(directory, file);
    const shown = path.relative(root, absolute);
    if (!existsSync(absolute)) {
      console.log(`${name}: ${shown} is missing`);
      findings++;
      continue;
    }
    if (!entries.has(file) || !/\.(m|c)?js$/u.test(file)) continue;
    try {
      if (file.endsWith('.cjs')) require(absolute);
      else await import(pathToFileURL(absolute).href);
      loaded++;
    } catch (error) {
      console.log(`${name}: ${shown} does not load: ${String(error).split('\n')[0]}`);
      findings++;
    }
  }
}
console.log(`[checkout-exports] ${folders.length} npm packages, ${loaded} entries loaded, ${findings} findings`);
// Exit at once: the entry ./server of @polyspec/template-lsp starts a language server on stdin when it loads, which exits with 1
// when stdin ends, after this check.
process.exit(findings ? 1 : 0);
