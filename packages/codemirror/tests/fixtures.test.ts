// Editor fixtures (EDT-17): the adapter gives, through an EditorState, the results of the language service fixtures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { countColumn } from '@codemirror/state';
import { getIndentation } from '@codemirror/language';
import { describe, expect, it } from 'vitest';
import { fixtureDirectory, fixtureNames, fixtureOptions } from '../../../scripts/editor-fixtures.mts';
import { jsonDocument } from '../../../scripts/json-document.mts';
import { formatTemplate, goToMatchingTag, templateDiagnostics } from '../src/index.js';
import { createState, foldingRanges, marks, run } from './state.js';

interface Fixture {
  diagnostics: { start: number; end: number; code: string }[];
  tokens: [number, number, string][];
  tags: [number, number][];
  foldingRanges: [number, number][];
  highlights: Record<string, [number, number][]>;
  matchingTags: Record<string, number | null>;
  lineIndentation: { indent: string[]; flat: string[] };
  formatted: string | { error: string };
}

const names = fixtureNames();

const span = { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 };
const lines = { type: 'array', items: { type: 'string' } };
// The fixture results of the language service, as scripts/editor-fixtures.mts writes them.
const fixtureDocument = jsonDocument<Fixture>('editor fixture results', {
  type: 'object',
  properties: {
    diagnostics: {
      type: 'array',
      items: { type: 'object', properties: { start: { type: 'integer' }, end: { type: 'integer' }, code: { type: 'string' } }, required: ['start', 'end', 'code'] },
    },
    tokens: { type: 'array', items: { type: 'array', items: [{ type: 'integer' }, { type: 'integer' }, { type: 'string' }], minItems: 3, additionalItems: false } },
    tags: { type: 'array', items: span },
    foldingRanges: { type: 'array', items: span },
    highlights: { type: 'object', additionalProperties: { type: 'array', items: span } },
    matchingTags: { type: 'object', additionalProperties: { type: 'integer', nullable: true } },
    lineIndentation: { type: 'object', properties: { indent: lines, flat: lines }, required: ['indent', 'flat'] },
    formatted: { oneOf: [{ type: 'string' }, { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] }] },
  },
  required: ['diagnostics', 'tokens', 'tags', 'foldingRanges', 'highlights', 'matchingTags', 'lineIndentation', 'formatted'],
});

describe('editor fixtures', () => {
  it('has fixtures', () => {
    expect(names.length).toBeGreaterThan(0);
  });
  for (const name of names) {
    describe(name, () => {
      const text = readFileSync(join(fixtureDirectory, name), 'utf8');
      const expected = fixtureDocument.read(join(fixtureDirectory, name.replace(/\.tpl$/, '.json')));
      const options = fixtureOptions(name);
      const state = createState(text, options);

      it('diagnostics', () => {
        const diagnostics = templateDiagnostics(state);
        expect(diagnostics.map(item => ({ start: item.from, end: item.to, code: item.message.slice(0, item.message.indexOf(':')) }))).toEqual(expected.diagnostics);
        for (const item of diagnostics) {
          expect(item.severity).toBe('error');
          expect(item.source).toBe('polyspec-template');
        }
      });

      it('token marks', () => {
        const tokens = marks(state).filter(([, , type]) => type !== 'cm-template-tag' && type !== 'cm-template-highlight');
        expect(tokens.map(([from, to, type]) => [from, to, type.replace(/^cm-template-/, '')])).toEqual(expected.tokens);
      });

      it('tag marks', () => {
        expect(marks(state).filter(([, , type]) => type === 'cm-template-tag').map(([from, to]) => [from, to])).toEqual(expected.tags);
      });

      it('folding ranges', () => {
        // The fold service folds one range per line, the one that ends last.
        const lastByLine = new Map<number, number>();
        for (const [start, end] of expected.foldingRanges) lastByLine.set(start, Math.max(end, lastByLine.get(start) ?? -1));
        expect(foldingRanges(state)).toEqual([...lastByLine].sort((left, right) => left[0] - right[0]));
      });

      it('highlights and matching tags at the query positions', () => {
        const highlights: Record<string, [number, number][]> = {};
        const matchingTags: Record<string, number | null> = {};
        for (const key of Object.keys(expected.matchingTags)) {
          const index = Number(key);
          const at = state.update({ selection: { anchor: index } }).state;
          const ranges = marks(at).filter(([, , type]) => type === 'cm-template-highlight').map(([from, to]): [number, number] => [from, to]);
          if (ranges.length > 0) highlights[key] = ranges;
          const moved = run(goToMatchingTag, at);
          expect(moved.handled).toBe(moved.state !== null);
          matchingTags[key] = moved.state === null ? null : moved.state.selection.main.head;
        }
        expect(highlights).toEqual(expected.highlights);
        expect(matchingTags).toEqual(expected.matchingTags);
      });

      for (const mode of ['indent', 'flat'] as const) {
        it(`indentation with templateBlocks ${mode}`, () => {
          const modeState = createState(text, { ...options, templateBlocks: mode });
          const widths = Array.from({ length: modeState.doc.lines }, (_, line) => getIndentation(modeState, modeState.doc.line(line + 1).from));
          expect(widths).toEqual(expected.lineIndentation[mode].map(indentation => countColumn(indentation, modeState.tabSize)));
        });
      }

      it('formatTemplate', () => {
        const result = run(formatTemplate, state);
        if (typeof expected.formatted === 'string') {
          expect(result.handled).toBe(true);
          expect(result.state?.doc.toString() ?? text).toBe(expected.formatted);
        } else {
          expect(result).toEqual({ handled: false, state: null });
        }
      });
    });
  }
});
