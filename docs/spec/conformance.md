<!-- doc-id: docs-spec-conformance -->
# Conformance

[한국어](/ko/spec/conformance).

Conformance is verified by fixture cases that every implementation renders through a command line interface with one contract, and by expression fixtures that every implementation loads in its own tests.

## Fixture cases

**CNF-1** A case is a directory `tests/cases/<group>/<name>/`. `<group>` and `<name>` consist of lowercase letters, digits and `-`.

**CNF-2** Files in a case directory:

| File | Required | Content |
| --- | --- | --- |
| `input.tpl` | yes | The entry template. Its template name is `input.tpl`. |
| other `.tpl` files | no | Templates referenced by include and block tags. The loader root is the case directory. |
| `data.json` | no | Assign data. Default `{}`. |
| `define.json` | no | Template definitions. Default `{}`. Each value is a string path, `{"template": "path"}` with an optional `"data"` object, or `{"html": "string"}`. Paths are relative to the case directory. |
| `env.json` | no | Environment. Default `{"timezone": "Z", "now": 0}`. |
| `options.json` | no | Engine options. Default `{}`. `{"delimiters": ";;"}` selects the delimiters. |
| `case.json` | yes | `{"rules": ["LEX-3"], "stage": 1}`. `rules` lists the specification rules the case covers. `stage` is 1 for lexical, grammar and expression cases, 2 for function, data model and whitespace cases, and 3 for include, block, wrapper, delimiter and error cases. |
| `expected.ast.json` | yes, unless `expected.error.json` names a lexical or parse error of `input.tpl` | The AST of `input.tpl`. Includes and blocks are not expanded. |
| `expected.html` | one of the two | The exact render output. |
| `expected.error.json` | one of the two | `{"code", "template", "line", "col"}` of the expected error. |
| `expected.tokens.json` | when `expected.ast.json` is present | The tokens of `input.tpl` (FMT-1, FMT-2): a JSON array of `[start, end, type]`. |
| `expected.format.json` | when `expected.ast.json` is present | `{"indent": R, "keep": R}`: the result of formatting `input.tpl` with the default options (`indent`, two spaces and `templateBlocks` `indent`) and with `indent: null` (`keep`) ([formatting](formatting.md)). `R` is `{"text": "<formatted text>"}` or `{"error": {"reason", "code", "line", "col"}}` (FMT-14). |

**CNF-15** `scripts/check-schema.mjs` checks the presence of `expected.ast.json` in every case directory. It fails when a case has no `expected.ast.json` and its `expected.error.json` does not name an `E_LEX_*` or `E_PARSE_*` code with `template` equal to `input.tpl`, and when a case has an `expected.ast.json` although its `expected.error.json` names such an error. It also fails when `expected.tokens.json` or `expected.format.json` is missing in a case with `expected.ast.json`, present in a case without it, or does not have the content of CNF-2. `make schema-check` and `make docs-check` run it, so `make check` fails for a missing file. Reason: CNF-9 compares the parse, token and format results of every case whose input parses, and a case without its files would otherwise pass without those comparisons.

**CNF-16** `tests/fixtures/filesystem/cases.json` lists the filesystem cases of the filesystem loader (RT-10), which a case directory cannot hold because a checkout holds no symbolic or hard link. Each case has `name`, `rules`, `files` (a template name mapped to its text, `input.tpl` among them), optional `symbolicLinks` and `hardLinks` (a name mapped to the name of its target), and `expected` with `html` or `error` (`{code, template, line, col}`). `tests/runner/conformance.mjs` writes the tree of each case into a directory of the system temporary directory, runs `render --root <directory> input.tpl` of every selected implementation as the case `filesystem/<name>` and compares the result by CNF-7 and CNF-8; `--case filesystem` selects them.

**CNF-3** `scripts/check-rules.mjs` collects every rule identifier defined in `docs/spec/*.md` and every identifier listed in `case.json` files. It fails when a `case.json` names a rule that no document defines, and it reports the rules that no case covers. `make check` runs it.

## Command line contract

