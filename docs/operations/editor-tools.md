# Formatter and VS Code extension

[한국어](/ko/operations/editor-tools).

Two TypeScript packages support template authors:

- `packages/template-format` (`@polyspec/template-format`): the formatter library `format()`, the tag structure function `templateStructure()` and the command line tool `template-fmt`.
- `packages/template-vscode` (`polyspec-template`): the VS Code extension with the language definition, the TextMate grammar and the formatting provider. The provider calls `format()` and contains no formatting rules.

Both read the template syntax from `@polyspec/template`: the formatter uses the parser's tag ranges and expression tokens, and the grammar follows [lexical rules](../spec/lexical.md), [tag grammar](../spec/grammar.md) and [expressions](../spec/expressions.md).

## Formatting style

The formatter changes only whitespace inside tags. It never changes text outside tags, so the rendered output does not change.

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

- text outside tags, including whitespace and line terminators;
- comments `{* ... *}` and the delimiter directive `{% delimiter ..}`;
- a tag whose body contains a line terminator;
- the wrapper of a wrapped tag and the whitespace between the wrapper and the doubled delimiters;
- string literals, number literals and the characters of an include path.

Custom delimiters are supported: the `--delimiters` option and the `delimiters` option of `format()` select the engine delimiters, and a `{% delimiter ..}` directive changes the delimiters for the tags after it.

## Safety invariant

`format()` parses the source with `analyze()` of `@polyspec/template`. It formats each tag with the parser's tag range and expression tokens, and parses the result again. It returns the result only when both ASTs are equal after every `span` field is removed. Otherwise it returns an error result and the caller keeps the source:

| Result | Condition |
| --- | --- |
| `{ ok: true, text, changed }` | the source parses and the formatted AST equals the source AST |
| `{ ok: false, error: { reason: 'parse', code, line, col, message } }` | the source does not parse; `code`, `line` and `col` are the parser error |
| `{ ok: false, error: { reason: 'invariant', code: null, line, col, message } }` | the formatted text does not parse or parses to a different AST; the position is the first changed tag |

