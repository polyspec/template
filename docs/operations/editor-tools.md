<!-- doc-id: docs-operations-editor-tools -->
# Formatter, language server and editors

[한국어](/ko/operations/editor-tools).

Four TypeScript packages support template authors:

- `packages/language` (`@polyspec/template-language`): the language service `openDocument()` ([editor support](../spec/editor.md)), the formatter `format()` ([formatting](../spec/formatting.md)), the command line tool `template-fmt` and the conformance command `template-language`.
- `packages/lsp` (`@polyspec/template-lsp`): the Language Server Protocol server `template-lsp`, an adapter of the language service.
- `packages/codemirror` (`@polyspec/template-codemirror`): the CodeMirror 6 extension `template()`, which registers the results of the language service in a CodeMirror editor ([CodeMirror 6 adapter](#codemirror-6-adapter)).
- `packages/vscode` (`polyspec-template`): the VS Code extension with the language definition, a TextMate grammar of the HTML host and a client of the bundled language server. It contains no template rules.

Only the language service reads the template syntax from `@polyspec/template`: the language service and the formatter use the parser's tag ranges, tag bodies and tokens, which the parser classifies by EDT-8, and declare no lexical table of their own (`packages/language/tests/lexical-tables.test.ts`). The server, the CodeMirror adapter and the extension call the language service; the extension colors the template tags with the semantic tokens of the server, not with a grammar.

## Formatter

The formatting style, the indentation, the parts that the formatter keeps and the safety invariant are rules of the specification ([formatting](../spec/formatting.md), FMT-3 to FMT-15); every implementation formats by them, and the conformance cases compare the results (CNF-18). This section describes the TypeScript formatter `format()` of `@polyspec/template-language`.

`format(source, options)` takes the options `indent` (FMT-9, two spaces by default, `null` keeps the indentation), `templateBlocks` (`'indent'` or `'flat'`), `delimiters` (the engine delimiters, FMT-8), `name` (the template name of errors) and `range` (only the tags that lie completely inside the range and the lines that start inside it are formatted). It parses the source with `analyze()` of `@polyspec/template`, formats each tag from the parser's tag body and tokens, and returns one of these results (FMT-14):

| Result | Condition |
| --- | --- |
| `{ ok: true, text, changed }` | the source parses and the formatted AST equals the source AST |
| `{ ok: false, error: { reason: 'parse', code, line, col, message } }` | the source does not parse |
| `{ ok: false, error: { reason: 'invariant', code: null, line, col, message } }` | the formatted text does not parse or parses to a different AST |
| `{ ok: false, error: { reason: 'html', code: null, line, col, message } }` | the HTML structure is not balanced (FMT-12) |

A template whose output is not HTML is formatted with `indent: null`.

The invariant test (`packages/language/tests/invariant.test.ts`) formats every `.tpl` file under `tests/cases` (with the delimiters of `options.json`), `tests/fixtures`, `examples` and the formatter fixtures, once with `indent: null` and once with the default indentation. For each file that parses, `indent: null` must give the same AST without spans and the same text outside tags. The default indentation must give either the `html` error or the same AST and the same text outside tags once the spaces and tabs at the start of lines are removed. Both must not change on a second run (FMT-13, FMT-15). `packages/language/tests/conformance.test.ts` compares the results of every conformance case with its `expected.format.json`.

The command `template-language format [--indent none|tab|N] [--delimiters OC] FILE` (`packages/language/bin/template-language.mjs`) is the format command of TypeScript in the conformance contract (CNF-4, CNF-5); like `template-fmt`, it parses its options with node:util `parseArgs`: it prints the formatted text, or the error as JSON on standard error with exit status 2.

## Command line

```sh
make template-install-cli
template-fmt --help
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

```
usage: template-fmt [--write | --check] [--delimiters OC] [--indent N|tab|none]
                    [--template-blocks indent|flat] [PATH ...]
```

- One file without `--write` or `--check`: the formatted text goes to standard output.
- No path or `-`: the command reads standard input and writes standard output.
- A directory: the command formats every `.tpl` file below it, in sorted order, and skips `node_modules` and directories whose name starts with `.`. Several paths or a directory require `--write` or `--check`.
- `--write`: rewrites every file that is not formatted and prints its path.
- `--check`: changes nothing and prints the path of every file that is not formatted.
- `--indent`: the indent unit, `N` spaces (1 to 8), `tab`, or `none` for `indent: null` (every line keeps its indentation). The default is `2`.
- `--template-blocks`: `indent` (default) or `flat`, the `templateBlocks` option.
- A file that does not parse, whose formatted AST differs or whose HTML structure is not balanced (FMT-14) is printed to standard error as `path:line:col: LABEL: message` and is not changed. `LABEL` is the parser error code, `formatted AST differs` or `HTML structure`.

| Exit status | Meaning |
| --- | --- |
| 0 | success; with `--check`, every file is formatted |
| 1 | `--check` found a file that is not formatted |
| 2 | a file does not parse, a formatted AST differs, an HTML structure is not balanced, a path cannot be read, or the arguments are invalid |

`make template-install-cli` installs the command `template-fmt` under the prefix `CLI_PREFIX` (default `~/.local`) without a symbolic link: `scripts/install-cli.mts` writes the npm project `<prefix>/lib/polyspec-template-fmt`, which installs copies of the built formatter package and of the template package of this checkout without bin links, and the executable script `<prefix>/bin/template-fmt`, which runs `node` with the entry of the copied formatter package by its absolute path. The install is prepared in `<prefix>/lib/.polyspec-template-fmt.next-<pid>` and replaces the project with a rename, and the script is written through a temporary file and a rename, so a failed install keeps the previous one. Put `<prefix>/bin` on `PATH`. Run it again after `make template-build-language` to install the changed build; `make uninstall-cli` removes the project and the script.

## Language server

```sh
make template-build-lsp
node packages/lsp/bin/template-lsp.mjs --stdio
```

`template-lsp` serves the Language Server Protocol over standard input and output for an editor with a Language Server Protocol client: the client starts the command for `.tpl` documents. The server provides the capabilities of the language server ([editor support](../spec/editor.md)): diagnostics, semantic tokens, folding ranges, document highlights, document and range formatting, on-type indentation after `\n`, `>` and `}`, and the requests `polyspec-template/tagRanges` and `polyspec-template/matchingTag`. It reads the setting `polyspec-template.format.templateBlocks` with `workspace/configuration` and writes format errors to the client log as warnings. The server contains no template rule: it calls `openDocument()` once per document version and converts the UTF-16 string indexes of the language service to protocol positions. The argument `--stdio`, which Language Server Protocol clients pass, is accepted and has no effect.

## VS Code extension

```sh
make vscode-package
make vscode-install
code --list-extensions --show-versions | grep polyspec
```

`make vscode-package` bundles `src/extension.ts` with `vscode-languageclient` into `dist/extension.cjs`, bundles the server entry `@polyspec/template-lsp/server` with `@polyspec/template-language` and `@polyspec/template` into `dist/server.cjs`, and writes `packages/vscode/dist/polyspec-template.vsix`. The installed extension does not need the repository at run time. `make vscode-install` runs `code --install-extension` with `--force`.

The extension is a client of the language server `template-lsp`. The language client starts `dist/server.cjs` with the Node.js runtime of VS Code and talks to it over standard input and output; the client sends the text of every open document of the language `polyspec-template`, in any URI scheme, to the server.

The extension declares `capabilities.untrustedWorkspaces.supported`, because the extension and its server only read the text of open documents and run no code of the workspace. Without the declaration VS Code disables the extension, including its grammar, in Restricted Mode, and a `.tpl` file in an untrusted folder opens as plain text. The extension also declares `capabilities.virtualWorkspaces`: the server receives document text only through the protocol and never reads the file system, so a document of a virtual workspace is analyzed as a file is, and its URI is the template name of its diagnostics. The extension has only a `main` entry and no `browser` entry, so VS Code for the Web, which has no Node.js extension host, does not run it. VS Code runs extensions and the server on the Node.js of its Electron build. VS Code 1.138.0 uses Electron 42.10.0 with Node.js 24.18.1, so both bundles target `node24`, and the extension declares `engines.vscode` `^1.138.0` and `engines.node` `>=24.18.1`, the Node.js of that Electron. The Node.js pin of kit, 26.12.0, is the floor of the other packages; an exception of `config/toolchain.json` with the scope `packages/vscode` and the channel 24.18.1 lets the toolchain check accept the floor of the extension.

The extension registers the language `polyspec-template` for `.tpl` files with:

- block comment `{* *}` for comment toggling;
- brackets and auto-closing pairs for `{ }`, `[ ]`, `( )`, quotes and `<!-- -->`;
- document and range formatting from the server. The indent unit is the editor's: `tabSize` spaces, or a tab when `insertSpaces` is off. The setting `polyspec-template.format.templateBlocks` (`indent` or `flat`) is the `templateBlocks` option; the server reads it with `workspace/configuration`. Range formatting formats the tags that lie completely inside the selection and indents the lines that start inside it. When `format()` returns an error, the server returns no edits and writes the position as a warning to the output channel `Polyspec Template`;
- indentation while typing: after Enter, `>` and `}` the server sets the indentation of the current line to `lineIndentation()`. VS Code requests it only when `editor.formatOnType` is on, so the extension contributes `"[polyspec-template]": { "editor.formatOnType": true }` as a configuration default; a user or workspace setting for the language overrides it. A blank line after Enter gets the indentation of its depth.

### Diagnostics and matching tags

The server takes diagnostics, tokens, tag ranges, constructs, folding ranges and matching tags from `openDocument()` of the language service ([editor support](../spec/editor.md)). A test of the language service compares the constructs with the `If`, `For` and `IfBlock` spans and the branch spans of the AST for every conformance case:

- Diagnostics: the server publishes the parse error of every document version, for example `E_PARSE_UNCLOSED_BLOCK`, `E_PARSE_UNEXPECTED_CLOSE` or `E_PARSE_ELSE_OUTSIDE_BLOCK`, at the parser position with the error code. The diagnostic is removed when the document parses or closes.
- Semantic tokens: the server classifies the template part of the text with the token types of EDT-8; text outside tags keeps the HTML colors of the grammar. The extension contributes the types that VS Code does not define with `semanticTokenTypes`: `delimiter` with the super type `keyword` and `path` with the super type `string`. `semanticTokenScopes` maps `delimiter` to `keyword.control.tag.begin.polyspec-template`, `keyword` to `keyword.control.polyspec-template` and `path` to `string.unquoted.path.polyspec-template`, so a theme without semantic token rules colors delimiters and sigils with `keyword.control`. The extension contributes `"[polyspec-template]": { "editor.semanticHighlighting.enabled": true }` as a configuration default, because the default `configuredByTheme` leaves the tags uncolored in a theme that does not enable semantic highlighting; a user or workspace setting for the language overrides it.
- Tag backgrounds: every tag except comments gets the deep green background `#16351c` in dark themes and `#e3f6dd` in light themes. The background differs in lightness from the editor background (ΔL* +13.4 on Dark 2026, 5.1 on Light 2026) and keeps every syntax color of Dark 2026 above 4.5:1; the lowest is the keyword sigils at 4.8:1. A more saturated green such as `#044700` stands out more but lowers the sigils to 4.0:1, and a color at the editor's own lightness, such as black on a dark theme, cannot be told apart. The extension requests `polyspec-template/tagRanges` when a template editor appears and 250 ms after the last change, and paints the result only when the document did not change while the request ran. While a document does not parse, the backgrounds cover the tags the parser accepted before its error. The extension returns `tagRanges(document)` as its API (`vscode.extensions.getExtension('polyspec.polyspec-template').exports`), which gives the ranges that it paints; the integration test reads them there, because VS Code has no API that reads the decorations of an editor.
- Highlights: with the cursor on an opening, branch or close tag, every tag of the same construct is highlighted.
- Folding: each construct whose close tag is on a later line folds from the line of its opening tag to the line before its close tag.
- The command Go to Matching Template Tag (`polyspec-template.goToMatchingTag`) requests `polyspec-template/matchingTag` and moves the cursor to the next tag of the construct under the cursor, and from the last tag to the opening tag. Outside a tag it moves to the next tag of the innermost enclosing construct. The keybinding is `Cmd+Alt+\` on macOS and `Ctrl+Alt+\` on Windows and Linux, active only in a template editor. The integration test checks on macOS that the default keybindings of VS Code 1.138.0 bind `Cmd+Alt+\` to no other command.

While a document does not parse, highlights, folding and the command use only the constructs that are closed. The extension does not check the balance of HTML elements across template branches; HTML structure is left to the HTML features of VS Code.

### Grammar

The grammar `text.html.polyspec-template` only includes `text.html.basic`, which embeds CSS in `<style>` and JavaScript in `<script>`; it has no template rule. The semantic tokens of the server color every tag, in text, inside attribute values and between attributes, in CSS, in JavaScript and in HTML comments, since the server reads the tags with the parser of `analyze`. A regular expression grammar has no parser context: it disagreed with `analyze` about tags after a `{% delimiter ..}` directive, about a tag body that is an error, and about tags that an HTML pattern covers, such as a tag in an unquoted attribute value. Until the server answers, a tag shows the HTML color of its position.

## CodeMirror 6 adapter

`packages/codemirror` (`@polyspec/template-codemirror`) is a CodeMirror 6 extension built on `@codemirror/lang-html`. It takes every result from `openDocument()` of the language service, converts nothing but positions and contains no template rule ([editor support](../spec/editor.md)). CodeMirror and the language service both use UTF-16 string indexes into the document text, so a language service position is a CodeMirror position. The packages `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lint`, `@codemirror/lang-html` and `@codemirror/commands` are peer dependencies, so the adapter uses the one instance of each that the editor uses.

```ts
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { goToMatchingTag, template } from '@polyspec/template-codemirror';

