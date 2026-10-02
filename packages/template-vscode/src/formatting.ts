// Document and range formatting through @polyspec/template-format, with the editor indent unit and the templateBlocks setting.
import { format, type FormatOptions, type FormatResult } from '@polyspec/template-format';
import * as vscode from 'vscode';

const LABELS: Record<string, string> = { html: 'HTML structure', invariant: 'formatted AST differs' };

/** The format() options of a document: the indent unit of the editor and the templateBlocks setting. */
function formatOptions(document: vscode.TextDocument, formatting: vscode.FormattingOptions): FormatOptions {
  const templateBlocks = vscode.workspace.getConfiguration('polyspec-template', document).get<'indent' | 'flat'>('format.templateBlocks', 'indent');
  return { name: document.uri.fsPath, indent: formatting.insertSpaces ? ' '.repeat(formatting.tabSize) : '\t', templateBlocks };
}

/** Registers the formatting providers. Errors of format() are written to the output channel and produce no edits. */
export function registerFormatting(context: vscode.ExtensionContext, language: string, output: vscode.LogOutputChannel): void {
  const edits = (document: vscode.TextDocument, range: vscode.Range | null, formatting: vscode.FormattingOptions): vscode.TextEdit[] => {
    const source = document.getText();
    const options = formatOptions(document, formatting);
    if (range !== null) options.range = { start: document.offsetAt(range.start), end: document.offsetAt(range.end) };
    const result: FormatResult = format(source, options);
    if (!result.ok) {
      const { error } = result;
      output.warn(`${document.uri.fsPath}:${error.line}:${error.col}: ${error.code ?? LABELS[error.reason]}: ${error.message}; no edits returned`);
      return [];
    }
    if (!result.changed) return [];
    const whole = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
    return [vscode.TextEdit.replace(whole, result.text)];
  };
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(language, {
      provideDocumentFormattingEdits: (document, formatting) => edits(document, null, formatting),
    }),
    vscode.languages.registerDocumentRangeFormattingEditProvider(language, {
      provideDocumentRangeFormattingEdits: (document, range, formatting) => edits(document, range, formatting),
    }),
  );
}
