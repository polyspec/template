// Editor fixtures (EDT-17): the language service gives the expected results of every fixture. The LSP server and the
// CodeMirror adapter compare their results with the same files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editorResults, fixtureDirectory, fixtureNames, fixtureOptions } from '../../../scripts/editor-fixtures.mts';
import { openDocument } from '../src/index.js';

describe('editor fixtures', () => {
  const names = fixtureNames();
  it('has fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });
  for (const name of names) {
    it(name, () => {
      const text = readFileSync(join(fixtureDirectory, name), 'utf8');
      const expected: unknown = JSON.parse(readFileSync(join(fixtureDirectory, name.replace(/\.tpl$/, '.json')), 'utf8'));
      expect(editorResults(openDocument(text, fixtureOptions(name)))).toEqual(expected);
    });
  }
});
