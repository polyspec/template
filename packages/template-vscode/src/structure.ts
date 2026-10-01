// Matching tags: highlights, folding ranges and the command that moves between the tags of one block construct.
import { constructAt, templateStructure, type Construct } from '@polyspec/template-format';
import * as vscode from 'vscode';

/** Identifier of the command that moves the cursor to the next tag of the same construct. */
const GO_TO_MATCHING_TAG = 'polyspec-template.goToMatchingTag';

function constructsOf(document: vscode.TextDocument): Construct[] {
  const result = templateStructure(document.getText(), { name: document.uri.fsPath });
  return result.ok ? result.constructs : [];
}

function rangeOf(document: vscode.TextDocument, start: number, end: number): vscode.Range {
  return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

/** Returns the string index of the tag to move to from a cursor index, or null outside every construct. */
function matchingTagIndex(constructs: readonly Construct[], index: number): number | null {
  const found = constructAt(constructs, index);
  if (found !== null) {
    const next = found.construct.tags[(found.tag + 1) % found.construct.tags.length];
    return next === undefined ? null : next.start;
  }
  let inner: Construct | null = null;
  for (const construct of constructs) {
    if (construct.start < index && index < construct.end && (inner === null || construct.start >= inner.start)) inner = construct;
  }
  if (inner === null) return null;
  return (inner.tags.find(tag => tag.start > index) ?? inner.tags[0])?.start ?? null;
}

/** Registers the highlight and folding providers and the matching tag command. */
export function registerStructure(context: vscode.ExtensionContext, language: string): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentHighlightProvider(language, {
      provideDocumentHighlights(document, position) {
        const found = constructAt(constructsOf(document), document.offsetAt(position));
        if (found === null) return [];
        return found.construct.tags.map(tag => new vscode.DocumentHighlight(rangeOf(document, tag.start, tag.end), vscode.DocumentHighlightKind.Text));
      },
    }),
    vscode.languages.registerFoldingRangeProvider(language, {
      provideFoldingRanges(document) {
        const ranges: vscode.FoldingRange[] = [];
        for (const construct of constructsOf(document)) {
          const close = construct.tags[construct.tags.length - 1];
          if (close === undefined) continue;
          const first = document.positionAt(construct.start).line;
          const last = document.positionAt(close.start).line - 1;
          if (last > first) ranges.push(new vscode.FoldingRange(first, last, vscode.FoldingRangeKind.Region));
        }
        return ranges;
      },
    }),
    vscode.commands.registerTextEditorCommand(GO_TO_MATCHING_TAG, editor => {
      const target = matchingTagIndex(constructsOf(editor.document), editor.document.offsetAt(editor.selection.active));
      if (target === null) return;
      const position = editor.document.positionAt(target);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }),
  );
}
