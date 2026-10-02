# Editor support

[한국어](/ko/spec/editor).

This document defines how editors support templates. One language service holds every editor rule, and each editor reaches it through a thin adapter. The formatting style and the indentation rule are in [Formatter and VS Code extension](../operations/editor-tools.md); this document refers to them.

## Layers

**EDT-1** Editor support has three layers:

| Layer | Package | Runs in | Contents |
| --- | --- | --- | --- |
| parser | `@polyspec/template` | browser, Node.js | tag ranges and expression tokens of a source |
| language service | `@polyspec/template-language` | browser, Node.js | every editor rule as functions of the document text; the formatter and the command `template-fmt` |
| adapters | `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `polyspec-template` (VS Code) | Node.js, browser, VS Code | position conversion and feature registration |

**EDT-2** An adapter contains no template rule. It depends on `@polyspec/template-language` and not on `@polyspec/template`. A check fails when an adapter package declares or imports `@polyspec/template`.

**EDT-3** The language service has no dependency on an editor, on Node.js modules or on the DOM, except the command `template-fmt`, which is a separate entry of the package.

## Documents and positions

**EDT-4** `openDocument(text, options)` analyzes a text once; every result of the document comes from that analysis. `options.name` is the template name of diagnostics and `options.delimiters` the engine delimiter option (LEX-22).

**EDT-5** Every position of the language service is a UTF-16 string index into the text, including a byte order mark. A line is a range that ends with `\n`, `\r\n` or the end of the text; lines are numbered from 0. Editors and the Language Server Protocol use the same UTF-16 positions, so an adapter converts positions without counting bytes.

**EDT-6** A text that does not parse still has results. The parser returns the tags and expression tokens it accepted before its first error (`analyzePrefix()` of `@polyspec/template`). An unclosed block is reported at the end of the text, so all tags of such a text are accepted. The language service computes tokens, tag ranges and indentation from the accepted tags; constructs, folding ranges and matching tags use only blocks that are closed.

## Results

**EDT-7** `diagnostics` is empty for a text that parses. Otherwise it holds one error with `start`, `end` (at least one character), `code` and `message` of the parser error, `severity: 'error'` and `source: 'polyspec-template'`.

**EDT-8** `tokens` classifies the template part of the text, sorted by position and not overlapping. Text outside tags has no tokens; adapters highlight it as HTML.

| Type | Text |
| --- | --- |
| `delimiter` | open and close delimiters of a tag, including the wrapper of a wrapped tag |
| `keyword` | sigils (`=`, `?`, `:?`, `:`, `@`, `/`, `+`, `#`, `?#`, `%`), `true`, `false`, `null`, `in` and the word `delimiter` of a directive |
| `variable` | a name that is not followed by `(` and not preceded by `.` |
| `property` | a name or index after `.` that is not followed by `(` |
| `function` | a name followed by `(`, and the function after a pipe |
| `string` | string literals, quoted paths and the value of a delimiter directive |
| `number` | number literals |
| `operator` | operators and punctuation inside a tag |
| `comment` | a template comment `{* *}` |
| `path` | an unquoted include path and the unquoted words of a block tag body |

**EDT-9** `tags` lists the range of every accepted tag except comments. Editors paint these ranges with the tag background: `#16351c` in dark themes and `#e3f6dd` in light themes.

**EDT-10** A construct is a loop, if or if-block tag, its else-if and else tags and its close tag. `foldingRanges` holds, for every construct whose close tag starts on a later line, the range from the line of the opening tag to the line before the close tag.

**EDT-11** `highlights(index)` returns the ranges of all tags of the construct that has a tag containing `index`, including the index after the tag; otherwise it is empty. `matchingTag(index)` returns the start of the next tag of that construct, the opening tag after the last one; outside every tag it returns the next tag of the innermost construct around `index`, or null.

**EDT-12** `format(options)` is `format()` of the formatter with the options `indent`, `templateBlocks` and `range`.

**EDT-13** `lineIndentation(line, options)` returns the indentation a line gets while it is typed: the indent unit repeated by the line's depth under the indentation rule of the formatter, with `options.indent` and `options.templateBlocks`. The depth comes from the text before the line. Unlike the formatter, it does not require a balanced structure: an end tag closes up to the open element of the same name and is ignored when no such element is open. A blank line, which Enter creates, gets the indentation of its depth; only the formatter empties blank lines.

