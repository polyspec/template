// Matching tags: highlights, folding ranges and the command that moves between the tags of one block construct, from the language service.
import { openDocument } from '@polyspec/template-language';
import * as vscode from 'vscode';

/** Identifier of the command that moves the cursor to the next tag of the same construct. */
const GO_TO_MATCHING_TAG = 'polyspec-template.goToMatchingTag';

function documentOf(document: vscode.TextDocument): ReturnType<typeof openDocument> {
  return openDocument(document.getText(), { name: document.uri.fsPath });
}

/** Registers the highlight and folding providers and the matching tag command. */
export function registerStructure(context: vscode.ExtensionContext, language: string): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider(language, {
      provideDocumentHighlights(document, position) {
        return documentOf(document).highlights(document.offsetAt(position))
          .map(range => new vscode.DocumentHighlight(new vscode.Range(document.positionAt(range.start), document.positionAt(range.end)), vscode.DocumentHighlightKind.Text));
      },
    }),
    vscode.languages.registerFoldingRangeProvider(language, {
      provideFoldingRanges(document) {
        return documentOf(document).foldingRanges().map(range => new vscode.FoldingRange(range.startLine, range.endLine, vscode.FoldingRangeKind.Region));
      },
    }),
    vscode.commands.registerTextEditorCommand(GO_TO_MATCHING_TAG, editor => {
      const target = documentOf(editor.document).matchingTag(editor.document.offsetAt(editor.selection.active));
      if (target === null) return;
      const position = editor.document.positionAt(target);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }),
  );
}
