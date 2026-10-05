# Formatter, language server and editors

[한국어](/ko/operations/editor-tools).

Three TypeScript packages support template authors:

- `packages/template-language` (`@polyspec/template-language`): the language service `openDocument()` ([editor support](../spec/editor.md)), the formatter `format()` and the command line tool `template-fmt`.
- `packages/template-lsp` (`@polyspec/template-lsp`): the Language Server Protocol server `template-lsp`, an adapter of the language service.
- `packages/template-codemirror` (`@polyspec/template-codemirror`): the CodeMirror 6 extension `template()`, which registers the results of the language service in a CodeMirror editor ([CodeMirror 6 adapter](#codemirror-6-adapter)).
- `packages/template-vscode` (`polyspec-template`): the VS Code extension with the language definition, the TextMate grammar and a client of the bundled language server. It contains no template rules.

Only the language service reads the template syntax from `@polyspec/template`: the language service and the formatter use the parser's tag ranges and expression tokens. The server, the CodeMirror adapter and the extension call the language service, and the grammar of the extension follows [lexical rules](../spec/lexical.md), [tag grammar](../spec/grammar.md) and [expressions](../spec/expressions.md).

## Formatting style

The formatter changes whitespace inside tags and the indentation of lines. Inside tags it follows the table below. Outside tags it replaces only the spaces and tabs at the start of a line, according to the nesting of HTML elements and template blocks ([Indentation](#indentation)). It changes no other text outside tags.

| Tag | Formatted form |
| --- | --- |
| echo | `{= expr}` |
| if, else-if, else, close | `{? expr}`, `{:? expr}`, `{:}`, `{/}` |
| loop | `{@ name = expr}` |
| assignment | `{:name = expr}`, `{:name += expr}`, `{:name++}` |
| include | `{+ path}` |
| block | `{# id path name name:value}` |
| if-block | `{?# id}` |

- No whitespace between the open delimiter and the sigil, and none before the close delimiter.
- One space after the sigil when the tag has a body.
- One space around binary operators, `?` and `:` of the ternary, `?:`, `??`, `in`, `=>` and the pipe `|`.
- One space after `,`; no space before `,`.
- No space after `(`, `[`, `...` and unary `!` and `-`; no space before `)` and `]`.
- No space between a function or method name and `(`, between an operand and an index `[`, and around `::` of a class call.
- Accessors (`.name`, `.0`) stay attached to the left operand.
- A block tag body keeps its words and replaces each run of whitespace between them with one space.

The formatter keeps these parts as written:

- text outside tags, including whitespace and line terminators, except the indentation of lines;
- comments `{* ... *}` and the delimiter directive `{% delimiter ..}`;
- a tag whose body contains a line terminator;
- the wrapper of a wrapped tag and the whitespace between the wrapper and the doubled delimiters;
- string literals, number literals and the characters of an include path.

Custom delimiters are supported: the `--delimiters` option and the `delimiters` option of `format()` select the engine delimiters, and a `{% delimiter ..}` directive changes the delimiters for the tags after it.

### Indentation

The formatter sets the indentation of each line to the indent unit repeated by the line's depth. The indent unit is the `indent` option: a run of spaces or one tab, two spaces by default. `indent: null` keeps the indentation of every line, so only the whitespace inside tags changes.

```
<div class="board-list">
  <h2>{= t["list.heading"]}</h2>
  {? length(p.props.posts) == 0}
    <p>{= t["list.empty"]}</p>
  {:}
    <ul>
      {@ post = p.props.posts}
        <li><a href="{= post.href}">{= post.title}</a></li>
      {/}
    </ul>
  {/}
</div>
```

- The depth of a line is the number of HTML elements and template blocks that are open where the line starts. A template block is an if, loop or if-block tag up to its close tag.
- A line whose first non-blank text is an HTML end tag, a template close tag `{/}` or a branch tag `{:}` or `{:? }` gets one level less.
- The option `templateBlocks: 'flat'` makes template blocks add no level: their tags and the lines inside them get the depth of the HTML elements alone. The default `'indent'` counts them like elements.
- A line inside an HTML start tag that spans lines gets one level more than the tag; a line that starts inside a quoted attribute value keeps its indentation.
- Void elements (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`) and start tags that end with `/>` open no element.
- The formatter keeps the indentation of lines that start inside `<pre>`, `<textarea>`, `<script>`, `<style>`, an HTML comment or a tag, including the line of the end tag. It does not read HTML tags inside `<script>`, `<style>` and `<textarea>`.
- A blank line becomes empty.
- The text of a line after its indentation does not change; the formatter never moves an element to another line.

The formatter needs the HTML structure to be balanced. When an end tag does not match the open element, an element is not closed at the end of the template, or the HTML elements that are open differ between the branches of a template block or between its start and its close tag, `format()` returns the error `reason: 'html'` with the position of the tag and changes nothing. A template whose output is not HTML is formatted with `indent: null`.

Spaces and tabs at the start of a line are part of the rendered output, except on a line that holds only a block tag, which the renderer removes with its whitespace. Indentation therefore changes the whitespace at the start of rendered lines. Browsers do not display that whitespace, except inside `<pre>` and `<textarea>`, which the formatter keeps, and inside elements whose CSS `white-space` keeps spaces.

## Safety invariant

`format()` parses the source with `analyze()` of `@polyspec/template`. It formats each tag with the parser's tag range and expression tokens, and parses the result again. It returns the result only when both ASTs are equal after every `span` field and, when the indentation changes, the spaces and tabs at the start of every line of text are removed. Otherwise it returns an error result and the caller keeps the source:

| Result | Condition |
| --- | --- |
| `{ ok: true, text, changed }` | the source parses and the formatted AST equals the source AST |
| `{ ok: false, error: { reason: 'parse', code, line, col, message } }` | the source does not parse; `code`, `line` and `col` are the parser error |
| `{ ok: false, error: { reason: 'invariant', code: null, line, col, message } }` | the formatted text does not parse or parses to a different AST; the position is the first change |
| `{ ok: false, error: { reason: 'html', code: null, line, col, message } }` | the HTML structure is not balanced ([Indentation](#indentation)); the position is the tag where the structure fails |

The invariant test formats every `.tpl` file under `tests/cases` (with the delimiters of `options.json`), `tests/fixtures`, `examples` and the formatter fixtures, once with `indent: null` and once with the default indentation. For each file that parses, `indent: null` must give the same AST without spans and the same text outside tags. The default indentation must give either the `html` error or the same AST and the same text outside tags once the spaces and tabs at the start of lines are removed. Both must not change on a second run.

## Command line

```sh
make install-cli
template-fmt --help
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

```
usage: template-fmt [--write | --check] [--delimiters OC] [--indent N|tab|keep]
                    [--template-blocks indent|flat] [PATH ...]
```

- One file without `--write` or `--check`: the formatted text goes to standard output.
- No path or `-`: the command reads standard input and writes standard output.
- A directory: the command formats every `.tpl` file below it, in sorted order, and skips `node_modules` and directories whose name starts with `.`. Several paths or a directory require `--write` or `--check`.
- `--write`: rewrites every file that is not formatted and prints its path.
- `--check`: changes nothing and prints the path of every file that is not formatted.
- `--indent`: the indent unit, `N` spaces (1 to 8), `tab`, or `keep` for `indent: null`. The default is `2`.
- `--template-blocks`: `indent` (default) or `flat`, the `templateBlocks` option.
- A file that does not parse, whose formatted AST differs or whose HTML structure is not balanced is printed to standard error as `path:line:col: LABEL: message` and is not changed. `LABEL` is the parser error code, `formatted AST differs` or `HTML structure`.

| Exit status | Meaning |
| --- | --- |
| 0 | success; with `--check`, every file is formatted |
| 1 | `--check` found a file that is not formatted |
| 2 | a file does not parse, a formatted AST differs, an HTML structure is not balanced, a path cannot be read, or the arguments are invalid |

`make install-cli` installs the command `template-fmt` under the prefix `CLI_PREFIX` (default `~/.local`) without a symbolic link: `scripts/install-cli.mjs` writes the npm project `<prefix>/lib/polyspec-template-fmt`, which installs copies of the built formatter package and of the template package of this checkout without bin links, and the executable script `<prefix>/bin/template-fmt`, which runs `node` with the entry of the copied formatter package by its absolute path. Put `<prefix>/bin` on `PATH`. Run it again after `make build-language` to install the changed build; `make uninstall-cli` removes the project and the script.

## Language server

```sh
make build-lsp
node packages/template-lsp/bin/template-lsp.mjs --stdio
```

`template-lsp` serves the Language Server Protocol over standard input and output for an editor with a Language Server Protocol client: the client starts the command for `.tpl` documents. The server provides the capabilities of EDT-14 ([editor support](../spec/editor.md)): diagnostics, semantic tokens, folding ranges, document highlights, document and range formatting, on-type indentation after `\n`, `>` and `}`, and the requests `polyspec-template/tagRanges` and `polyspec-template/matchingTag`. It reads the setting `polyspec-template.format.templateBlocks` with `workspace/configuration` and writes format errors to the client log as warnings. The server contains no template rule: it calls `openDocument()` once per document version and converts the UTF-16 string indexes of the language service to protocol positions. The argument `--stdio`, which Language Server Protocol clients pass, is accepted and has no effect.

## VS Code extension

```sh
make vscode-package
make vscode-install
code --list-extensions --show-versions | grep polyspec
```

`make vscode-package` bundles `src/extension.ts` with `vscode-languageclient` into `dist/extension.cjs`, bundles the server entry `@polyspec/template-lsp/server` with `@polyspec/template-language` and `@polyspec/template` into `dist/server.cjs`, and writes `packages/template-vscode/dist/polyspec-template.vsix`. The installed extension does not need the repository at run time. `make vscode-install` runs `code --install-extension` with `--force`.

The extension is a client of the language server `template-lsp` (EDT-15). The language client starts `dist/server.cjs` with the Node.js runtime of VS Code and talks to it over standard input and output; the client sends the text of every open document of the language `polyspec-template`, in any URI scheme, to the server.

The extension declares `capabilities.untrustedWorkspaces.supported`, because the extension and its server only read the text of open documents and run no code of the workspace. Without the declaration VS Code disables the extension, including its grammar, in Restricted Mode, and a `.tpl` file in an untrusted folder opens as plain text. The extension also declares `capabilities.virtualWorkspaces`: the server receives document text only through the protocol and never reads the file system, so a document of a virtual workspace is analyzed as a file is, and its URI is the template name of its diagnostics. The extension has only a `main` entry and no `browser` entry, so VS Code for the Web, which has no Node.js extension host, does not run it. The extension declares `engines.vscode` `^1.138.0` and no `engines.node`, because VS Code runs extensions and the server on the Node.js of its Electron build. VS Code 1.138.0 uses Electron 42.10.0 with Node.js 24.18.1, so both bundles target `node24`.

The extension registers the language `polyspec-template` for `.tpl` files with:

- block comment `{* *}` for comment toggling;
- brackets and auto-closing pairs for `{ }`, `[ ]`, `( )`, quotes and `<!-- -->`;
- document and range formatting from the server. The indent unit is the editor's: `tabSize` spaces, or a tab when `insertSpaces` is off. The setting `polyspec-template.format.templateBlocks` (`indent` or `flat`) is the `templateBlocks` option; the server reads it with `workspace/configuration`. Range formatting formats the tags that lie completely inside the selection and indents the lines that start inside it. When `format()` returns an error, the server returns no edits and writes the position as a warning to the output channel `Polyspec Template`;
- indentation while typing: after Enter, `>` and `}` the server sets the indentation of the current line to `lineIndentation()` (EDT-13). VS Code requests it only when `editor.formatOnType` is on, so the extension contributes `"[polyspec-template]": { "editor.formatOnType": true }` as a configuration default; a user or workspace setting for the language overrides it. A blank line after Enter gets the indentation of its depth.

### Diagnostics and matching tags

The server takes diagnostics, tokens, tag ranges, constructs, folding ranges and matching tags from `openDocument()` of the language service ([editor support](../spec/editor.md), EDT-4 to EDT-11). A test of the language service compares the constructs with the `If`, `For` and `IfBlock` spans and the branch spans of the AST for every conformance case:

- Diagnostics: the server publishes the parse error of every document version, for example `E_PARSE_UNCLOSED_BLOCK`, `E_PARSE_UNEXPECTED_CLOSE` or `E_PARSE_ELSE_OUTSIDE_BLOCK`, at the parser position with the error code. The diagnostic is removed when the document parses or closes.
- Semantic tokens: the server classifies the template part of the text with the token types of EDT-8; text outside tags keeps the HTML colors of the grammar. The extension contributes the types that VS Code does not define with `semanticTokenTypes`: `delimiter` with the super type `keyword` and `path` with the super type `string`. `semanticTokenScopes` maps `delimiter` to `keyword.control.tag.begin.polyspec-template`, `keyword` to `keyword.control.polyspec-template` and `path` to `string.unquoted.path.polyspec-template`, so a theme without semantic token rules colors delimiters and sigils with `keyword.control`, as the grammar does.
- Tag backgrounds: every tag except comments gets the deep green background `#16351c` in dark themes and `#e3f6dd` in light themes. The background differs in lightness from the editor background (ΔL* +13.4 on Dark 2026, 5.1 on Light 2026) and keeps every syntax color of Dark 2026 above 4.5:1; the lowest is the keyword sigils at 4.8:1. A more saturated green such as `#044700` stands out more but lowers the sigils to 4.0:1, and a color at the editor's own lightness, such as black on a dark theme, cannot be told apart. The extension requests `polyspec-template/tagRanges` when a template editor appears and 250 ms after the last change, and paints the result only when the document did not change while the request ran. While a document does not parse, the backgrounds cover the tags the parser accepted before its error (EDT-6). The extension returns `tagRanges(document)` as its API (`vscode.extensions.getExtension('polyspec.polyspec-template').exports`), which gives the ranges that it paints; the integration test reads them there, because VS Code has no API that reads the decorations of an editor.
- Highlights: with the cursor on an opening, branch or close tag, every tag of the same construct is highlighted.
- Folding: each construct whose close tag is on a later line folds from the line of its opening tag to the line before its close tag.
- The command Go to Matching Template Tag (`polyspec-template.goToMatchingTag`) requests `polyspec-template/matchingTag` and moves the cursor to the next tag of the construct under the cursor, and from the last tag to the opening tag. Outside a tag it moves to the next tag of the innermost enclosing construct. The keybinding is `Cmd+Alt+\` on macOS and `Ctrl+Alt+\` on Windows and Linux, active only in a template editor. The integration test checks on macOS that the default keybindings of VS Code 1.138.0 bind `Cmd+Alt+\` to no other command.

While a document does not parse, highlights, folding and the command use only the constructs that are closed (EDT-6). The extension does not check the balance of HTML elements across template branches; HTML structure is left to the HTML features of VS Code.

### Grammar

The grammar `text.html.polyspec-template` includes `text.html.basic` and injects the template tags with the selector `L:text.html.polyspec-template - (meta.template | comment.block.polyspec-template)`. The injection applies at every position of the document, so tags are highlighted in text, inside attribute values and between attributes, in CSS of `<style>`, in JavaScript of `<script>`, in JavaScript strings and in HTML comments, while HTML, CSS and JavaScript keep their own scopes.

| Tag kind | Scope of the tag | Scope of the sigil |
| --- | --- | --- |
| echo | `meta.template.echo.polyspec-template` | `keyword.control.echo.polyspec-template` |
| raw output (echo whose last pipe step is `raw`) | `meta.template.echo.raw.polyspec-template` | `keyword.control.echo.raw.polyspec-template` |
| if | `meta.template.if.polyspec-template` | `keyword.control.if.polyspec-template` |
| else-if | `meta.template.elseif.polyspec-template` | `keyword.control.elseif.polyspec-template` |
| else | `meta.template.else.polyspec-template` | `keyword.control.else.polyspec-template` |
| close | `meta.template.end.polyspec-template` | `keyword.control.end.polyspec-template` |
| loop | `meta.template.loop.polyspec-template` | `keyword.control.loop.polyspec-template` |
| assignment | `meta.template.assignment.polyspec-template` | `keyword.control.assignment.polyspec-template` |
| include | `meta.template.include.polyspec-template` | `keyword.control.include.polyspec-template` |
| block | `meta.template.block.polyspec-template` | `keyword.control.block.polyspec-template` |
| if-block | `meta.template.ifblock.polyspec-template` | `keyword.control.ifblock.polyspec-template` |
| comment | `comment.block.polyspec-template` | `punctuation.definition.comment.begin.polyspec-template` |
| directive | `meta.template.directive.polyspec-template` | `keyword.control.directive.polyspec-template` |
| wrapped tag | `meta.template.wrapped.polyspec-template` around the tag kind | `punctuation.definition.wrapper.begin.polyspec-template` |
| escape `\{` | `constant.character.escape.polyspec-template` | |

Delimiters are `keyword.control.tag.begin.polyspec-template` and `keyword.control.tag.end.polyspec-template`, and a block name is `entity.name.type.block.polyspec-template`. The delimiters and the sigils use `keyword.control` because every common theme colors it apart from HTML tags, attributes and text; `punctuation.definition.tag`, which HTML uses for `<` and `>`, made the tags look like HTML. Inside expressions the grammar assigns scopes to strings and their escapes, numbers, `true`, `false` and `null`, `in`, comparison, relational, logical, arithmetic, coalesce, elvis, ternary, spread and key-value operators, the pipe and its function (`support.function.filter.polyspec-template`, and `support.function.filter.raw.polyspec-template` for `raw`), function calls, member calls, class calls, member access, loop metadata such as `row.index_`, variables, include and block paths, block identifiers and block scope items. A character that no expression token accepts is `invalid.illegal.polyspec-template`.

### Grammar limits

- The grammar uses the default delimiters `{` and `}`. Tags after a `{% delimiter ..}` directive and templates rendered with the engine option `delimiters` are not highlighted as tags by the grammar. A TextMate grammar cannot change its patterns from a value read in the document, and the engine option is not part of the source. The semantic tokens of the server follow the directive, so tags after it get the semantic token colors in a theme with semantic highlighting; the extension has no setting for the engine option.
- The grammar highlights a tag start as a tag even when the tag body is an error, as LEX-8 requires; it does not report errors or check block structure.
- An HTML pattern that starts before a `{` and continues across it takes precedence, because the injection applies only where no earlier match covers the position. This affects a tag inside an unquoted attribute value (`value=a{= x}`) and inside an attribute name (`data-{= n}="1"`). Tags in quoted attribute values and between attributes are highlighted.
- The raw output scope, the loop form of `@` and the start of a wrapped tag are recognized when the tag start and the deciding characters are on one line.

## CodeMirror 6 adapter

`packages/template-codemirror` (`@polyspec/template-codemirror`) is a CodeMirror 6 extension built on `@codemirror/lang-html` (EDT-16). It takes every result from `openDocument()` of the language service, converts nothing but positions and contains no template rule ([editor support](../spec/editor.md)). CodeMirror and the language service both use UTF-16 string indexes into the document text, so a language service position is a CodeMirror position. The packages `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/lint`, `@codemirror/lang-html` and `@codemirror/commands` are peer dependencies, so the adapter uses the one instance of each that the editor uses.

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
- a mark with the class `cm-template-tag` on every tag range (EDT-9), with the lowest precedence, so its element encloses the token marks of the tag;
- a mark with the class `cm-template-highlight` on every tag of the construct under the main cursor (`highlights`, EDT-11);
- diagnostics through `linter` of `@codemirror/lint` with severity `error`, source `polyspec-template` and the message `CODE: message`, for example `E_PARSE_UNCLOSED_BLOCK: block is not closed before the end of the file` (EDT-7). `templateDiagnostics(state)` returns the same diagnostics for a state;
- folding through `foldService` from `foldingRanges` (EDT-10). The fold of a line hides the lines after the opening tag up to the line before the close tag. CodeMirror folds one range per line; when several constructs start on one line, the one that ends last folds;
- an `indentService` that returns the column width of `lineIndentation` for the line with the editor's `indentUnit` and `templateBlocks` (EDT-13). When Enter breaks a line, the service analyzes the text with the break, so the new line and the text moved to it get the indentation of a typed line. The indent unit must be a run of spaces or one tab, as the language service requires;
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
| `formatTemplate` | replaces the document with `format()` (EDT-12) with the editor's `indentUnit` and the `templateBlocks` option. When `format()` returns an error, it changes nothing and returns `false`. Shift+Alt+F runs it. |
| `goToMatchingTag` | moves the main cursor to `matchingTag` of its position (EDT-11) and returns `false` when there is none. The extension binds no key to it; the example binds `Mod-Alt-\`. |

Shift+Alt+F is bound to the physical key F (`KeyboardEvent.code` `KeyF`) and not through a keymap entry `Shift-Alt-f`. A keymap entry matches the typed character, and on macOS Option+Shift+F types `Ï`, so the entry would never run there.

## Verification

```sh
make test-language
make test-lsp
make format-check
make test-codemirror
make test-vscode
make test-vscode-integration
make format-external-check TEMPLATE_SOURCE_ROOT=/path/to/templates
```

`make test-lsp` starts the built command `template-lsp` as a child process, speaks the protocol over its standard input and output with `vscode-jsonrpc` and compares, for every editor fixture (EDT-17), the published diagnostics, the decoded semantic tokens, the tag ranges, the folding ranges, the highlights and matching tags at the fixture positions, the on-type indentation of every line in both `templateBlocks` modes and the formatted text with the expected results. It also compares a text with a byte order mark, CRLF line ends and characters outside the Basic Multilingual Plane with the language service, and checks the declared capabilities, the split of a multi-line token for a client without `multilineTokenSupport`, the configuration request, a format error, range formatting and on-type formatting without an edit.

`make test-vscode` runs the grammar tests with `vscode-tmgrammar-test` against the HTML, CSS and JavaScript grammars of `tm-grammars`, and tests the manifest, that `dist/extension.cjs` loads only `vscode` and Node.js built-in modules and `dist/server.cjs` only Node.js built-in modules, that the `.vsix` contains both, that the manifest contributes every token type of the server legend that VS Code does not define, and that the bundled server publishes diagnostics and answers `polyspec-template/tagRanges`, `polyspec-template/matchingTag` and on-type formatting over standard input and output. The language client runs only in VS Code, so the integration test covers it. `make test-vscode-integration` builds the `.vsix`, downloads VS Code 1.138.0, the minimum of `engines.vscode`, into `.vscode-test` at the repository root (the option `--cache` of `tests/integration/run.mjs`) with `@vscode/test-electron`, and installs the `.vsix` into a new extensions directory with the VS Code command line. It starts VS Code with workspace trust enabled and the test folder untrusted, as a user installation runs, and checks that a `.tpl` document opens with the language `polyspec-template`, that the installed extension activates and starts the bundled server, that `_workbench.captureSyntaxTokens` reports the template scopes for a tag inside an HTML attribute value, that the tag ranges the extension paints cover every tag except comments, also in a document that does not parse, that `vscode.provideDocumentSemanticTokens` returns the token types of the server, that `editor.formatOnType` is on for the language and typing `}` and Enter indents the current line, that an unclosed `{?` produces a diagnostic at its position, that document highlights, folding ranges and Go to Matching Template Tag follow one construct, that the keybinding is free, and that `vscode.executeFormatDocumentProvider` returns the expected edits for a sample and no edits for a formatted document and for a document that does not parse. A second run removes `capabilities` from the installed manifest and requires that VS Code disables the extension in that workspace, which shows that the first run detects a missing capability. The download of VS Code, each profile installation and each VS Code launch is a step without a time limit (`tests/integration/step.mjs`): it prints its start, a line every 10 s while it runs and its result with its elapsed time, and the installation and the launch print the output of VS Code as it arrives. An installation is judged by its exit code and a launch by its exit code or the result of its suite. Each check has a timeout of 20 s, and the suite prints `[suite] start - <check>` and then `[suite] ok - <check> (<ms> ms)` or `[suite] not ok - <check> (<ms> ms)` for every check. A launch ends with the result of its suite: VS Code 1.138 sometimes takes minutes to exit after the suite has printed `[suite] N of M checks passed`, so VS Code has 20 s to exit after that line, and is then killed with its process group. The 20 s start after the suite result has been printed; they end VS Code and do not decide the result.

Every run in one checkout shares `.vscode-test`, so the directory has one holder at a time through the lock file `.vscode-test.lock` of `scripts/holder-lock.mjs`. The lock is created atomically with its whole content and names the checkout, the process ID and the start time of its holder. The integration run holds it from the download to its last launch and releases it when it exits. A second integration run and `make clean` (through `make clean-vscode-test`, which removes the directory while it holds the lock) fail with the holder and change nothing. A lock whose holder process has ended is reported with that holder and stays; `make vscode-test-unlock` removes it and fails while the holder runs.

`make test-codemirror` builds the adapter and runs two kinds of tests. The Vitest tests create an `EditorState` without a DOM for every editor fixture under `packages/template-language/tests/editor` and compare with the fixture's expected results the diagnostics of `templateDiagnostics`, the token and tag marks of the state's decoration sets, the folding ranges of the fold service, the highlight marks and the `goToMatchingTag` target at every query position, the indentation service result of every line with `templateBlocks` `indent` and `flat` and the indent unit of two spaces, and the result of `formatTemplate` (EDT-17). Further tests type a line and press Enter with `insertNewlineAndIndent`, and check the options, the indent unit of `formatTemplate` and the reuse of one analysis per text. The Playwright test bundles `tests/browser/page.ts` with esbuild into `packages/template-codemirror/dist/browser/page.js`, loads it into a blank Chromium page and checks the indentation after typing `<ul>`, Enter, `{@ x = xs}` and Enter, the token classes, the template color inside an HTML attribute value, the tag background in light and dark themes, the lint diagnostic of an unclosed block, and Shift+Alt+F on a text that formats and on a text that does not parse.

The CI job `editor` runs `make editor-boundary-check test-language format-check test-lsp test-codemirror test-vscode` and runs `make test-vscode-integration` on a virtual X server with `xvfb-run`, because VS Code needs a display.

`make check` runs `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode` and `test-vscode-integration`. `make format-external-check` runs the invariant test also on an explicit external template tree.
