#!/usr/bin/env node
// Checks that every committed compiled artifact records the digest of the compiler that the tree holds (T17.1-6): the AST
// artifacts of examples/site/scenarios/*/compiled/ast record astCompilerDigest, the generated programs of
// examples/showcase/adapters record generatedCompilerDigest of their language and the JavaScript delivery
// typescriptDeliveryDigest. A change of the compiler, such as a change of packages/ts/src, leaves them stale
// until `make showcase` writes them again; a stale artifact is found here, from the tracked sources alone and without a
// build, so the job push-gate runs this check.
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { astCompilerDigest, generatedCompilerDigest } from '../packages/compiler/src/compiler-digest.mts';
import { typescriptDeliveryDigest } from '../examples/showcase/delivery-digest.mts';
import { artifactManifestDocument } from './artifact-manifest.mts';
import { scenarioIds } from './showcase-documents.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A committed artifact manifest and the compiler digest that it must record. */
export interface ArtifactManifest {
  path: string;
  expected: string;
}

/** The manifests of the committed artifacts with the digest that each must record. */
export function artifactManifests(base = root): ArtifactManifest[] {
  const scenarios = join(base, 'examples/site/scenarios');
  const ast = scenarioIds(scenarios).map((id): ArtifactManifest => ({ path: `examples/site/scenarios/${id}/compiled/ast/manifest.json`, expected: astCompilerDigest() }));
  // A generated program records the digest of the compiler of its target, which its manifest names.
  const generated: string[] = [];
  for (const directory of ['examples/showcase/adapters/generated/typed', 'examples/showcase/adapters/generated/javascript', 'examples/showcase/adapters/generated/php']) {
    for (const name of readdirSync(join(base, directory)).filter(file => file.endsWith('.manifest.json')).sort()) {
      generated.push(`${directory}/${name}`);
    }
  }
  const go = 'examples/showcase/adapters/go/generated';
  for (const id of readdirSync(join(base, go)).sort()) generated.push(`${go}/${id}/generated.go.manifest.json`);
  return [...ast, ...generated.map((path): ArtifactManifest => {
    const { target } = artifactManifestDocument.read(join(base, path));
    return { path, expected: target === 'js' ? typescriptDeliveryDigest() : generatedCompilerDigest(target) };
  })];
}

/** The lines that name each manifest whose recorded digest differs from the digest of the current compiler. */
export function staleArtifacts(base = root): string[] {
  return artifactManifests(base).flatMap(({ path, expected }) => {
    const recorded = artifactManifestDocument.read(join(base, path)).compilerDigest;
    return recorded === expected ? [] : [`${path} records the compiler digest ${recorded}, but the compiler of the tree has the digest ${expected}`];
  });
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