new EditorView({
  parent: document.querySelector('#editor') as HTMLElement,
  state: EditorState.create({
    doc: '<ul>\n  {@ item = items}\n    <li>{= item.name}</li>\n  {/}\n</ul>\n',
    extensions: [
      keymap.of([{ key: 'Mod-Alt-\\', run: goToMatchingTag }, ...defaultKeymap]),
      template({ templateBlocks: 'indent', name: 'list.tpl' }),
    ],
  }),
});
```

`template(options)` returns the extension. Its options:

| Option | Meaning |
| --- | --- |
| `templateBlocks` | `indent` (default) or `flat`; the `templateBlocks` option of the indentation service and of `formatTemplate` |
| `delimiters` | the engine delimiter option, two characters; the default is `{}` |
| `name` | the template name of diagnostics; the default is `template.tpl` |

The extension contains:

- the HTML language of `@codemirror/lang-html`;
- the state field `templateDocument`, which holds the `TemplateDocument` of the state's text. The text is analyzed once when the document changes, and every feature below reads that analysis;
- a mark with the class `cm-template-<type>` on every token of EDT-8. Token marks have a higher precedence than syntax highlighting, so their elements are inside the elements of the HTML highlighting and a template token inside an HTML attribute value keeps the template color;
- a mark with the class `cm-template-tag` on every tag range, with the lowest precedence, so its element encloses the token marks of the tag;
- a mark with the class `cm-template-highlight` on every tag of the construct under the main cursor (`highlights`);
- diagnostics through `linter` of `@codemirror/lint` with severity `error`, source `polyspec-template` and the message `CODE: message`, for example `E_PARSE_UNCLOSED_BLOCK: block is not closed before the end of the file`. `templateDiagnostics(state)` returns the same diagnostics for a state;
- folding through `foldService` from `foldingRanges`. The fold of a line hides the lines after the opening tag up to the line before the close tag. CodeMirror folds one range per line; when several constructs start on one line, the one that ends last folds;
- an `indentService` that returns the column width of `lineIndentation` for the line with the editor's `indentUnit` and `templateBlocks`. When Enter breaks a line, the service analyzes the text with the break, so the new line and the text moved to it get the indentation of a typed line. The indent unit must be a run of spaces or one tab, as the language service requires;
- Shift+Alt+F, which runs `formatTemplate`.

The default theme (`EditorView.baseTheme`) colors the marks. `&dark` applies in an editor with a dark theme and `&light` in all others. The tag background is `#16351c` in dark themes and `#e3f6dd` in light themes, the highlight is a one pixel outline in `#7ee787` (dark) and `#1a7f37` (light), and comments are italic. A theme with the same classes overrides these rules.

