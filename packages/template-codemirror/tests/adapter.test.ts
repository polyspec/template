// Adapter behavior beyond the fixtures: indentation of a new line, options, the document field and the key binding.
import { EditorSelection, EditorState } from '@codemirror/state';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { describe, expect, it } from 'vitest';
import { formatTemplate, template, templateDiagnostics, templateDocument } from '../src/index.js';
import { createState, marks, run } from './state.js';

// Types a text at the end of the document and presses Enter, as a user does.
function typeLine(state: EditorState, text: string): EditorState {
  const end = state.doc.length;
  const typed = state.update({ changes: { from: end, insert: text }, selection: EditorSelection.cursor(end + text.length) }).state;
  const result = run(insertNewlineAndIndent, typed);
  expect(result.handled).toBe(true);
  return result.state as EditorState;
}

describe('indentation of a new line', () => {
  it('indents the line after an element and a template block', () => {
    let state = createState('');
    state = typeLine(state, '<ul>');
    expect(state.doc.toString()).toBe('<ul>\n  ');
    state = typeLine(state, '{@ x = xs}');
    expect(state.doc.toString()).toBe('<ul>\n  {@ x = xs}\n    ');
  });

  it('adds no level for a template block with templateBlocks flat', () => {
    let state = createState('', { templateBlocks: 'flat' });
    state = typeLine(state, '<ul>');
    state = typeLine(state, '{@ x = xs}');
    expect(state.doc.toString()).toBe('<ul>\n  {@ x = xs}\n  ');
  });

  it('indents the text after the cursor that Enter moves to a new line', () => {
    const state = createState('<ul>\n  {? a}{/}\n</ul>', {});
    const at = state.update({ selection: EditorSelection.cursor(state.doc.toString().indexOf('{/}')) }).state;
    const result = run(insertNewlineAndIndent, at);
    expect(result.state?.doc.toString()).toBe('<ul>\n  {? a}\n  {/}\n</ul>');
  });

  it('indents the empty line between brackets that Enter splits twice', () => {
    const state = createState('<ul>\n{}\n</ul>');
    const at = state.update({ selection: EditorSelection.cursor(6) }).state;
    const result = run(insertNewlineAndIndent, at);
    expect(result.state?.doc.toString()).toBe('<ul>\n{\n  \n}\n</ul>');
  });

  it('uses a tab indent unit', () => {
    const state = EditorState.create({ doc: '<ul>', selection: EditorSelection.cursor(4), extensions: [template(), indentUnit.of('\t')] });
    expect(run(insertNewlineAndIndent, state).state?.doc.toString()).toBe('<ul>\n\t');
  });
});

describe('options', () => {
  it('passes the delimiters to the language service', () => {
    const state = createState('<p>[= x]</p>', { delimiters: '[]' });
    expect(marks(state).filter(([, , type]) => type === 'cm-template-tag')).toEqual([[3, 8, 'cm-template-tag']]);
  });

  it('passes the template name to the language service', () => {
    const state = createState('{? a}', { name: 'page.tpl' });
    expect(state.field(templateDocument).diagnostics.length).toBe(1);
    expect(templateDiagnostics(state)[0]?.message).toMatch(/^E_PARSE_UNCLOSED_BLOCK: /);
  });

  it('formats with the editor indent unit and templateBlocks', () => {
    const text = '<ul>\n{@ x = xs}\n<li>{=x}</li>\n{/}\n</ul>\n';
    const four = EditorState.create({ doc: text, extensions: [template(), indentUnit.of('    ')] });
    expect(run(formatTemplate, four).state?.doc.toString()).toBe('<ul>\n    {@ x = xs}\n        <li>{= x}</li>\n    {/}\n</ul>\n');
    const flat = createState(text, { templateBlocks: 'flat' });
    expect(run(formatTemplate, flat).state?.doc.toString()).toBe('<ul>\n  {@ x = xs}\n  <li>{= x}</li>\n  {/}\n</ul>\n');
  });

  it('dispatches nothing when the text is formatted', () => {
    expect(run(formatTemplate, createState('<p>{= x}</p>\n'))).toEqual({ handled: true, state: null });
  });
});

describe('document field', () => {
  it('keeps the analysis when the document does not change', () => {
    const state = createState('<p>{= x}</p>');
    const moved = state.update({ selection: { anchor: 2 } }).state;
    expect(moved.field(templateDocument)).toBe(state.field(templateDocument));
    const changed = state.update({ changes: { from: 0, insert: ' ' } }).state;
    expect(changed.field(templateDocument)).not.toBe(state.field(templateDocument));
    expect(changed.field(templateDocument).text).toBe(' <p>{= x}</p>');
  });
});
