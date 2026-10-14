// Folding of closed template constructs (EDT-10).
import { foldService } from '@codemirror/language';
import { templateDocument } from './document.js';

/**
 * Folds the construct that starts on the line from the end of the line to the end of the line before its close tag.
 * When several constructs start on one line, the one that ends last is folded.
 */
export const templateFolding = foldService.of((state, lineStart, lineEnd) => {
  const line = state.doc.lineAt(lineStart).number - 1;
  let endLine = -1;
  for (const range of state.field(templateDocument).foldingRanges()) {
    if (range.startLine === line && range.endLine > endLine) endLine = range.endLine;
  }
  return endLine < 0 ? null : { from: lineEnd, to: state.doc.line(endLine + 1).to };
});
