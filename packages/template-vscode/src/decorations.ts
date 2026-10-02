// Tag backgrounds: paints the range of every template tag that the parser accepted, independent of the color theme.
import { openDocument } from '@polyspec/template-language';
import * as vscode from 'vscode';

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

/** Returns the ranges of the tags of a document except comments, from the tags the parser accepted (EDT-6, EDT-9). */
export function tagRangesOf(document: vscode.TextDocument): vscode.Range[] {
  return openDocument(document.getText(), { name: document.uri.fsPath }).tags
    .map(tag => new vscode.Range(document.positionAt(tag.start), document.positionAt(tag.end)));
}

/**
 * Paints tag backgrounds in visible template editors when they appear and after a document changes. A document
 * that does not parse still has the tags the parser accepted before its error, so a tag being typed does not clear
 * the backgrounds of the whole document.
 */
export function registerDecorations(context: vscode.ExtensionContext, language: string): void {
  const decoration = vscode.window.createTextEditorDecorationType(TAG_BACKGROUND);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const paint = (document: vscode.TextDocument): void => {
    if (document.languageId !== language) return;
    const ranges = tagRangesOf(document);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document === document) editor.setDecorations(decoration, ranges);
    }
  };
  const paintVisible = (): void => {
    new Set(vscode.window.visibleTextEditors.map(editor => editor.document)).forEach(paint);
  };
  context.subscriptions.push(
    decoration,
    vscode.window.onDidChangeVisibleTextEditors(paintVisible),
    vscode.workspace.onDidChangeTextDocument(event => {
      const key = event.document.uri.toString();
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        paint(event.document);
      }, DELAY_MS));
    }),
    { dispose: () => timers.forEach(timer => clearTimeout(timer)) },
  );
  paintVisible();
}