The invariant test formats every `.tpl` file under `tests/cases` (with the delimiters of `options.json`), `tests/fixtures`, `examples` and the formatter fixtures. For each file that parses it requires the same AST without spans, the same text outside tags and no change on a second run.

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
usage: template-fmt [--write | --check] [--delimiters OC] [PATH ...]
```

- One file without `--write` or `--check`: the formatted text goes to standard output.
- No path or `-`: the command reads standard input and writes standard output.
- A directory: the command formats every `.tpl` file below it, in sorted order, and skips `node_modules` and directories whose name starts with `.`. Several paths or a directory require `--write` or `--check`.
- `--write`: rewrites every file that is not formatted and prints its path.
- `--check`: changes nothing and prints the path of every file that is not formatted.
- A file that does not parse, or whose formatted AST differs, is printed to standard error as `path:line:col: CODE: message` and is not changed.

| Exit status | Meaning |
| --- | --- |
| 0 | success; with `--check`, every file is formatted |
| 1 | `--check` found a file that is not formatted |
| 2 | a file does not parse, a formatted AST differs, a path cannot be read, or the arguments are invalid |

`make install-cli` runs `npm link -w @polyspec/template-format`, which links `template-fmt` into the global npm bin directory. The link points to the working tree, so `make build-format` updates the installed command.

## VS Code extension

```sh
make vscode-package
make vscode-install
code --list-extensions --show-versions | grep polyspec
```

`make vscode-package` bundles `src/extension.ts` with `@polyspec/template-format` and `@polyspec/template` into `dist/extension.cjs` and writes `packages/template-vscode/dist/polyspec-template.vsix`. The installed extension does not need the repository at run time. `make vscode-install` runs `code --install-extension` with `--force`.

The extension declares `capabilities.untrustedWorkspaces.supported` and `capabilities.virtualWorkspaces`, because it only reads document text and runs no code of the workspace. Without the declaration VS Code disables the extension, including its grammar, in Restricted Mode, and a `.tpl` file in an untrusted folder opens as plain text. The extension declares `engines.vscode` `^1.138.0` and no `engines.node`, because VS Code runs extensions on the Node.js of its Electron build. VS Code 1.138.0 uses Electron 42.10.0 with Node.js 24.18.1, so the bundle targets `node24`.

The extension registers the language `polyspec-template` for `.tpl` files with:

- block comment `{* *}` for comment toggling;
- brackets and auto-closing pairs for `{ }`, `[ ]`, `( )`, quotes and `<!-- -->`;
- document and range formatting through `format()`. Range formatting formats the tags that lie completely inside the selection. When `format()` returns an error, the provider returns no edits and writes the position to the output channel `Polyspec Template`.

### Diagnostics and matching tags

`templateStructure()` parses a document with `analyze()` of `@polyspec/template` and returns either the parse error with its code, its parser line and column and its string range, or the block constructs. A construct is a loop, if or if-block tag, the else-if and else tags of that block and its close tag, taken from the tag ranges that the parser accepted. A test compares the constructs with the `If`, `For` and `IfBlock` spans and the branch spans of the AST for every conformance case. The extension uses only this function:

- Diagnostics: the extension parses a template document when it opens and 250 ms after the last change, and publishes the parse error, for example `E_PARSE_UNCLOSED_BLOCK`, `E_PARSE_UNEXPECTED_CLOSE` or `E_PARSE_ELSE_OUTSIDE_BLOCK`, at the parser position with the error code. The diagnostic is removed when the document parses.
- Highlights: with the cursor on an opening, branch or close tag, every tag of the same construct is highlighted.
- Folding: each construct whose close tag is on a later line folds from the line of its opening tag to the line before its close tag.
- The command Go to Matching Template Tag (`polyspec-template.goToMatchingTag`) moves the cursor to the next tag of the construct under the cursor, and from the last tag to the opening tag. Outside a tag it moves to the next tag of the innermost enclosing construct. The keybinding is `Cmd+Alt+\` on macOS and `Ctrl+Alt+\` on Windows and Linux, active only in a template editor. The integration test checks on macOS that the default keybindings of VS Code 1.138.0 bind `Cmd+Alt+\` to no other command.

While a document does not parse, highlights, folding and the command have no constructs to use. The extension does not check the balance of HTML elements across template branches; HTML structure is left to the HTML features of VS Code.

### Grammar

The grammar `text.html.polyspec-template` includes `text.html.basic` and injects the template tags with the selector `L:text.html.polyspec-template - (meta.template | comment.block.polyspec-template)`. The injection applies at every position of the document, so tags are highlighted in text, inside attribute values and between attributes, in CSS of `<style>`, in JavaScript of `<script>`, in JavaScript strings and in HTML comments, while HTML, CSS and JavaScript keep their own scopes.

| Tag kind | Scope of the tag | Scope of the sigil |
| --- | --- | --- |
| echo | `meta.template.echo.polyspec-template` | `keyword.operator.echo.polyspec-template` |
| raw output (echo whose last pipe step is `raw`) | `meta.template.echo.raw.polyspec-template` | `keyword.operator.echo.raw.polyspec-template` |
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

Delimiters are `punctuation.definition.tag.begin.polyspec-template` and `punctuation.definition.tag.end.polyspec-template`. Inside expressions the grammar assigns scopes to strings and their escapes, numbers, `true`, `false` and `null`, `in`, comparison, relational, logical, arithmetic, coalesce, elvis, ternary, spread and key-value operators, the pipe and its function (`support.function.filter.polyspec-template`, and `support.function.filter.raw.polyspec-template` for `raw`), function calls, member calls, class calls, member access, loop metadata such as `row.index_`, variables, include and block paths, block identifiers and block scope items. A character that no expression token accepts is `invalid.illegal.polyspec-template`.

### Grammar limits

- The grammar uses the default delimiters `{` and `}`. Tags after a `{% delimiter ..}` directive and templates rendered with the engine option `delimiters` are not highlighted as tags. A TextMate grammar cannot change its patterns from a value read in the document, and the engine option is not part of the source.
- The grammar highlights a tag start as a tag even when the tag body is an error, as LEX-8 requires; it does not report errors or check block structure.
- An HTML pattern that starts before a `{` and continues across it takes precedence, because the injection applies only where no earlier match covers the position. This affects a tag inside an unquoted attribute value (`value=a{= x}`) and inside an attribute name (`data-{= n}="1"`). Tags in quoted attribute values and between attributes are highlighted.
- The raw output scope, the loop form of `@` and the start of a wrapped tag are recognized when the tag start and the deciding characters are on one line.

## Verification

```sh
make test-format
make format-check
make test-vscode
make test-vscode-integration
make format-external-check TEMPLATE_SOURCE_ROOT=/path/to/templates
```

`make test-vscode` runs the grammar tests with `vscode-tmgrammar-test` against the HTML, CSS and JavaScript grammars of `tm-grammars`, and tests the manifest and the bundled providers with a stand-in `vscode` module. `make test-vscode-integration` builds the `.vsix`, downloads VS Code 1.138.0, the minimum of `engines.vscode`, into `.vscode-test` at the repository root with `@vscode/test-electron`, and installs the `.vsix` into a new extensions directory with the VS Code command line. It starts VS Code with workspace trust enabled and the test folder untrusted, as a user installation runs, and checks that a `.tpl` document opens with the language `polyspec-template`, that the installed extension activates, that `_workbench.captureSyntaxTokens` reports the template scopes for a tag inside an HTML attribute value, that an unclosed `{?` produces a diagnostic at its position, that document highlights, folding ranges and Go to Matching Template Tag follow one construct, that the keybinding is free, and that `vscode.executeFormatDocumentProvider` returns the expected edits for a sample and no edits for a formatted document and for a document that does not parse. A second run removes `capabilities` from the installed manifest and requires that VS Code disables the extension in that workspace, which shows that the first run detects a missing capability.

`make check` runs `test-format`, `format-check`, `test-vscode` and `test-vscode-integration`. `make format-external-check` runs the invariant test also on an explicit external template tree.
