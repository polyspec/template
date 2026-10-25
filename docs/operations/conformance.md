<!-- doc-id: docs-operations-conformance -->
# Conformance

[한국어](/ko/operations/conformance).

The conformance suite verifies that every implementation produces the same AST, the same output and the same error fields for the cases in `tests/cases/`.


The rules below (CNF-n) are the rules of the conformance suite itself: the layout of a case, the command line that every implementation provides to the suite, the comparison and the runners. They are not requirements of the language, so they are not traced by `config/parity.json`.

## Run the suite

```sh
make conformance
node tests/runner/conformance.mts --langs ts,go
node tests/runner/conformance.mts --case loop/meta-fields
make parity-check
```

`make conformance` builds every package and runs all cases; a missing package fails the run. The runner prints `<case> [<lang>] pass|fail (<ms> ms)` when a case finishes in an implementation, then a summary table with one row per case and implementation, and exits with status 1 when a comparison fails. `make parity-check` runs the native test of each implementation that binds a shared suite of `config/parity.json` (CNF-11). A runner builds the CLI of each implementation before the cases (`tests/runner/drivers.mts`), also when a binary is present, because it may be built from older sources; the build does nothing when its inputs are unchanged. The runner executes the Go and Rust CLIs and loads the PHP extension from `var/build`, where `scripts/publish-build.mts` publishes a build only when its bytes change: cargo links `target/release` again on every build, go build writes a new file, and macOS checks a new executable file on its first run, which took 29.8 s for the Rust CLI on a loaded machine and failed the 10 s limit of a call. `make build-go`, `make build-rust` and `make build-php-ext` publish to the same files. It is a step without a time limit, which prints its start, the output of the build and its result with the elapsed time on standard error and fails when the build exits with a nonzero status; each CLI call has a timeout of 10 s. `make delimiter-matrix` renders a template with every valid ASCII delimiter pair and with quoted delimiter characters in every language, prints `<pair> [<lang>] pass|fail (<ms> ms)` when a pair finishes in a language, and prints the number of checks at the end.

`make conformance-generated-ts`, `make conformance-generated-go`, `make conformance-generated-rust`, `make conformance-generated-php` and `make conformance-generated-python` run the generated program of every case; `--case <group>/<name>` or `--case <group>` selects cases. Each case prints its start and its result with its elapsed time and has its own deadline of 30 s. The Go and Rust runners run the case tests through `node_modules/@polyspec/kit/scripts/kit/run-tests.mts`; a Go case is the package `case_<case id>` and a Rust case is the test `case_<case id>`, with each run of characters other than letters and digits written as `_`. The PHP runner stops `php -l` and the process of a case at the deadline. The Python runner stops `python3 -m py_compile` and the process of a case at the deadline. The TypeScript runner runs `tsc` once as a step without a time limit, prints its start, a line every 5 s while it runs and its result with the elapsed time, fails when `tsc` exits with a nonzero code, and renders each case in a worker.

## Add a case

1. Create `tests/cases/<group>/<name>/` with `input.tpl`, `case.json` (`requirements` and `stage`), and `data.json`, `define.json`, `env.json`, `options.json` or additional templates as needed.
2. Write `expected.html` or `expected.error.json` by hand from the specification.
3. Generate `expected.ast.json` with the TypeScript implementation and review it:

```sh
node tests/runner/conformance.mts --langs ts --case <group>/<name> --update ast
node scripts/check-schema.mts
node scripts/check-rules.mts
```

4. Run the suite for every implementation.

`scripts/check-schema.mts` fails when a case whose `input.tpl` parses has no `expected.ast.json`, and when a case that expects a lexical or parse error of `input.tpl` has one (CNF-15). `make schema-check`, `make docs-check` and therefore `make check` run it.

`--update html` and `--update error` write the expected output from the TypeScript implementation. Review a generated file against the specification before committing it.

## Add an expression fixture

Add an entry to `tests/fixtures/expr/cases.json` with `name`, `expr`, `tokens`, `ast` and `cases`, or `name`, `expr` and `error`. Spans count bytes from the start of `expr`. Every implementation loads the file in its unit tests.

## Fixture cases

- **CNF-1** A case is a directory `tests/cases/<group>/<name>/`. `<group>` and `<name>` consist of lowercase letters, digits and `-`.

- **CNF-2** Files in a case directory:

| File | Required | Content |
| --- | --- | --- |
| `input.tpl` | yes | The entry template. Its template name is `input.tpl`. |
| other `.tpl` files | no | Templates referenced by include and block tags. The loader root is the case directory. |
| `data.json` | no | Assign data. Default `{}`. |
| `define.json` | no | Template definitions. Default `{}`. Each value is a string path, `{"template": "path"}` with an optional `"data"` object, or `{"html": "string"}`. Paths are relative to the case directory. |
| `env.json` | no | Environment. Default `{"timezone": "Z", "now": 0}`. |
| `options.json` | no | Engine options. Default `{}`. `{"delimiters": ";;"}` selects the delimiters. |
| `case.json` | yes | `{"requirements": ["LEX-3"], "stage": 1}`. `requirements` lists the specification requirements the case tests. `stage` is 1 for lexical, grammar and expression cases, 2 for function, data model and whitespace cases, and 3 for include, block, wrapper, delimiter and error cases. |
| `expected.ast.json` | yes, unless `expected.error.json` names a lexical or parse error of `input.tpl` | The AST of `input.tpl`. Includes and blocks are not expanded. |
| `expected.html` | one of the two | The exact render output. |
| `expected.error.json` | one of the two | `{"code", "template", "line", "col"}` of the expected error. |
| `expected.tokens.json` | when `expected.ast.json` is present | The tokens of `input.tpl` (FMT-1, FMT-2): a JSON array of `[start, end, type]`. |
| `expected.format.json` | when `expected.ast.json` is present | `{"indent": R, "keep": R}`: the result of formatting `input.tpl` with the default options (`indent`, two spaces and `templateBlocks` `indent`) and with `indent: null` (`keep`) ([formatting](../spec/formatting.md)). `R` is `{"text": "<formatted text>"}` or `{"error": {"reason", "code", "line", "col"}}` (FMT-14). |

- **CNF-15** `scripts/check-schema.mts` checks the presence of `expected.ast.json` in every case directory. It fails when a case has no `expected.ast.json` and its `expected.error.json` does not name an `E_LEX_*` or `E_PARSE_*` code with `template` equal to `input.tpl`, and when a case has an `expected.ast.json` although its `expected.error.json` names such an error. It also fails when `expected.tokens.json` or `expected.format.json` is missing in a case with `expected.ast.json`, present in a case without it, or does not have the content of CNF-2. `make schema-check` and `make docs-check` run it, so `make check` fails for a missing file. Reason: CNF-9 compares the parse, token and format results of every case whose input parses, and a case without its files would otherwise pass without those comparisons.

- **CNF-16** `tests/fixtures/filesystem/cases.json` lists the filesystem cases of the filesystem loader (RT-10), which a case directory cannot hold because a checkout holds no symbolic or hard link. Each case has `name`, `requirements`, `files` (a template name mapped to its text, `input.tpl` among them), optional `symbolicLinks` and `hardLinks` (a name mapped to the name of its target), and `expected` with `html` or `error` (`{code, template, line, col}`). `tests/runner/conformance.mts` writes the tree of each case into a directory of the system temporary directory, runs `render --root <directory> input.tpl` of every selected implementation as the case `filesystem/<name>` and compares the result by CNF-7 and CNF-8; `--case filesystem` selects them.

- **CNF-3** `scripts/check-rules.mts` fails when a case directory has no `case.json` or its `stage` is not 1, 2 or 3. The requirements of `case.json` are checked by `make parity-declarations-check` of kit: an id that no file of `docs/spec` defines (R14), a requirement that no unit of `config/parity.json` cites (R13) and a cited id that no case of the unit lists (R15). `make check` runs both.

## Command line contract

- **CNF-4** Every implementation provides a command with four subcommands.

| Command | Output | Exit status |
| --- | --- | --- |
| `parse [--root DIR] [--delimiters OC] FILE` | The AST JSON on stdout. | 0 |
| `render [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC] FILE` | The rendered HTML on stdout. | 0 |
| `tokens [--root DIR] [--delimiters OC] FILE` | The tokens of FMT-1 and FMT-2 as a JSON array of `[start, end, type]` on stdout. | 0 |
| `format [--indent none\|tab\|N] [--delimiters OC] FILE` | The formatted text on stdout, the source when nothing changes. | 0 |
| `parse`, `render` or `tokens`, template error | The error JSON on stderr. | 2 |
| `format`, format error | The JSON `{"reason", "code", "line", "col", "message"}` of FMT-14 on stderr. | 2 |
| any subcommand, usage error | A message on stderr. | 1 |

The runner passes each option as one argument, `--name=value`, so that a value that starts with a hyphen (the delimiter pair `-!`) is never read as an option, and passes the options before `FILE`, as the POSIX utility syntax guidelines (guidelines 9 and 10) order them, because some standard parsers stop at the first operand. Implementations parse with their language's standard parser (for example TypeScript `parseArgs` of node:util, Go `flag`, Rust `clap`, Python `argparse`, PHP `symfony/console`) and follow its behavior for any other order. `--root` defaults to the directory of `FILE`. The template name passed to the parser and used in errors is `FILE` relative to the root. `--data`, `--define` and `--env` name JSON files with the content of CNF-2. A file that cannot be read is a usage error. A file whose content is not one JSON document is a template error `E_DATA_INVALID_JSON` with the position of ERR-5 (VAL-12); every other data error of these files is a template error with its `E_DATA_*` code at the same position. `--delimiters` is the two-character value of the engine option `delimiters`; the runner passes the value of `options.json`. `--indent` is the indent unit of FMT-9: `N` spaces (1 to 8, default 2), `tab`, or `none` for `indent: null`; `format` uses `templateBlocks` `indent`. Output is UTF-8. The command does not add a trailing newline.

