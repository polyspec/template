// Document and range formatting through @polyspec/template-format.
import { format, type FormatResult } from '@polyspec/template-format';
import * as vscode from 'vscode';

/** Registers the formatting providers. Errors of format() are written to the output channel and produce no edits. */
export function registerFormatting(context: vscode.ExtensionContext, language: string, output: vscode.LogOutputChannel): void {
  const edits = (document: vscode.TextDocument, range: vscode.Range | null): vscode.TextEdit[] => {
    const source = document.getText();
    const options = range === null
      ? { name: document.uri.fsPath }
      : { name: document.uri.fsPath, range: { start: document.offsetAt(range.start), end: document.offsetAt(range.end) } };
    const result: FormatResult = format(source, options);
    if (!result.ok) {
      const { error } = result;
      output.warn(`${document.uri.fsPath}:${error.line}:${error.col}: ${error.code ?? 'formatted AST differs'}: ${error.message}; no edits returned`);
      return [];
    }
    if (!result.changed) return [];
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
    return [vscode.TextEdit.replace(whole, result.text)];
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits: document => edits(document, null),
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider(language, {
      provideDocumentRangeFormattingEdits: (document, range) => edits(document, range),
    }),
  );
}
