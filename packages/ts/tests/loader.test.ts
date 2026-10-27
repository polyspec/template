// The loaders and the resolution of template paths: a map loader returns the source of a name that it holds with a
// version (RT-10), a path resolves against the directory of the current template and fails when it leaves the root
// (RT-8), and the filesystem loader keeps no file open after a load (T23.5).
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstProgram, Engine, MapLoader, parse, PathError, resolvePath, TemplateError } from '../src/index.js';
import { FsLoader } from '../src/node/index.js';

describe('MapLoader', () => {
  it('versions both source and AST replacement by content (RT-10, RT-40)', () => {
    const loader = new MapLoader();
    for (const ast of [false, true]) {
      const versions: string[] = [];
      for (const text of ['first', 'second', 'second']) {
        const value = ast ? parse(text, 'a.tpl') : text;
        loader.set('a.tpl', value);
        const result = loader.load('a.tpl');
        expect(result).not.toBeNull();
        if (result === null) throw new Error('held template is missing');
        expect(result).toEqual(ast ? { ast: value, version: result.version } : { source: value, version: result.version });
        expect(result.version).not.toBe('');
        versions.push(result.version);
      }
      expect(versions[0]).not.toBe(versions[1]);
      expect(versions[1]).toBe(versions[2]);
    }
  });

  // RT-9, RT-10: a map loader returns a held source with its version, and nothing for another name.
  it('returns the source of a name that it holds with a version, and nothing for another name (RT-10)', () => {
    const loaded = new MapLoader({ 'a.tpl': 'x' }).load('a.tpl');
    expect(loaded).toMatchObject({ source: 'x' });
    expect(loaded?.version).not.toBe('');
    expect(new MapLoader({ 'a.tpl': 'x' }).load('b.tpl')).toBeNull();
  });
});

describe('resolvePath', () => {
  it('resolves against the directory of the current template and fails outside the root (RT-8)', () => {
    expect(resolvePath('a/b.tpl', 'c.tpl')).toBe('a/c.tpl');
    expect(resolvePath('a/b.tpl', '../c.tpl')).toBe('c.tpl');
    expect(resolvePath('a/b.tpl', '/x/y.tpl')).toBe('x/y.tpl');
    expect(resolvePath('b.tpl', './c.tpl')).toBe('c.tpl');
    expect(() => resolvePath('a.tpl', '../x.tpl')).toThrow(PathError);
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'o.tpl': '{+ ../z.tpl}' }) }));
    let caught: TemplateError | null = null;
    try {
      engine.render('o.tpl', {});
    } catch (error: unknown) {
      if (!(error instanceof TemplateError)) throw error;
      caught = error;
    }
    expect(caught?.code).toBe('E_LOAD_OUTSIDE_ROOT');
  });
});

describe('FsLoader', () => {
  // RT-75: the filesystem loader closes each file that it reads before load returns, so no file stays open.
  it('keeps no file open after it loaded many templates (T23.5)', () => {
    const root = mkdtempSync(join(tmpdir(), 'template-ts-loader-'));
    try {
      const templates = 64;
      for (let index = 0; index < templates; index++) writeFileSync(join(root, `t${index}.tpl`), 'x');
      const loader = new FsLoader(root);
      const before = readdirSync('/dev/fd').length;
      for (let index = 0; index < templates; index++) expect(loader.load(`t${index}.tpl`)).not.toBeNull();
      expect(readdirSync('/dev/fd').length).toBeLessThanOrEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
