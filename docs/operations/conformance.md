<!-- doc-id: docs-operations-conformance -->
# Conformance

[한국어](/ko/operations/conformance).

The conformance suite verifies that every implementation produces the same AST, the same output and the same error fields for the cases in `tests/cases/`. During the transition (docs/spec/runtime.md#transition) the legacy language packages, the TypeScript packages that take the legacy runtime and the code that the compiler generates for them run `legacy/tests/`, a copy of `tests/cases/` and of `tests/fixtures/` as the legacy packages passed them when they moved, with the expected errors in the former form `{code, template, line, col}`; the Rust crate runs `tests/`. A change of behavior changes `tests/` only.


The rules below (CNF-n) are the rules of the conformance suite itself: the layout of a case, the command line that every implementation provides to the suite, the comparison and the runners. They are not requirements of the language.

## Run the suite

```sh
make conformance
node tests/runner/conformance.mts --langs ts,go
node tests/runner/conformance.mts --case loop/meta-fields
```

`make conformance` builds every package and runs all cases; a missing package fails the run. The runner prints `<case> [<lang>] pass|fail (<ms> ms)` when a case finishes in an implementation, then a summary table with one row per case and implementation, and exits with status 1 when a comparison fails. A runner builds the CLI of each implementation before the cases (`tests/runner/drivers.mts`), also when a binary is present, because it may be built from older sources; the build does nothing when its inputs are unchanged. The runner executes the Go and Rust CLIs and loads the PHP extension from `var/build`, where `scripts/publish-build.mts` publishes a build only when its bytes change: cargo links `target/release` again on every build, go build writes a new file, and macOS checks a new executable file on its first run, which took 29.8 s for the Rust CLI on a loaded machine and failed the 10 s limit of a call. `make build-go`, `make build-rust` and `make build-php-ext` publish to the same files. It is a step without a time limit, which prints its start, the output of the build and its result with the elapsed time on standard error and fails when the build exits with a nonzero status; each CLI call has a timeout of 10 s. `make delimiter-matrix` renders a template with every valid ASCII delimiter pair and with quoted delimiter characters in every language, prints `<pair> [<lang>] pass|fail (<ms> ms)` when a pair finishes in a language, and prints the number of checks at the end.

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
| `expected.error.json` | one of the two | `{"raises": {"kind", "status", "category", "message", "properties": {"template", "line", "col"}}}` of the expected error: its kind (ERR-1), no HTTP status (`null`), the category of the kind in the error table of `packages/rust/interface.json`, no message (`null`, ERR-3) and the template and position that ERR-3 compares. |
| `expected.tokens.json` | when `expected.ast.json` is present | The tokens of `input.tpl` (FMT-1, FMT-2): a JSON array of `[start, end, type]`. |
| `expected.format.json` | when `expected.ast.json` is present | `{"indent": R, "keep": R}`: the result of formatting `input.tpl` with the default options (`indent`, two spaces and `templateBlocks` `indent`) and with `indent: null` (`keep`) ([formatting](../spec/formatting.md)). `R` is `{"text": "<formatted text>"}` or `{"error": {"reason", "code", "line", "col"}}` (FMT-14). |

- **CNF-15** `scripts/check-schema.mts` checks the presence of `expected.ast.json` in every case directory. It fails when a case has no `expected.ast.json` and its `expected.error.json` does not name a `lex_*` or `parse_*`` code with `template` equal to `input.tpl`, and when a case has an `expected.ast.json` although its `expected.error.json` names such an error. It also fails when `expected.tokens.json` or `expected.format.json` is missing in a case with `expected.ast.json`, present in a case without it, or does not have the content of CNF-2. `make schema-check` and `make docs-check` run it, so the full suite fails for a missing file. Reason: CNF-9 compares the parse, token and format results of every case whose input parses, and a case without its files would otherwise pass without those comparisons.

- **CNF-16** `tests/fixtures/filesystem/cases.json` lists the filesystem cases of the filesystem loader (RT-10), which a case directory cannot hold because a checkout holds no symbolic or hard link. Each case has `name`, `requirements`, `files` (a template name mapped to its text, `input.tpl` among them), optional `symbolicLinks` and `hardLinks` (a name mapped to the name of its target), and `expected` with `html` or `error` (`{code, template, line, col}`). `tests/runner/conformance.mts` writes the tree of each case into a directory of the system temporary directory, runs `render --root <directory> input.tpl` of every selected implementation as the case `filesystem/<name>` and compares the result by CNF-7 and CNF-8; `--case filesystem` selects them.

- **CNF-19** `contracts/core-cases.json` holds the contract cases of the Rust core and of the bindings that binding generates from `packages/rust/interface.json`: one group for each public member of the contract, named by the id of the member, and the `cases` of the contract name the group of each member. A case has an `id`, the `rule` that it shows and the arguments of the member by their parameter names, and it states either the `result` of the call or `raises` with the kind, the status and the category of the failure (ERR-1). A receiver or an argument that is an instance is `{"new": <member that gives it>, "receiver", "args", "then": [steps]}`, where each step of `then` is a call that prepares the instance and whose failure fails the case as a failed preparation. A loader of host code is a callback value `{"callback": {"loader.load": [rows]}}` and a host function a function value `{"function": [rows]}`: a row is `{"args", "result"}`, the first row whose `args` equal the arguments of a call that is not used up answers it, a row with `"once": true` answers one call, and a call that no row answers fails the case. A `template_value` and a `json_value` are `{"kind", "value"}`, a map being its `[key, value]` pairs in order and a number of a `json_value` its literal; `{"host": "object"}` is a native object (VAL-19); a `source` is its text or `{"hex"}`; a `path` is relative to a directory that the case owns. A value of a variant unit is an object whose tag key, the `tag` of the unit in snake_case (`type`), holds the `value` of its case as the contract states it, and whose other keys are the fields of the case by their snake_case names, each in the form of its type: `{"type": "Text", "value": "a ", "span": [0, 2]}` is a node, and `{"type": "source", "bytes": {"hex": "780a"}, "version": "1"}` is what a row of `loader.load` gives. A field of an `optional` type whose default is null may be left out, which is null; every other field is given, and a key that is no field of the case fails the case. A value of a record is an object of its fields by their snake_case names, a value of an enum is the `value` of its variant (`"!"` of `unary_op`), a tuple is an array of its parts and `bytes` are `{"hex"}`. The runner reads such a value into the type of the core and writes a result from that type with every field, and it compares a result with the expected value after it read and wrote the expected value in the same way, so a field left out equals null. `after` observes the instance that the call returned with a call and its `result`. `packages/rust/tests/contract_cases.rs` runs every case against the core as the test `<group>::<id>` of `make test-rust`, fails a group without a case, a group that no row of `cases` names and a form that it does not read, and checks as `raises::<member>` that every kind that a case of a member raises is in the `raises` of that member. The kind `internal` has no case of a member, because no input reaches it. The group `template_value` holds the cases of the value alias of that name, which a row of `cases` names by `alias` in place of `member`: a case is `{"id", "value", "raises"}` with an optional `rule` and `note`, and its value enters through `value_in` as a binding describes a value of a language, a float that is not finite being `{"float": "nan" | "inf" | "-inf"}`, a text that is not well formed `{"ill_formed": "<text>"}`, bytes `{"hex"}` and n lists around a value `{"kind": "list", "repeat": n, "value"}`. `in_raises` of the alias names exactly the kinds that `value_in` returns: data_number_range, data_number_not_finite, data_invalid_utf8, data_unsupported_type and data_depth. A member that takes the alias fails with each of them besides the kinds of its `raises`, and the runner checks as `in_raises::template_value` that `in_raises` names those kinds and that each has a case. Reason: the cases are the one statement of what each member returns for an input, which the core and every generated binding run, so a binding cannot differ from the core without a failing case. Reason for the form of a variant value: the tag key with the value of the case is the form of the AST JSON (AST-7) and the form in which a generated binding gives a variant to a language that has no class for it, so one text names a case in the contract, in the AST JSON and in a case, and the generated test of a binding reads the same value that the runner of the core reads; an object with one key of the case name is a form that only the runner read.

- **CNF-20** The struct of the core that a record of `packages/rust/interface.json` names in `core_type` has exactly the fields of the record, each `pub` and by its snake_case name, and each in the Rust type that the contract type of the field states. `bool` is `bool`; `uint` is `usize`, `u64`, `u32`, `u16` or `u8`; `int` is `isize`, `i64`, `i32`, `i16` or `i8`; `int64` is `i64`; `float` is `f64`; `text` is `String`; `bytes` is `Vec<u8>`; `path` is `PathBuf`; `list<T>` is `Vec<T>`; `map<T>` is `binding_core::OrderedMap<T>`; `optional<T>` is `Option<T>`; a tuple is the Rust tuple of its parts or, when its parts have one type, the array `[T; n]`; an enum, a record, a variant or a value alias is the type that its `core_type` names; a callback unit is `Box<dyn Trait + 'a>` of its core trait, and a struct that holds one has the one lifetime parameter `'a`. A field with a default whose type is not `optional` is the `Option<T>` of its type, and `None` is the value that `default_core` names, the empty value of an `{empty}` default or the value that the rule of a `{computed}` default states. A field of an `optional` type is the `Option<T>` of that type with no second `Option`, so a field left out and a null are one `None`, and a null never means another value than the default. `tests/scripts/core-type.test.mts` compares the fields and the type of every field of every record. Reason: the contract states the type of a value and not the Rust type that holds it, and a generated crate writes a struct literal of the fields of the record and passes `None` for a field that was left out (binding GN-6i, GN-6ac, GN-6aa). A field of another type, a field that the record does not have and a struct without the lifetime of its callback do not compile there, and a `None` with another meaning than the default gives a value that the declarations of the binding do not show.

- **CNF-3** `scripts/check-rules.mts` fails when a case directory has no `case.json` or its `stage` is not 1, 2 or 3.

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
| ts | `node legacy/packages/ts/bin/template.mjs`; `format`: `node packages/language/bin/template-language.mjs` |
| go | `legacy/packages/go/template` |
| rust | `target/release/template` |
| php | `php vendor/bin/template.php` |
| php-ext | `php -d extension=var/php-ext/polyspec_template.so vendor/bin/template.php` |
| python | `legacy/packages/python/.venv/bin/python -m polyspec.template.cli` (`make python-package` installs `legacy/packages/python` into `legacy/packages/python/.venv`) |

The formatter of TypeScript is the package `@polyspec/template-language`, which depends on `@polyspec/template`, so its command `template-language` provides `format` and the command `template` the other subcommands.

## Comparison

- **CNF-6** AST comparison parses both JSON documents and compares them recursively. Object key order has no meaning. Numbers compare by value.

- **CNF-7** HTML comparison compares the bytes of stdout with the bytes of `expected.html`.

- **CNF-8** Error comparison compares `code`, `template`, `line` and `col` of the stderr JSON with the kind and the properties of `expected.error.json`; a code `E_<KIND>` of a legacy implementation is compared as its kind (ERR-1). A case with `expected.error.json` passes only when the exit status is 2.

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

- **CNF-11** Every implementation runs the shared suites in its native tests: the conformance cases of `tests/cases` (unit `conformance`, whose native tests compare the AST and the render result), the tokens of those cases (unit `tokens`, CNF-17), their format results (unit `formatting`, CNF-18) and the expression vectors of `tests/fixtures/expr/cases.json`. Each native test reports each case under the name of its runner: a subtest `TestX/<case>` in Go, a test `<symbol>::<case>` in cargo, a top-level test `<case>` in vitest, a data set `"<case>"` of the method of the binding in PHPUnit and a test `<case>` in unittest. The PHP extension exposes no expression lexer or evaluator, so its test of the expression vectors parses each expression in the echo tag `{=<expr>}` and evaluates it with `{= json(<expr>) | raw}`, and does not compare the token vectors.

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