- **CNF-5** Commands per implementation:

| Implementation | Command |
| --- | --- |
| ts | `node packages/ts/bin/template.mjs`; `format`: `node packages/language/bin/template-language.mjs` |
| go | `packages/go/template` |
| rust | `packages/rust/target/release/template` |
| php | `php packages/cli/php/bin/template.php` |
| php-ext | `php -d extension=var/php-ext/polyspec_template.so packages/cli/php/bin/template.php` |
| python | `var/python/venv/bin/python -m polyspec.template.cli` (`make python-package` installs `packages/python` into `var/python/venv`) |

The formatter of TypeScript is the package `@polyspec/template-language`, which depends on `@polyspec/template`, so its command `template-language` provides `format` and the command `template` the other subcommands.

## Comparison

- **CNF-6** AST comparison parses both JSON documents and compares them recursively. Object key order has no meaning. Numbers compare by value.

- **CNF-7** HTML comparison compares the bytes of stdout with the bytes of `expected.html`.

- **CNF-8** Error comparison compares `code`, `template`, `line` and `col` of the stderr JSON with `expected.error.json`. A case with `expected.error.json` passes only when the exit status is 2.

- **CNF-17** Token comparison parses the stdout of `tokens` and requires the array to equal `expected.tokens.json` element by element, with the exit status 0.

- **CNF-18** Format comparison runs `format` once with the default options and once with `--indent none`, and compares each with the entry `indent` or `keep` of `expected.format.json`: for `text`, the exit status is 0 and the bytes of stdout equal the text; for `error`, the exit status is 2 and `reason`, `code`, `line` and `col` of the stderr JSON equal the expected fields. `message` is not compared.

- **CNF-9** A case passes for an implementation when the `render` result satisfies CNF-7 or CNF-8 and, for a case with `expected.ast.json`, the `parse` result equals it and the `tokens` and `format` results satisfy CNF-17 and CNF-18. An implementation without one of the subcommands fails the case.

## Runners

- **CNF-10** `tests/runner/conformance.mts` enumerates the cases, runs every selected implementation, prints `<case> [<lang>] pass|fail (<ms> ms)` when a case finishes in an implementation, prints a summary table with one row per case and implementation after the last case, and exits with status 1 when any comparison fails.

| Option | Effect |
| --- | --- |
| `--langs a,b` | Run the listed implementations. Default: every implementation whose command exists. |
| `--case group/name` | Run one case. |
| `--list` | Print the case ids and the count without running. |
| `--update ast\|html\|error\|tokens\|format` | Write the expected file of the given kind from the `ts` implementation; `tokens` and `format` write the files of the cases with `expected.ast.json`. `ts` must be among the selected implementations. |

- **CNF-11** `config/parity.json` declares the implementations and the shared suites: the conformance cases of `tests/cases` (unit `conformance`, whose native tests compare the AST and the render result), the tokens of those cases (unit `tokens`, CNF-17), their format results (unit `formatting`, CNF-18) and the expression vectors of `tests/fixtures/expr/cases.json`. `make parity-check` of kit runs the native test of each implementation that binds a suite and fails unless every case of the suite passed in every implementation of its profile; an exclusion fails until the task that it names removes it. Each native test reports each case under the name of its runner: a subtest `TestX/<case>` in Go, a test `<symbol>::<case>` in cargo, a top-level test `<case>` in vitest, a data set `"<case>"` of the method of the binding in PHPUnit and a test `<case>` in unittest. The PHP extension exposes no expression lexer or evaluator, so its test of the expression vectors parses each expression in the echo tag `{=<expr>}` and evaluates it with `{= json(<expr>) | raw}`, and does not compare the token vectors. Every other test file of an implementation is the native test of a feature unit of `config/parity.json`, one native test of each implementation of its profile; a profile narrower than every implementation names the spec rules that make the difference permanent.

## Expression fixtures

- **CNF-12** `tests/fixtures/expr/cases.json` is a list of expression cases. Every implementation loads the file in its own test suite.

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

- **CNF-13** Token types:

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

- **CNF-14** For each expression case an implementation checks three results: the token stream equals `tokens`, the parsed AST equals `ast`, and for each entry of `cases` the value of the expression evaluated with `data` as the root data equals `value`. Values are compared as JSON; a safe string compares as a plain string. A case with `error` checks that parsing raises that code.
