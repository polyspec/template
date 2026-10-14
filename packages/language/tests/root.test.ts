// Template root (EDT-18 to EDT-21): the marker vectors, the root by nearest ancestor and the path diagnostics through an
// injected host.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsonDocument } from '../../../scripts/json-document.mts';
import { checkRootMarker, openDocument, ROOT_MARKER, type EntryType, type RootHost } from '../src/index.js';
import { packageRoot } from './helpers.js';

interface Vector {
  text: string;
  message: string | null;
}

const vectorsDocument = jsonDocument<Vector[]>('root marker vectors', {
  type: 'array',
  items: {
    type: 'object', properties: { text: { type: 'string' }, message: { type: 'string', nullable: true } }, required: ['text', 'message'], additionalProperties: false,
  },
});

/** A host over an in-memory tree: a string is a file, null a directory, `{ link }` a symbolic link. */
function memoryHost(tree: Record<string, string | null | { link: string }>): RootHost {
  const entries = new Map(Object.entries(tree));
  return {
    entryType(path: string): EntryType | null {
      if (path === '/') return 'directory';
      if (!entries.has(path)) return [...entries.keys()].some(key => key.startsWith(`${path}/`)) ? 'directory' : null;
      const entry = entries.get(path);
      return typeof entry === 'string' ? 'file' : entry === null ? 'directory' : 'symlink';
    },
    readText(path: string): string {
      const entry = entries.get(path);
      if (typeof entry !== 'string') throw new Error(`${path} is not a file`);
      return entry;
    },
  };
}

const MARKER = '{"schema": 1}';

function diagnosticsOf(text: string, path: string, host: RootHost): { start: number; end: number; code: string; message: string }[] {
  return openDocument(text, { location: { path, host } }).diagnostics.map(({ start, end, code, message }) => ({ start, end, code, message }));
}

describe('root marker vectors', () => {
  const vectors = vectorsDocument.read(join(packageRoot, 'tests', 'root-marker', 'vectors.json'));
  for (const vector of vectors) {
    it(`${vector.message === null ? 'accepts' : 'rejects'} ${JSON.stringify(vector.text)}`, () => {
      const diagnostics = checkRootMarker(vector.text);
      if (vector.message === null) {
        expect(diagnostics).toEqual([]);
        return;
      }
      expect(diagnostics).toHaveLength(1);
      const [diagnostic] = diagnostics;
      expect(diagnostic?.code).toBe('E_ROOT_INVALID');
      expect(diagnostic?.message.startsWith(vector.message)).toBe(true);
      expect([diagnostic?.start, diagnostic?.end]).toEqual([0, vector.text.length]);
    });
  }
});

describe('template root', () => {
  it('is the directory of the marker in the nearest ancestor', () => {
    const host = memoryHost({ '/w/template-root.json': MARKER, '/w/site/template-root.json': MARKER, '/w/site/pages/page.tpl': '', '/w/site/part.tpl': 'x' });
    const document = openDocument('{+ /part.tpl}', { location: { path: '/w/site/pages/page.tpl', host } });
    expect(document.root).toEqual({ marker: '/w/site/template-root.json', text: MARKER, path: '/w/site', diagnostics: [] });
    expect(document.diagnostics).toEqual([]);
    expect(ROOT_MARKER).toBe('template-root.json');
  });

  it('reports every include path and block path when no marker is declared', () => {
    const host = memoryHost({ '/w/page.tpl': '' });
    const text = '{+ part.tpl}{# head "head.tpl"}{# side}{# list.tpl}';
    expect(openDocument(text, { location: { path: '/w/page.tpl', host } }).root).toBeNull();
    const message = 'no template root declared (template-root.json)';
    const expected = [
      { start: 0, end: 12, code: 'E_ROOT_UNDECLARED', message },
      { start: 12, end: 31, code: 'E_ROOT_UNDECLARED', message },
      { start: 39, end: 51, code: 'E_ROOT_UNDECLARED', message },
    ];
    expect(diagnosticsOf(text, '/w/page.tpl', host)).toEqual(expected);
    expect(openDocument(text).diagnostics.map(({ start, end, code, message }) => ({ start, end, code, message }))).toEqual(expected);
  });

  it('reports the paths under an invalid marker as undeclared and the marker on its own text', () => {
    const host = memoryHost({ '/w/template-root.json': '{"schema": 2}', '/w/page.tpl': '', '/w/part.tpl': 'x' });
    const document = openDocument('{+ part.tpl}', { location: { path: '/w/page.tpl', host } });
    expect(document.root?.path).toBeNull();
    expect(document.root?.diagnostics.map(item => item.code)).toEqual(['E_ROOT_INVALID']);
    expect(document.diagnostics.map(item => item.code)).toEqual(['E_ROOT_UNDECLARED']);
  });

  it('reports an include and a block path that name no regular file under the root', () => {
    const host = memoryHost({
      '/w/template-root.json': MARKER,
      '/w/pages/page.tpl': '',
      '/w/pages/part.tpl': 'x',
      '/w/parts/head.tpl': 'x',
      '/w/parts/dir': null,
      '/w/linked.tpl': { link: 'pages/part.tpl' },
      '/w/linkdir': { link: 'parts' },
    });
    const text = [
      '{+ part.tpl}',
      '{+ missing.tpl}',
      '{# head "../parts/head.tpl"}',
      '{# head "../parts/none.tpl"}',
      '{# side}',
      '{+ ../parts/dir}',
      '{+ /linked.tpl}',
      '{+ /linkdir/head.tpl}',
      '{+ ../../x.tpl}',
      '{+ part.tpl/x.tpl}',
    ].join('\n');
    expect(diagnosticsOf(text, '/w/pages/page.tpl', host).map(({ code, message }) => [code, message])).toEqual([
      ['E_LOAD_NOT_FOUND', 'template pages/missing.tpl does not exist'],
      ['E_LOAD_NOT_FOUND', 'template parts/none.tpl does not exist'],
      ['E_LOAD_NOT_FOUND', 'template parts/dir does not exist'],
      ['E_LOAD_FAILED', 'template linked.tpl cannot be loaded: linked.tpl is a symbolic link'],
      ['E_LOAD_FAILED', 'template linkdir/head.tpl cannot be loaded: linkdir is a symbolic link'],
      ['E_LOAD_OUTSIDE_ROOT', '"../../x.tpl" leaves the template root'],
      ['E_LOAD_NOT_FOUND', 'template pages/part.tpl/x.tpl does not exist'],
    ]);
  });

  it('reports a missing include at its tag', () => {
    const host = memoryHost({ '/w/template-root.json': MARKER, '/w/page.tpl': '' });
    expect(diagnosticsOf('<p>{+ missing.tpl}</p>', '/w/page.tpl', host)).toEqual([
      { start: 3, end: 18, code: 'E_LOAD_NOT_FOUND', message: 'template missing.tpl does not exist' },
    ]);
  });

  it('reports only the parser error of a text that does not parse', () => {
    const host = memoryHost({ '/w/page.tpl': '' });
    expect(diagnosticsOf('{+ part.tpl}{/}', '/w/page.tpl', host).map(item => item.code)).toEqual(['E_PARSE_UNEXPECTED_CLOSE']);
  });
});