**CNF-4** Every implementation provides a command with four subcommands.

| Command | Output | Exit status |
| --- | --- | --- |
| `parse [--root DIR] [--delimiters OC] FILE` | The AST JSON on stdout. | 0 |
| `render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE` | The rendered HTML on stdout. | 0 |
| `tokens [--root DIR] [--delimiters OC] FILE` | The tokens of FMT-1 and FMT-2 as a JSON array of `[start, end, type]` on stdout. | 0 |
| `format [--indent none\|tab\|N] [--delimiters OC] FILE` | The formatted text on stdout, the source when nothing changes. | 0 |
| `parse`, `render` or `tokens`, template error | The error JSON on stderr. | 2 |
| `format`, format error | The JSON `{"reason", "code", "line", "col", "message"}` of FMT-14 on stderr. | 2 |
| any subcommand, usage error | A message on stderr. | 1 |

The runner passes the options before `FILE`, as the POSIX utility syntax guidelines (guidelines 9 and 10) order them, because some standard parsers stop at the first operand. Implementations parse with their language's standard parser (for example node:util `parseArgs`, Go `flag`, Rust `clap`, Python `argparse`, PHP `symfony/console`) and follow its behavior for any other order. `--root` defaults to the directory of `FILE`. The template name passed to the parser and used in errors is `FILE` relative to the root. `--data`, `--define` and `--env` name JSON files with the content of CNF-2. A file that cannot be read is a usage error. A file whose content is not one JSON document is a template error `E_DATA_INVALID_JSON` with the position of ERR-5 (VAL-12); every other data error of these files is a template error with its `E_DATA_*` code at the same position. `--delimiters` is the two-character value of the engine option `delimiters`; the runner passes the value of `options.json`. `--indent` is the indent unit of FMT-9: `N` spaces (1 to 8, default 2), `tab`, or `none` for `indent: null`; `format` uses `templateBlocks` `indent`. Output is UTF-8. The command does not add a trailing newline.

**CNF-5** Commands per implementation:

| Implementation | Command |
| --- | --- |
| ts | `node packages/template-ts/bin/template.mjs`; `format`: `node packages/template-language/bin/template-language.mjs` |
| go | `packages/template-go/template` |
| rust | `packages/template-rust/target/release/template` |
| php | `php packages/template-php/bin/template.php` |
| php-ext | `php -d extension=var/build/polyspec_template.so packages/template-php-ext/bin/template-ext.php` |
| python | `var/python/venv/bin/python -m polyspec.template.cli` (`make python-package` installs `packages/template-python` into `var/python/venv`) |

The formatter of TypeScript is the package `@polyspec/template-language`, which depends on `@polyspec/template`, so its command `template-language` provides `format` and the command `template` the other subcommands.

## Comparison

**CNF-6** AST comparison parses both JSON documents and compares them recursively. Object key order has no meaning. Numbers compare by value.

**CNF-7** HTML comparison compares the bytes of stdout with the bytes of `expected.html`.

**CNF-8** Error comparison compares `code`, `template`, `line` and `col` of the stderr JSON with `expected.error.json`. A case with `expected.error.json` passes only when the exit status is 2.

**CNF-17** Token comparison parses the stdout of `tokens` and requires the array to equal `expected.tokens.json` element by element, with the exit status 0.

**CNF-18** Format comparison runs `format` once with the default options and once with `--indent none`, and compares each with the entry `indent` or `keep` of `expected.format.json`: for `text`, the exit status is 0 and the bytes of stdout equal the text; for `error`, the exit status is 2 and `reason`, `code`, `line` and `col` of the stderr JSON equal the expected fields. `message` is not compared.

**CNF-9** A case passes for an implementation when the `render` result satisfies CNF-7 or CNF-8 and, for a case with `expected.ast.json`, the `parse` result equals it and the `tokens` and `format` results satisfy CNF-17 and CNF-18. An implementation without one of the subcommands fails the case.

## Runners

