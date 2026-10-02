// Parse diagnostics: publishes the parser error of each template document at its exact range.
import { openDocument } from '@polyspec/template-language';
import * as vscode from 'vscode';

const DELAY_MS = 250;

/** Returns the diagnostics of a document: the parse error of @polyspec/template, or none when the document parses. */
export function diagnosticsOf(document: vscode.TextDocument): vscode.Diagnostic[] {
  return openDocument(document.getText(), { name: document.uri.fsPath }).diagnostics.map(error => {
    const range = new vscode.Range(document.positionAt(error.start), document.positionAt(error.end));
    const diagnostic = new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
    diagnostic.code = error.code;
    diagnostic.source = error.source;
    return diagnostic;
  });
}

/** Publishes diagnostics when a document opens, changes (after a short delay) or closes. */
export function registerDiagnostics(context: vscode.ExtensionContext, language: string): void {
  const collection = vscode.languages.createDiagnosticCollection(language);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const update = (document: vscode.TextDocument): void => {
    if (document.languageId === language) collection.set(document.uri, diagnosticsOf(document));
    else collection.delete(document.uri);
  };
  const clear = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.delete(key);
    collection.delete(document.uri);
  };
  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(update),
    vscode.workspace.onDidChangeTextDocument(event => {
      const key = event.document.uri.toString();
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        update(event.document);
      }, DELAY_MS));
    }),
    vscode.workspace.onDidCloseTextDocument(clear),
    { dispose: () => timers.forEach(timer => clearTimeout(timer)) },
  );
  vscode.workspace.textDocuments.forEach(update);
}
