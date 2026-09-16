import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkManifest } from './check-language-test-matrix.mjs';

const root = resolve(import.meta.dirname, '..');
const original = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'));
const cases = [
  ['missing language support', (manifest) => { manifest.features.find((feature) => feature.id === 'object-and-class-calls').clients.go = 'unsupported'; }],
  ['missing test path', (manifest) => { manifest.features.find((feature) => feature.id === 'object-and-class-calls').tests = []; }],
  ['missing compiler mode', (manifest) => { manifest.verification_matrix.modes = ['ast']; }],
];

for (const [name, mutate] of cases) {
  const manifest = structuredClone(original);
  mutate(manifest);
  if (!checkManifest(manifest, root).length) throw new Error(`accepted mutation: ${name}`);
}

process.stdout.write(`language test matrix: ${cases.length} structural mutations rejected\n`);
