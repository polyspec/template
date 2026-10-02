// Diagnostics of the language service as CodeMirror lint diagnostics (EDT-7).
import type { EditorState } from '@codemirror/state';
import { linter, type Diagnostic } from '@codemirror/lint';
import { templateDocument } from './document.js';

/** The diagnostics of the state's document. The message starts with the error code. */
export function templateDiagnostics(state: EditorState): Diagnostic[] {
  return state.field(templateDocument).diagnostics.map(item => ({
    from: item.start,
    to: item.end,
    severity: item.severity,
    source: item.source,
    message: `${item.code}: ${item.message}`,
  }));
}

/** The lint source of the template extension. */
export const templateLinter = linter(view => templateDiagnostics(view.state));
