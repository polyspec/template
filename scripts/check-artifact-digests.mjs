#!/usr/bin/env node
// Checks that every committed compiled artifact records the digest of the compiler that the tree holds (T17.1-6): the AST
// artifacts of examples/site/scenarios/*/compiled/ast record astCompilerDigest, the generated programs of
// tools/showcase/adapters record generatedCompilerDigest of their language and the JavaScript delivery
// typescriptDeliveryDigest. A change of the compiler, such as a change of packages/template-ts/src, leaves them stale
// until `make showcase` writes them again; a stale artifact is found here, from the tracked sources alone and without a
// build, so the job push-gate runs this check.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { astCompilerDigest, generatedCompilerDigest } from '../packages/template-compiler/compiler-digest.mjs';
import { typescriptDeliveryDigest } from '../tools/showcase/delivery-digest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The manifests of the committed artifacts with the digest that each must record. */
export function artifactManifests(base = root) {
  const manifests = [];
  const scenarios = join(base, 'examples/site/scenarios');
  for (const id of readdirSync(scenarios).sort()) {
    manifests.push({ path: `examples/site/scenarios/${id}/compiled/ast/manifest.json`, expected: astCompilerDigest() });
  }
  for (const directory of ['tools/showcase/adapters/generated/typed', 'tools/showcase/adapters/generated/javascript']) {
    for (const name of readdirSync(join(base, directory)).filter(file => file.endsWith('.manifest.json')).sort()) {
      manifests.push({ path: `${directory}/${name}` });
    }
  }
  const go = 'tools/showcase/adapters/go/generated';
  for (const id of readdirSync(join(base, go)).sort()) manifests.push({ path: `${go}/${id}/generated.go.manifest.json` });
  for (const manifest of manifests) {
    if (manifest.expected) continue;
    const { target } = JSON.parse(readFileSync(join(base, manifest.path), 'utf8'));
    manifest.expected = target === 'js' ? typescriptDeliveryDigest() : generatedCompilerDigest(target);
  }
  return manifests;
}

/** The lines that name each manifest whose recorded digest differs from the digest of the current compiler. */
export function staleArtifacts(base = root) {
  const stale = [];
  for (const { path, expected } of artifactManifests(base)) {
    const recorded = JSON.parse(readFileSync(join(base, path), 'utf8')).compilerDigest;
    if (recorded !== expected) stale.push(`${path} records the compiler digest ${recorded}, but the compiler of the tree has the digest ${expected}`);
  }
  return stale;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifests = artifactManifests();
  const stale = staleArtifacts();
  if (stale.length > 0) {
    console.error(`${stale.join('\n')}\n${stale.length} of ${manifests.length} committed artifacts were compiled by another compiler; run make showcase, which compiles them again, and commit the result`);
    process.exit(1);
  }
  console.log(`[artifact-digests] ${manifests.length} committed artifacts record the digest of the compiler of the tree`);
}
