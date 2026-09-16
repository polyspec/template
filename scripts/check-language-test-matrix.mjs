import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const languages = ['typescript', 'go', 'rust', 'php'];
const modes = ['ast', 'gen'];
export function checkManifest(manifest, projectRoot = root) {
  const failures = [];
  const matrix = manifest.verification_matrix;

  if (!matrix || JSON.stringify(matrix.languages) !== JSON.stringify(languages)) {
    failures.push('manifest verification_matrix.languages must cover TypeScript, Go, Rust and PHP in order');
  }
  if (!matrix || JSON.stringify(matrix.modes) !== JSON.stringify(modes)) {
    failures.push('manifest verification_matrix.modes must cover ast and gen in order');
  }

  const features = new Map(manifest.features.map((feature) => [feature.id, feature]));
  for (const id of matrix?.semantic_features ?? []) {
    const feature = features.get(id);
    if (!feature) {
      failures.push(`semantic feature ${id} is missing from features`);
      continue;
    }
    for (const language of languages) {
      if (feature.clients?.[language] !== 'pass') {
        failures.push(`${id} does not declare ${language}: pass`);
      }
    }
    if (feature.status !== 'implemented') failures.push(`${id} is not implemented`);
    if (!feature.tests?.length) failures.push(`${id} has no tests`);
    for (const file of feature.tests ?? []) {
      if (file.startsWith('packages/') || file.startsWith('scripts/') || file.startsWith('tests/')) {
        if (!existsSync(resolve(projectRoot, file))) failures.push(`${id} references missing test ${file}`);
      }
    }
  }

  const requiredCommands = new Set(matrix?.commands ?? []);
  for (const command of ['make conformance-all-modes', 'make function-contract-check', 'make generated-native-check']) {
    if (!requiredCommands.has(command)) failures.push(`matrix command missing: ${command}`);
  }
  return failures;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const manifest = JSON.parse(readFileSync(resolve(root, 'contracts/features.json'), 'utf8'));
  const failures = checkManifest(manifest);
  if (failures.length) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    process.exit(1);
  }
  process.stdout.write(`language test matrix: ${languages.length} languages × ${modes.length} modes and ${manifest.verification_matrix.semantic_features.length} semantic features declared\n`);
}
