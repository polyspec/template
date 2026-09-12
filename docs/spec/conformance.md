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

**CNF-3** `scripts/check-rules.mjs` collects every rule identifier defined in `docs/spec/*.md` and every identifier listed in `case.json` files. It fails when a `case.json` names a rule that no document defines, and it reports the rules that no case covers. `make check` runs it.

## Command line contract

**CNF-4** Every implementation provides a command with two subcommands.

| Command | Output | Exit status |
| --- | --- | --- |
| `parse FILE [--root DIR] [--delimiters OC]` | The AST JSON on stdout. | 0 |
| `render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]` | The rendered HTML on stdout. | 0 |
| either subcommand, template error | The error JSON on stderr. | 2 |
| either subcommand, usage error | A message on stderr. | 1 |

`--root` defaults to the directory of `FILE`. The template name passed to the parser and used in errors is `FILE` relative to the root. `--data`, `--define` and `--env` name JSON files with the content of CNF-2. `--delimiters` is the two-character value of the engine option `delimiters`; the runner passes the value of `options.json`. Output is UTF-8. The command does not add a trailing newline.

**CNF-5** Commands per implementation:

| Implementation | Command |
| --- | --- |
| ts | `node packages/template-ts/bin/template.mjs` |
| go | `packages/template-go/template` |
| rust | `packages/template-rust/target/release/template` |
| php | `php packages/template-php/bin/template.php` |
| php-ext | `php -d extension=packages/template-php-ext/target/release/libpolyspec_template.so packages/template-php-ext/bin/template-ext.php` |

## Comparison

**CNF-6** AST comparison parses both JSON documents and compares them recursively. Object key order has no meaning. Numbers compare by value.

**CNF-7** HTML comparison compares the bytes of stdout with the bytes of `expected.html`.

**CNF-8** Error comparison compares `code`, `template`, `line` and `col` of the stderr JSON with `expected.error.json`. A case with `expected.error.json` passes only when the exit status is 2.

**CNF-9** A case passes for an implementation when the `parse` result equals `expected.ast.json` and the `render` result satisfies CNF-7 or CNF-8.

## Runners

**CNF-10** `tests/runner/conformance.mjs` enumerates the cases, runs every selected implementation, prints one row per case and implementation, and exits with status 1 when any comparison fails.

| Option | Effect |
| --- | --- |
| `--langs a,b` | Run the listed implementations. Default: every implementation whose command exists. |
| `--case group/name` | Run one case. |
| `--list` | Print the case ids and the count without running. |
| `--update ast\|html\|error` | Write the expected file of the given kind from the `ts` implementation. `ts` must be among the selected implementations. |

**CNF-11** `tests/runner/parity.mjs` runs every selected implementation on every case and compares the outputs of the implementations with each other. It does not read expected files. It reports the cases whose outputs differ and exits with status 1 when any case differs.

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
