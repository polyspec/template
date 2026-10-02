// Editor fixtures (EDT-17): the language service gives the expected results of every fixture. The LSP server and the
// CodeMirror adapter compare their results with the same files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The fixture script is plain JavaScript without declarations.
import { editorResults, fixtureDirectory, fixtureNames } from '../../../scripts/editor-fixtures.mjs';
import { openDocument } from '../src/index.js';

describe('editor fixtures', () => {
  const names = (fixtureNames as () => string[])();
  it('has fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });
  for (const name of names) {
    it(name, () => {
      const text = readFileSync(join(fixtureDirectory as string, name), 'utf8');
      const expected: unknown = JSON.parse(readFileSync(join(fixtureDirectory as string, name.replace(/\.tpl$/, '.json')), 'utf8'));
      expect((editorResults as (document: unknown) => unknown)(openDocument(text, { name }))).toEqual(expected);
    });
  }
});
