// Tag backgrounds: paints the tag ranges of the language server (polyspec-template/tagRanges), independent of the color theme.
import { TAG_RANGES_METHOD, type TagRangesParams, type TagRangesResult } from '@polyspec/template-lsp';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

const DELAY_MS = 250;

/**
 * The background of a template tag: a deep green that differs in lightness from the editor background (about ΔL*
 * +13 on the dark default theme, ΔL* 5 on the light one) and keeps every syntax color above 4.5:1 on the dark theme.
 * A more saturated green such as #044700 is easier to see but lowers the keyword sigils to 4:1. A color at the
 * editor's own lightness, such as black on a dark theme, cannot be told apart.
 */
const TAG_BACKGROUND: vscode.DecorationRenderOptions = {
  light: { backgroundColor: '#e3f6dd' },
  dark: { backgroundColor: '#16351c' },
  borderRadius: '3px',
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
};

/**
 * The tag ranges of a document from `polyspec-template/tagRanges`, or null when the server does not have the document
 * open or the document changed while the request ran. These are the ranges that the extension paints.
 */
export async function tagRangesOf(client: LanguageClient, document: vscode.TextDocument): Promise<vscode.Range[] | null> {
  const version = document.version;
  const params: TagRangesParams = { textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document) };
  const result = await client.sendRequest<TagRangesResult>(TAG_RANGES_METHOD, params);
  if (result === null || document.version !== version) return null;
  return result.map(range => client.protocol2CodeConverter.asRange(range));
}

/**
 * Paints tag backgrounds in visible template editors when they appear and after a document changes. A document
 * that does not parse still has the tags the parser accepted before its error (EDT-6), so a tag being typed does not
 * clear the backgrounds of the whole document.
 */
export function registerDecorations(context: vscode.ExtensionContext, client: LanguageClient, language: string): void {
  const decoration = vscode.window.createTextEditorDecorationType(TAG_BACKGROUND);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const paint = async (document: vscode.TextDocument): Promise<void> => {
    if (document.languageId !== language) return;
    const ranges = await tagRangesOf(client, document);
    if (ranges === null) return;
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) editor.setDecorations(decoration, ranges);
    }
  };
  const paintLogged = (document: vscode.TextDocument): void => {
    paint(document).catch((error: unknown) => client.error('Painting the tag backgrounds failed', error, false));
  };
  const paintVisible = (): void => {
    new Set(vscode.window.visibleTextEditors.map(editor => editor.document)).forEach(paintLogged);
  };
  context.subscriptions.push(
    decoration,
    vscode.window.onDidChangeVisibleTextEditors(paintVisible),
    vscode.workspace.onDidChangeTextDocument(event => {
      const key = event.document.uri.toString();
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        paintLogged(event.document);
      }, DELAY_MS));
    }),
    { dispose: () => timers.forEach(timer => clearTimeout(timer)) },
  );
  paintVisible();
}
