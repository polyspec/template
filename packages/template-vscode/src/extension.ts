// VS Code extension entry: registers formatting, parse diagnostics, tag backgrounds and the tag structure features of the template language.
import * as vscode from 'vscode';
import { registerDecorations } from './decorations.js';
import { registerDiagnostics } from './diagnostics.js';
import { registerFormatting } from './formatting.js';
import { registerStructure } from './structure.js';

const LANGUAGE = 'polyspec-template';

/** Registers every provider of the template language. */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Polyspec Template', { log: true });
  context.subscriptions.push(output);
  registerFormatting(context, LANGUAGE, output);
  registerDiagnostics(context, LANGUAGE);
  registerDecorations(context, LANGUAGE);
  registerStructure(context, LANGUAGE);
}

/** Nothing to release; the subscriptions are disposed by VS Code. */
export function deactivate(): void {}
