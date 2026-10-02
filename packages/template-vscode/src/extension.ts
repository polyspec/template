// VS Code extension entry: starts the bundled language server template-lsp as a client and registers the tag
// backgrounds and the matching tag command, which use the custom requests of the server (EDT-15).
import * as vscode from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { registerDecorations, tagRangesOf } from './decorations.js';
import { registerMatchingTag } from './matching.js';

const LANGUAGE = 'polyspec-template';

let client: LanguageClient | undefined;

/** The API of the extension, which `vscode.extensions.getExtension().exports` returns. */
export interface PolyspecTemplateApi {
  /** The tag ranges that the extension paints for a document, or null while the server does not have the current version. */
  tagRanges(document: vscode.TextDocument): Promise<vscode.Range[] | null>;
}

/** Starts the language client of the bundled server `dist/server.cjs` and registers the editor features of the extension. */
export async function activate(context: vscode.ExtensionContext): Promise<PolyspecTemplateApi> {
  const module = context.asAbsolutePath('dist/server.cjs');
  const started = new LanguageClient(
    LANGUAGE,
    'Polyspec Template',
    { module, transport: TransportKind.stdio },
    { documentSelector: [{ language: LANGUAGE }] },
  );
  client = started;
  registerDecorations(context, started, LANGUAGE);
  registerMatchingTag(context, started, LANGUAGE);
  await started.start();
  return { tagRanges: document => tagRangesOf(started, document) };
}

/** Stops the language server. */
export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
