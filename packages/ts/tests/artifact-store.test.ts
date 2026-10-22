// RT-56 ArtifactStore.loadOrRefresh: the refresh policies build or reuse an artifact (docs/spec/runtime.md).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAst } from '../../compiler/src/ast-artifact.mts';
import { compileGeneratedArtifact, generatedManifestPath } from '../../compiler/src/generated-artifact.mts';
import { loadOrRefresh } from '../src/node/index.js';

function fixtureRoot(): { source: string; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'artifact-store-'));
  const source = join(root, 'source');
  mkdirSync(source);
  writeFileSync(join(source, 'page.tpl'), '<p>{= x}</p>');
  return { source, output: join(root, 'output') };
}

describe('ArtifactStore.loadOrRefresh (RT-56)', () => {
  it('dev builds on every call and renders the source bytes', () => {
    const { source, output } = fixtureRoot();
    let builds = 0;
    const build = (directory: string) => {
      builds++;
      compileAst({ root: source, output: directory, entry: 'page.tpl', refresh: 'dev', typeManifest: null, delimiters: null });
    };
    expect(loadOrRefresh(output, 'dev', build).render('page.tpl', { x: 'a<b' })).toBe('<p>a&lt;b</p>');
    loadOrRefresh(output, 'dev', build);
    expect(builds).toBe(2);
  });

  it('true reuses a verified artifact without building it again', () => {
    const { source, output } = fixtureRoot();
    const build = (directory: string) => {
      compileAst({ root: source, output: directory, entry: 'page.tpl', refresh: 'dev', typeManifest: null, delimiters: null });
    };
    loadOrRefresh(output, 'true', build);
    let builds = 0;
    expect(loadOrRefresh(output, 'true', () => { builds++; }).render('page.tpl', { x: 'b' })).toBe('<p>b</p>');
    expect(builds).toBe(0);
  });

  it('true fails on a manifest that is not JSON and does not build', () => {
    const { output } = fixtureRoot();
    mkdirSync(output);
    writeFileSync(join(output, 'manifest.json'), 'not json');
    let builds = 0;
    expect(() => loadOrRefresh(output, 'true', () => { builds++; })).toThrow(SyntaxError);
    expect(builds).toBe(0);
  });

  it('false fails when no artifact exists and never builds', () => {
    const { output } = fixtureRoot();
    let builds = 0;
    expect(() => loadOrRefresh(output, 'false', () => { builds++; })).toThrow();
    expect(builds).toBe(0);
  });
});

describe('the build side of ArtifactStore.loadOrRefresh (RT-56)', () => {
  it('compileAst under true fails on a manifest that is not JSON instead of rebuilding it', () => {
    const { source, output } = fixtureRoot();
    compileAst({ root: source, output, entry: 'page.tpl', refresh: 'dev', typeManifest: null, delimiters: null });
    writeFileSync(join(output, 'manifest.json'), 'not json');
    expect(() => compileAst({ root: source, output, entry: 'page.tpl', refresh: 'true', typeManifest: null, delimiters: null })).toThrow(/is no JSON text/);
  });

  it('compileAst under true rebuilds a manifest in the form of another compiler', () => {
    const { source, output } = fixtureRoot();
    compileAst({ root: source, output, entry: 'page.tpl', refresh: 'dev', typeManifest: null, delimiters: null });
    writeFileSync(join(output, 'manifest.json'), JSON.stringify({ schema: 2, mode: 'ast' }));
    expect(compileAst({ root: source, output, entry: 'page.tpl', refresh: 'true', typeManifest: null, delimiters: null }).schema).toBe(3);
  });

  it('compileGeneratedArtifact under true fails on a manifest that is not JSON and compiles nothing', () => {
    const { source, output } = fixtureRoot();
    compileAst({ root: source, output, entry: 'page.tpl', refresh: 'dev', typeManifest: null, delimiters: null });
    const typeManifestPath = join(output, '..', 'types.json');
    writeFileSync(typeManifestPath, '');
    const generated = join(output, '..', 'generated.ts');
    writeFileSync(generatedManifestPath(generated), 'not json');
    let compiles = 0;
    const options = {
      graphPath: join(output, 'manifest.json'), typeManifestPath, target: 'ts', output: generated, refresh: 'true',
      compilerDigest: '0'.repeat(64), compile: () => { compiles++; return 'export {};\n'; },
    };
    expect(() => compileGeneratedArtifact(options)).toThrow(/is no JSON text/);
    expect(compiles).toBe(0);
  });
});
