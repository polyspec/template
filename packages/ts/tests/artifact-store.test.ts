// RT-56 ArtifactStore.loadOrRefresh: the refresh policies build or reuse an artifact (docs/spec/runtime.md).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAst } from '../../compiler/src/ast-artifact.mts';
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

  it('false fails when no artifact exists and never builds', () => {
    const { output } = fixtureRoot();
    let builds = 0;
    expect(() => loadOrRefresh(output, 'false', () => { builds++; })).toThrow();
    expect(builds).toBe(0);
  });
});
