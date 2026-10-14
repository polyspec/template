// Go to Matching Template Tag: moves the cursor to the position that the language server returns for polyspec-template/matchingTag.
import { MATCHING_TAG_METHOD, type MatchingTagParams, type MatchingTagResult } from '@polyspec/template-lsp';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';

/** Identifier of the command that moves the cursor to the next tag of the same construct. */
const GO_TO_MATCHING_TAG = 'polyspec-template.goToMatchingTag';

/**
 * Registers the command. It is a plain command rather than a text editor command, because VS Code does not wait for
 * the promise of a text editor command and the cursor must have moved when the command finishes.
 */
export function registerMatchingTag(context: vscode.ExtensionContext, client: LanguageClient, language: string): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(GO_TO_MATCHING_TAG, async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined || editor.document.languageId !== language) return;
      const params: MatchingTagParams = {
        textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(editor.document),
        position: client.code2ProtocolConverter.asPosition(editor.selection.active),
      };
      const target = await client.sendRequest<MatchingTagResult>(MATCHING_TAG_METHOD, params);
      if (target === null) return;
      const position = client.protocol2CodeConverter.asPosition(target);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position));
    }),
  );
}
