// Tag backgrounds: paints the range of every template tag that the parser accepted, independent of the color theme.
import { templateStructure } from '@polyspec/template-format';
import * as vscode from 'vscode';

const DELAY_MS = 250;

/** The background of a template tag: the hue that the default themes give `keyword.control`, at low opacity. */
const TAG_BACKGROUND: vscode.DecorationRenderOptions = {
  light: { backgroundColor: 'rgba(175, 0, 219, 0.08)' },
  dark: { backgroundColor: 'rgba(197, 134, 192, 0.16)' },
  borderRadius: '3px',
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
};

/**
 * Returns the ranges of the tags of a document except comments, which the theme already shows as comments, or
 * null when the document does not parse.
 */
export function tagRangesOf(document: vscode.TextDocument): vscode.Range[] | null {
  const result = templateStructure(document.getText(), { name: document.uri.fsPath });
  if (!result.ok) return null;
  return result.tags
    .filter(tag => tag.kind !== 'comment')
    .map(tag => new vscode.Range(document.positionAt(tag.start), document.positionAt(tag.end)));
}

/**
 * Paints tag backgrounds in visible template editors when they appear and after a document changes. A document
 * that does not parse keeps its previous backgrounds, which VS Code moves with the edits, so a tag being typed
 * does not clear the backgrounds of the whole document.
 */
export function registerDecorations(context: vscode.ExtensionContext, language: string): void {
  const decoration = vscode.window.createTextEditorDecorationType(TAG_BACKGROUND);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const paint = (document: vscode.TextDocument): void => {
    if (document.languageId !== language) return;
    const ranges = tagRangesOf(document);
    if (ranges === null) return;
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
