// Package entry: the CodeMirror 6 adapter of the template language service (EDT-16).
import type { Extension } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { templateFormatKey } from './commands.js';
import { templateDocument } from './document.js';
import { templateFolding } from './fold.js';
import { templateIndentation } from './indent.js';
import { templateLinter } from './lint.js';
import { templateMarks } from './marks.js';
import { templateOptions, type TemplateOptions } from './options.js';
import { templateTheme } from './theme.js';

export { formatTemplate, goToMatchingTag } from './commands.js';
export { templateDocument } from './document.js';
export { templateDiagnostics } from './lint.js';
export type { TemplateOptions } from './options.js';

/**
 * The template language for CodeMirror 6: the HTML language with template token classes, tag backgrounds,
 * diagnostics, folding, matching tag highlights, indentation and the format command bound to `Shift-Alt-f`.
 */
export function template(options: TemplateOptions = {}): Extension {
  return [
    templateOptions.of(options),
    templateDocument,
    html(),
    templateMarks,
    templateTheme,
    templateLinter,
    templateFolding,
    templateIndentation,
    templateFormatKey,
  ];
}