**CNF-10** `tests/runner/conformance.mjs` enumerates the cases, runs every selected implementation, prints `<case> [<lang>] pass|fail (<ms> ms)` when a case finishes in an implementation, prints a summary table with one row per case and implementation after the last case, and exits with status 1 when any comparison fails.

| Option | Effect |
| --- | --- |
| `--langs a,b` | Run the listed implementations. Default: every implementation whose command exists. |
| `--case group/name` | Run one case. |
| `--list` | Print the case ids and the count without running. |
| `--update ast\|html\|error\|tokens\|format` | Write the expected file of the given kind from the `ts` implementation; `tokens` and `format` write the files of the cases with `expected.ast.json`. `ts` must be among the selected implementations. |

**CNF-11** `config/parity.json` declares the implementations and the shared suites: the conformance cases of `tests/cases` (unit `conformance`, whose native tests compare the AST and the render result), the tokens of those cases (unit `tokens`, CNF-17), their format results (unit `formatting`, CNF-18) and the expression vectors of `tests/fixtures/expr/cases.json`. `make parity-check` of kit runs the native test of each implementation that binds a suite and fails unless every case of the suite passed in every implementation of its profile; an exclusion fails until the task that it names removes it.

## Expression fixtures

**CNF-12** `tests/fixtures/expr/cases.json` is a list of expression cases. Every implementation loads the file in its own test suite.

```json
{
  "name": "coalesce-default",
  "expr": "a.b ?? 'x'",
  "tokens": [
    { "type": "IDENT", "value": "a" },
    { "type": "DOT_IDENT", "value": ".b" },
    { "type": "COALESCE", "value": "??" },
    { "type": "STRING", "value": "'x'" },
    { "type": "EOF", "value": "" }
  ],
  "ast": {
    "type": "Binary", "op": "??", "span": [0, 10],
    "left": { "type": "Member", "key": "b", "span": [0, 3], "object": { "type": "Var", "name": "a", "span": [0, 1] } },
    "right": { "type": "Literal", "kind": "string", "value": "x", "span": [7, 10] }
  },
  "cases": [
    { "data": { "a": { "b": 1 } }, "value": 1 },
    { "data": { "a": null }, "value": "x" }
  ]
}
```

A case has `name` (unique), `expr` (the expression source without a tag), `tokens`, `ast`, and `cases` (a list of `{data, value}`), or `name`, `expr` and `error` (an error code) for a source that does not parse. Spans count bytes from the start of `expr`.

**CNF-13** Token types:

| Type | Source |
| --- | --- |
| `IDENT` | identifier |
| `NUMBER` | number literal |
| `STRING` | string literal including its quotes |
| `DOT_IDENT` | `.` followed by an identifier |
| `DOT_INDEX` | `.` followed by digits |
| `LPAREN` `RPAREN` | `(` `)` |
| `LBRACKET` `RBRACKET` | `[` `]` |
| `COMMA` | `,` |
| `PIPE` | `\|` |
| `QUESTION` `COLON` | `?` `:` |
| `ELVIS` | `?:` |
| `DOUBLE_COLON` | `::` |
| `COALESCE` | `??` |
| `ARROW` | `=>` |
| `SPREAD` | `...` |
| `PLUS` `MINUS` `STAR` `SLASH` `PERCENT` | `+` `-` `*` `/` `%` |
| `BANG` | `!` |
| `EQ` `NE` `SEQ` `SNE` | `==` `!=` `===` `!==` |
| `LT` `GT` `LE` `GE` | `<` `>` `<=` `>=` |
| `AND` `OR` | `&&` `\|\|` |
| `IN` | `in` |
| `NULL` `TRUE` `FALSE` | `null` `true` `false` |
| `EOF` | end of input, value `""` |

`value` is the source text of the token. Whitespace produces no token. The stream ends with `EOF`.

**CNF-14** For each expression case an implementation checks three results: the token stream equals `tokens`, the parsed AST equals `ast`, and for each entry of `cases` the value of the expression evaluated with `data` as the root data equals `value`. Values are compared as JSON; a safe string compares as a plain string. A case with `error` checks that parsing raises that code.