| Class | Dark | Light |
| --- | --- | --- |
| `cm-template-delimiter` | `#ff7b72` | `#cf222e` |
| `cm-template-keyword` | `#ff7b72` | `#cf222e` |
| `cm-template-variable` | `#ffa657` | `#953800` |
| `cm-template-property` | `#79c0ff` | `#0550ae` |
| `cm-template-function` | `#d2a8ff` | `#8250df` |
| `cm-template-string` | `#a5d6ff` | `#0a3069` |
| `cm-template-number` | `#79c0ff` | `#0550ae` |
| `cm-template-operator` | `#e6edf3` | `#1f2328` |
| `cm-template-comment` | `#8b949e` | `#6e7781` |
| `cm-template-path` | `#a5d6ff` | `#0a3069` |

Commands:

| Command | Effect |
| --- | --- |
| `formatTemplate` | replaces the document with `format()` with the editor's `indentUnit` and the `templateBlocks` option. When `format()` returns an error, it changes nothing and returns `false`. Shift+Alt+F runs it. |
| `goToMatchingTag` | moves the main cursor to `matchingTag` of its position and returns `false` when there is none. The extension binds no key to it; the example binds `Mod-Alt-\`. |

Shift+Alt+F is bound to the physical key F (`KeyboardEvent.code` `KeyF`) and not through a keymap entry `Shift-Alt-f`. A keymap entry matches the typed character, and on macOS Option+Shift+F types `Ï`, so the entry would never run there.

## Verification

```sh
make template-test-language
make template-test-lsp
make format-check
make template-test-codemirror
make template-test-vscode
make template-test-vscode-integration
make format-external-check TEMPLATE_SOURCE_ROOT=/path/to/templates
```

`make template-test-lsp` starts the built command `template-lsp` as a child process, speaks the protocol over its standard input and output with `vscode-jsonrpc` and compares, for every editor fixture, the published diagnostics, the decoded semantic tokens, the tag ranges, the folding ranges, the highlights and matching tags at the fixture positions, the on-type indentation of every line in both `templateBlocks` modes and the formatted text with the expected results. It also compares a text with a byte order mark, CRLF line ends and characters outside the Basic Multilingual Plane with the language service, and checks the declared capabilities, the split of a multi-line token for a client without `multilineTokenSupport`, the configuration request, a format error, range formatting and on-type formatting without an edit.

`make template-test-vscode` tests the manifest, that the grammar only includes `text.html.basic`, that `dist/extension.cjs` loads only `vscode` and Node.js built-in modules and `dist/server.cjs` only Node.js built-in modules, that the `.vsix` contains both, that the manifest contributes every token type of the server legend that VS Code does not define, and that the bundled server publishes diagnostics and answers `polyspec-template/tagRanges`, `polyspec-template/matchingTag` and on-type formatting over standard input and output. The language client runs only in VS Code, so the integration test covers it. `make template-test-vscode-integration` builds the `.vsix`, uses VS Code 1.138.0, the minimum of `engines.vscode`, that `make template-install-vscode` installs after `make install` with the VS Code installer of kit (`@polyspec/kit/install-vscode`) into `var/tools/vscode` (the option `--vscode` of `tests/integration/run.mjs`), and installs the `.vsix` into a new extensions directory with the VS Code command line. It starts VS Code with workspace trust enabled and the test folder untrusted, as a user installation runs, and checks that a `.tpl` document opens with the language `polyspec-template`, that the installed extension activates and starts the bundled server, that `editor.semanticHighlighting.enabled` is on for the language, that the tag ranges the extension paints cover every tag except comments, also in a document that does not parse, that `vscode.provideDocumentSemanticTokens` returns the token types of the server for a tag in text and for a tag inside an HTML attribute value, that `editor.formatOnType` is on for the language and typing `}` and Enter indents the current line, that an unclosed `{?` produces a diagnostic at its position, that document highlights, folding ranges and Go to Matching Template Tag follow one construct, that the keybinding is free, and that `vscode.executeFormatDocumentProvider` returns the expected edits for a sample and no edits for a formatted document and for a document that does not parse. A second run removes `capabilities` from the installed manifest and requires that VS Code disables the extension in that workspace, which shows that the first run detects a missing capability. Each profile installation and each VS Code launch is a step without a time limit (`tests/integration/step.mjs`): it prints its start, a line every 10 s while it runs and its result with its elapsed time, and the installation and the launch print the output of VS Code as it arrives. An installation is judged by its exit code and a launch by its exit code or the result of its suite. Each check has a timeout of 20 s, and the suite prints `[suite] start - <check>` and then `[suite] ok - <check> (<ms> ms)` or `[suite] not ok - <check> (<ms> ms)` for every check. A check that waits for the extension, such as for the format of a typed line, has no time limit of its own (`tests/integration/suite/wait.cjs`): only the timeout of the check ends the wait, and its error names what the check waited for with the expected and the actual text (T20.1-7). A launch ends with the result of its suite: VS Code 1.138 sometimes takes minutes to exit after the suite has printed `[suite] N of M checks passed`, so VS Code has 20 s to exit after that line, and is then killed with its process group. The 20 s start after the suite result has been printed; they end VS Code and do not decide the result.

The integration run never downloads VS Code; without an installed copy it fails with `run make install-vscode`. Only a run of the integration test needs VS Code, so `make install` does not download it, and in CI only the jobs that run the integration test run `make template-install-vscode` (T20.1-6). The installer downloads a copy into `var/tools/vscode/.next-<pid>` and renames it to `vscode-<platform>-<version>`, so a reader finds no copy or a complete one, and a present copy is not downloaded again. An installed copy never changes, so it needs no lock (T20.1-4).

`make template-test-codemirror` builds the adapter and runs two kinds of tests. The Vitest tests create an `EditorState` without a DOM for every editor fixture under `packages/language/tests/editor` and compare with the fixture's expected results the diagnostics of `templateDiagnostics`, the token and tag marks of the state's decoration sets, the folding ranges of the fold service, the highlight marks and the `goToMatchingTag` target at every query position, the indentation service result of every line with `templateBlocks` `indent` and `flat` and the indent unit of two spaces, and the result of `formatTemplate`. Further tests type a line and press Enter with `insertNewlineAndIndent`, and check the options, the indent unit of `formatTemplate` and the reuse of one analysis per text. The Playwright test bundles `tests/browser/page.ts` with esbuild into `packages/codemirror/dist/browser/page.js`, loads it into a blank Chromium page and checks the indentation after typing `<ul>`, Enter, `{@ x = xs}` and Enter, the token classes, the template color inside an HTML attribute value, the tag background in light and dark themes, the lint diagnostic of an unclosed block, and Shift+Alt+F on a text that formats and on a text that does not parse.

The CI job `editor` runs `make editor-boundary-check template-test-language format-check template-test-lsp template-test-codemirror template-test-vscode` and runs `make template-test-vscode-integration` on a virtual X server with `xvfb-run`, because VS Code needs a display.

`make format-external-check` runs the invariant test also on an explicit external template tree.

## Language service rules

- Editor support has three layers:

| Layer | Package | Runs in | Contents |
| --- | --- | --- | --- |
| parser | `@polyspec/template` | browser, Node.js | tag ranges, tag bodies and the classified tokens of a source |
| language service | `@polyspec/template-language` | browser, Node.js | every editor rule as functions of the document text; the formatter and the command `template-fmt` |
| adapters | `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `polyspec-template` (VS Code) | Node.js, browser, VS Code | position conversion and feature registration |

- An adapter contains no template rule. It depends on `@polyspec/template-language` and not on `@polyspec/template`. A check fails when an adapter package declares or imports `@polyspec/template` (`make editor-boundary-check`, the editor boundary checker of kit with `config/editor-boundaries.json`).

- The language service has no dependency on an editor, on Node.js modules or on the DOM, except the command `template-fmt`, which is a separate entry of the package under `src/cli`. The same check fails when a source of the language service outside `src/cli` imports a `node:` module, `vscode`, a `vscode-` package or a CodeMirror package, or uses a DOM object.

- `openDocument(text, options)` analyzes a text once; every result of the document comes from that analysis. `options.name` is the template name of diagnostics, `options.delimiters` the engine delimiter option (LEX-22) and `options.location` the file of the document with the host.

- Every position of the language service is a UTF-16 string index into the text, including a byte order mark. A line is a range that ends with `\n`, `\r\n` or the end of the text; lines are numbered from 0. Editors and the Language Server Protocol use the same UTF-16 positions, so an adapter converts positions without counting bytes.

- A text that does not parse still has results. The parser returns the tags it accepted before its first error and their tokens (`analyzePrefix()` of `@polyspec/template`). An unclosed block is reported at the end of the text, so all tags of such a text are accepted. The language service computes tokens, tag ranges and indentation from the accepted tags; constructs, folding ranges and matching tags use only blocks that are closed.

- For a text that does not parse, `diagnostics` holds one error with `start`, `end` (at least one character), `code` and `message` of the parser error, `severity: 'error'` and `source: 'polyspec-template'`. For a text that parses, it holds the path diagnostics in text order, in the same form over the range of their tag.

- A construct is a loop, if or if-block tag, its else-if and else tags and its close tag. `foldingRanges` holds, for every construct whose close tag starts on a later line, the range from the line of the opening tag to the line before the close tag.

- `highlights(index)` returns the ranges of all tags of the construct that has a tag containing `index`, including the index after the tag; otherwise it is empty. `matchingTag(index)` returns the start of the next tag of that construct, the opening tag after the last one; outside every tag it returns the next tag of the innermost construct around `index`, or null.

- `format(options)` is `format()` of the formatter with the options `indent`, `templateBlocks` and `range`.

- `lineIndentation(line, options)` returns the indentation a line gets while it is typed: the indent unit repeated by the line's depth under the indentation rule of the formatter (FMT-9, FMT-10), with `options.indent` and `options.templateBlocks`. The depth comes from the text before the line. Unlike the formatter, it does not require a balanced structure: an end tag closes up to the open element of the same name and is ignored when no such element is open. A blank line, which Enter creates, gets the indentation of its depth; only the formatter empties blank lines.

- `@polyspec/template-lsp` is a Language Server Protocol server over standard input and output (command `template-lsp`). It uses `positionEncoding` `utf-16` and full text synchronization and provides:

| Capability | Result |
| --- | --- |
| published diagnostics | `diagnostics` |
| `textDocument/semanticTokens/full` | `tokens` with the token types of EDT-8 as the legend |
| `textDocument/foldingRange` | `foldingRanges` |
| `textDocument/documentHighlight` | `highlights` |
| `textDocument/formatting`, `textDocument/rangeFormatting` | `format` with the client's `tabSize` and `insertSpaces` |
| `textDocument/onTypeFormatting` on `\n`, `>` and `}` | an edit that sets the indentation of the current line to `lineIndentation` |
| request `polyspec-template/tagRanges` | `tags` |
| request `polyspec-template/matchingTag` | `matchingTag` |

The setting `polyspec-template.format.templateBlocks` (`indent` or `flat`) is read with `workspace/configuration` for each document.

Positions and ranges are `Position` and `Range` values of the protocol. The custom requests have these parameters and results:

| Request | Parameters | Result |
| --- | --- | --- |
| `polyspec-template/tagRanges` | `{ textDocument: TextDocumentIdentifier }` | `Range[]` in text order, or `null` when the document is not open |
| `polyspec-template/matchingTag` | `{ textDocument: TextDocumentIdentifier, position: Position }` | the `Position` where the matching tag starts, or `null` when there is no matching tag or the document is not open |

- The server analyzes each version of a document once. It publishes the diagnostics of every version with the version number and publishes an empty list when the document closes. The template name of a document is the file path of a `file:` URI, otherwise the URI. A document of a `file:` URI is opened with its file path as `options.location` and a host over `node:fs`; a document of another URI has no location. With every analysis of a document that has a marker, the server publishes the diagnostics of the marker on the `file:` URI of the marker, an empty list for a valid marker.
- The legend of the semantic tokens is the token types of EDT-8 in that order, without modifiers. A token that spans lines is sent as one token per line unless the client declares `multilineTokenSupport`.
- A folding range starts on the protocol line where its first line starts and ends on the protocol line before the line of the close tag.
- Formatting returns one edit that replaces the whole text, or no edit when the text is formatted. The indent unit is `tabSize` spaces, or one tab when `insertSpaces` is false. When `format` returns an error, the server returns no edits and sends `path:line:col: LABEL: message; no edits returned` as a `window/logMessage` warning; `LABEL` is the parser error code, `HTML structure` or `formatted AST differs`.
- The current line of `textDocument/onTypeFormatting` is the line of the request position. The edit replaces the spaces and tabs at the start of that line; the server returns no edit when they already equal `lineIndentation`.
- Formatting and on-type formatting request `workspace/configuration` with `{ scopeUri: <document URI>, section: 'polyspec-template' }` and use `format.templateBlocks` of the result. Any other value than `flat`, and a client without the `workspace/configuration` capability, give `indent`.

- The VS Code extension `polyspec-template` is a client of `@polyspec/template-lsp`, which it bundles. Its TextMate grammar highlights only the HTML host with its embedded CSS and JavaScript; the template tags are colored only by the semantic tokens of the server, which the extension enables for the language. It paints the tag background from `polyspec-template/tagRanges` and moves the cursor with `polyspec-template/matchingTag`.

- `@polyspec/template-codemirror` exports `template(options)`, a CodeMirror 6 extension built on `@codemirror/lang-html`. It marks tokens with the classes `cm-template-<type>`, paints the tag background, reports diagnostics through `@codemirror/lint`, provides folding, matching tag highlights, an indentation service with `lineIndentation` and the command `formatTemplate` (bound to `Shift-Alt-f`), which uses the editor's indent unit. `options.templateBlocks`, `options.delimiters` and `options.location` are passed to the language service.

- A file `template-root.json` declares a template root: its directory. The root of a document is declared by the marker in the nearest ancestor directory of the document, the directory of the document first, up to the file system root; only a regular file is a marker. The marker serves the tools that no caller gives a root: the language service, the LSP server and the CodeMirror adapter through `options.location`. The compiler keeps its `root` argument, the filesystem loader its root, the map and artifact loaders are unchanged, and the conformance command keeps `--root` (CNF-4). The editor resolves paths against the marker and does not check the loader root of a host: a host's loader root is the host's own declaration, and a difference between the two is the host's choice.

- The content of a marker is `{"schema": 1}`: one JSON document that is an object whose only key is `schema` with the number 1. Text that is not one JSON document, a value that is not an object, a missing `schema`, another `schema` value and an unknown key are each an error `E_ROOT_INVALID` over the whole marker text, reported on the marker (`TemplateDocument.root.diagnostics`, published on the URI of the marker). An invalid marker declares no root. The vectors of `packages/language/tests/root-marker/vectors.json` accept and reject marker texts.

- For a text that parses, every include path and every block path of a block tag with a path token gets one diagnostic over its tag when it does not resolve:

| Condition | Code | Message |
| --- | --- | --- |
| no marker, an invalid marker, or no `options.location` | `E_ROOT_UNDECLARED` | `no template root declared (template-root.json)` |
| the path leaves the root after RT-8's normalization | `E_LOAD_OUTSIDE_ROOT` | `"<path>" leaves the template root` |
| a component below the root is a symbolic link (RT-10) | `E_LOAD_FAILED` | `template <name> cannot be loaded: <component> is a symbolic link` |
| the resolved name is no regular file under the root | `E_LOAD_NOT_FOUND` | `template <name> does not exist` |

The path resolves against the template name of the document relative to the root, with RT-8's normalization: a leading `/` against the root, `.` and `..` normalized. A block tag of an identifier alone and a target that `define` supplies are resolved at render (RT-24, RT-25) and get no diagnostic; they fail there with `E_LOAD_NOT_FOUND` or `E_RUNTIME_BLOCK_UNDEFINED`. Files that change after the analysis are seen at the next analysis of the document.

- The language service reaches files only through a host given in `options.location` (`{ path, host }`, `path` absolute with `/` separators): `host.entryType(path)` returns `file`, `directory`, `symlink` or `other` for the entry at a path without following a symbolic link, or null when the path names nothing, and `host.readText(path)` returns the text of a regular file. The language service stays free of Node.js; the LSP server passes a host over `node:fs`, and a CodeMirror host passes its own.

- The editor fixtures under `packages/language/tests/editor` give, for each template, the expected diagnostics, tokens, tag ranges, folding ranges, highlights and matching tags at listed positions, the indentation of every line and the formatted text. The fixtures lie under the marker `template-root.json` of that directory, and every adapter opens them at their file path. The language service, the LSP server (through its protocol over standard input and output) and the CodeMirror adapter (through an `EditorState`) must give the same results after position conversion.
