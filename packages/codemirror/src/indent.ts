// Indentation of a line from the typing indentation of the language service (EDT-13).
import { countColumn } from '@codemirror/state';
import { indentService, indentUnit, type IndentContext } from '@codemirror/language';
import type { TemplateDocument } from '@polyspec/template-language';
import { documentOf, templateDocument } from './document.js';
import { templateOptions } from './options.js';

/**
 * Returns the column width of `lineIndentation` for the line at `pos`. When the context simulates a line break in
 * that line, as Enter does, the service analyzes the text with the break: the line that `lineAt` describes becomes a
 * line of its own.
 */
export const templateIndentation = indentService.of((context: IndentContext, pos: number) => {
  const { state } = context;
  const { document, line } = contextLine(context, pos);
  const indentation = document.lineIndentation(line, {
    indent: state.facet(indentUnit),
    templateBlocks: state.facet(templateOptions).templateBlocks ?? 'indent',
  });
  return countColumn(indentation, state.tabSize);
});

// The document and the 0-based line of `pos` as the context describes them.
function contextLine(context: IndentContext, pos: number): { document: TemplateDocument; line: number } {
  const { state } = context;
  const real = state.doc.lineAt(pos);
  const line = context.lineAt(pos);
  const end = line.from + line.text.length;
  const breakBefore = line.from > real.from;
  const breakAfter = end < real.to;
  if (!breakBefore && !breakAfter) return { document: state.field(templateDocument), line: real.number - 1 };
  const text = state.doc.sliceString(0, line.from) + (breakBefore ? '\n' : '') + line.text + (breakAfter ? '\n' : '') + state.doc.sliceString(end);
  return { document: documentOf(state, text), line: real.number - 1 + (breakBefore ? 1 : 0) };
}