## Adapters

**EDT-14** `@polyspec/template-lsp` is a Language Server Protocol server over standard input and output (command `template-lsp`). It uses `positionEncoding` `utf-16` and full text synchronization and provides:

| Capability | Result |
| --- | --- |
| published diagnostics | `diagnostics` (EDT-7) |
| `textDocument/semanticTokens/full` | `tokens` with the token types of EDT-8 as the legend |
| `textDocument/foldingRange` | `foldingRanges` (EDT-10) |
| `textDocument/documentHighlight` | `highlights` (EDT-11) |
| `textDocument/formatting`, `textDocument/rangeFormatting` | `format` with the client's `tabSize` and `insertSpaces` (EDT-12) |
| `textDocument/onTypeFormatting` on `\n`, `>` and `}` | an edit that sets the indentation of the current line to `lineIndentation` (EDT-13) |
| request `polyspec-template/tagRanges` | `tags` (EDT-9) |
| request `polyspec-template/matchingTag` | `matchingTag` (EDT-11) |

The setting `polyspec-template.format.templateBlocks` (`indent` or `flat`) is read with `workspace/configuration` for each document.

Positions and ranges are `Position` and `Range` values of the protocol. The custom requests have these parameters and results:

| Request | Parameters | Result |
| --- | --- | --- |
| `polyspec-template/tagRanges` | `{ textDocument: TextDocumentIdentifier }` | `Range[]` in text order, or `null` when the document is not open |
| `polyspec-template/matchingTag` | `{ textDocument: TextDocumentIdentifier, position: Position }` | the `Position` where the matching tag starts, or `null` when there is no matching tag or the document is not open |

- The server analyzes each version of a document once (EDT-4). It publishes the diagnostics of every version with the version number and publishes an empty list when the document closes. The template name of a document is the file path of a `file:` URI, otherwise the URI.
- The legend of the semantic tokens is the token types of EDT-8 in that order, without modifiers. A token that spans lines is sent as one token per line unless the client declares `multilineTokenSupport`.
- A folding range starts on the protocol line where its first line starts and ends on the protocol line before the line of the close tag.
- Formatting returns one edit that replaces the whole text, or no edit when the text is formatted. The indent unit is `tabSize` spaces, or one tab when `insertSpaces` is false. When `format` returns an error, the server returns no edits and sends `path:line:col: LABEL: message; no edits returned` as a `window/logMessage` warning; `LABEL` is the parser error code, `HTML structure` or `formatted AST differs`.
- The current line of `textDocument/onTypeFormatting` is the line of the request position. The edit replaces the spaces and tabs at the start of that line; the server returns no edit when they already equal `lineIndentation`.
- Formatting and on-type formatting request `workspace/configuration` with `{ scopeUri: <document URI>, section: 'polyspec-template' }` and use `format.templateBlocks` of the result. Any other value than `flat`, and a client without the `workspace/configuration` capability, give `indent`.

**EDT-15** The VS Code extension `polyspec-template` is a client of `@polyspec/template-lsp`, which it bundles. It keeps the TextMate grammar, which highlights HTML and template tags before the server answers; the semantic tokens of the server then replace the template token colors. It paints the tag background from `polyspec-template/tagRanges` and moves the cursor with `polyspec-template/matchingTag`.

**EDT-16** `@polyspec/template-codemirror` exports `template(options)`, a CodeMirror 6 extension built on `@codemirror/lang-html`. It marks tokens with the classes `cm-template-<type>`, paints the tag background, reports diagnostics through `@codemirror/lint`, provides folding, matching tag highlights, an indentation service with `lineIndentation` and the command `formatTemplate` (bound to `Shift-Alt-f`), which uses the editor's indent unit. `options.templateBlocks` and `options.delimiters` are passed to the language service.

## Conformance

**EDT-17** The editor fixtures under `packages/template-language/tests/editor` give, for each template, the expected diagnostics, tokens, tag ranges, folding ranges, highlights and matching tags at listed positions, the indentation of every line and the formatted text. The language service, the LSP server (through its protocol over standard input and output) and the CodeMirror adapter (through an `EditorState`) must give the same results after position conversion.
