#!/usr/bin/env node
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileGeneratedArtifact, generatedManifestPath } from '../tools/compiler/generated-artifact.mjs';
import { loadSourceGraph } from '../tools/compiler/ir.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const fixture = join(root, 'examples/site/scenarios/empty-state');
const temporary = mkdtempSync(join(tmpdir(), 'polyspec-generated-artifact-'));
const graph = join(temporary, 'graph.json');
const types = join(temporary, 'types.json');
const output = join(temporary, 'page.ts');
const compilerA = 'a'.repeat(64);
const compilerB = 'b'.repeat(64);

try {
  copyFileSync(join(fixture, 'compiled/ast/manifest.json'), graph);
  copyFileSync(join(fixture, 'types.json'), types);
  const graphDirectory = join(temporary, 'graph-files');
  mkdirSync(graphDirectory);
  const graphWithFile = JSON.parse(readFileSync(graph, 'utf8'));
  const graphFile = Object.values(graphWithFile.files)[0];
  graphFile.path = `graph-files/${graphFile.path}`;
  copyFileSync(join(fixture, 'compiled/ast', graphFile.path.replace('graph-files/', '')), join(temporary, graphFile.path));
  writeFileSync(graph, JSON.stringify(graphWithFile));
  loadSourceGraph(graph);
  let compilations = 0;
  const compile = value => () => { compilations += 1; return value; };

  const first = compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'dev', compilerDigest: compilerA, compile: compile('first\n') });
  assert.equal(readFileSync(output, 'utf8'), 'first\n');
  assert.equal(first.mode, 'gen');
  assert.equal(first.target, 'ts');
  assert.equal(first.compilerDigest, compilerA);

  compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'true', compilerDigest: compilerA, compile: () => { throw new Error('unchanged artifact was recompiled'); } });
  assert.equal(compilations, 1);

  compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'true', compilerDigest: compilerB, compile: compile('second\n') });
  assert.equal(readFileSync(output, 'utf8'), 'second\n');
  assert.equal(compilations, 2);

  writeFileSync(output, 'damaged\n');
  compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'true', compilerDigest: compilerB, compile: compile('third\n') });
  assert.equal(readFileSync(output, 'utf8'), 'third\n');
  assert.equal(compilations, 3);

  compileGeneratedArtifact({ graphPath: join(temporary, 'missing-graph.json'), typeManifestPath: join(temporary, 'missing-types.json'), target: 'ts', output, refresh: 'false', compile: () => { throw new Error('false refresh invoked compiler'); } });
  compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'dev', compilerDigest: compilerB, check: true, compile: compile('third\n') });
  assert.throws(
    () => compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'dev', compilerDigest: compilerB, check: true, compile: compile('stale\n') }),
    /artifact is stale/,
  );

  const beforeSource = readFileSync(output);
  const beforeManifest = readFileSync(generatedManifestPath(output));
  assert.throws(
    () => compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'dev', compilerDigest: compilerB, compile: () => { throw new Error('compile failed'); } }),
    /compile failed/,
  );
  assert.deepEqual(readFileSync(output), beforeSource);
  assert.deepEqual(readFileSync(generatedManifestPath(output)), beforeManifest);
  assert.throws(
    () => compileGeneratedArtifact({ graphPath: graph, typeManifestPath: types, target: 'ts', output, refresh: 'sometimes', compilerDigest: compilerB, compile: compile('unused') }),
    /artifact refresh policy/,
  );
  writeFileSync(join(temporary, graphFile.path), '{}');
  assert.throws(() => loadSourceGraph(graph), /artifact .* is corrupt/);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write('generated artifact: dev, true and false refresh policies, integrity and failed-build preservation passed\n');
