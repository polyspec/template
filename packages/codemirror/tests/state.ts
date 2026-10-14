// Helpers that read the results of the template extension from an EditorState without a DOM.
import { expect } from 'vitest';
import { EditorState, type StateCommand } from '@codemirror/state';
import { foldService, indentUnit } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { template, type TemplateOptions } from '../src/index.js';

/** A state with the template extension and the indent unit of two spaces. */
export function createState(doc: string, options: TemplateOptions = {}): EditorState {
  return EditorState.create({ doc, extensions: [template(options), indentUnit.of('  ')] });
}

/** Every mark decoration of the state's decoration sets as `[from, to, class]`, sorted by position and class. */
export function marks(state: EditorState): [number, number, string][] {
  const result: [number, number, string][] = [];
  for (const source of state.facet(EditorView.decorations)) {
    if (typeof source === 'function') continue;
    source.between(0, state.doc.length, (from, to, value) => {
      result.push([from, to, (value.spec as { class: string }).class]);
    });
  }
  return result.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2]));
}

/** The folding range of every line from the registered fold services, as 0-based `[startLine, endLine]`. */
export function foldingRanges(state: EditorState): [number, number][] {
  const result: [number, number][] = [];
  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    for (const service of state.facet(foldService)) {
      const range = service(state, line.from, line.to);
      if (range === null) continue;
      expect(range.from).toBe(line.to);
      result.push([number - 1, state.doc.lineAt(range.to).number - 1]);
      break;
    }
  }
  return result;
}

/** Runs a state command and returns the state it dispatched, or null when it dispatched nothing. */
export function run(command: StateCommand, state: EditorState): { handled: boolean; state: EditorState | null } {
  let next: EditorState | null = null;
  const handled = command({ state, dispatch: transaction => (next = transaction.state) });
  return { handled, state: next };
}
