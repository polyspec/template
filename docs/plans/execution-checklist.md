# Execution checklist

[한국어](execution-checklist.ko.md).

This document lists every task required to deliver the template engine: the specification, the conformance suite, the TypeScript, Go, Rust and PHP implementations, the PHP extension, the browser build, benchmarks and documentation. Tasks are grouped into waves. Tasks inside a wave marked `parallel` are independent of each other. A wave starts only when its listed dependencies are complete.

## How to use

- Task ID format: `T<wave>.<number>` or `T<wave>.<track>.<number>`.
- The last column of every task row is a checkbox: `[ ]` open, `[x]` done, `[ ] blocked: <reason>` when the task cannot proceed. Check a task only after its verification command passed on the committed tree.
- Every task names its deliverable files, its tests and one verification command. A task is `done` only when the verification command passes on the committed tree.
- No temporary scripts or folders. Every check is a Makefile target, a script under `scripts/`, or a committed test.
- Code and tests are separate directories inside each package. Core tests stay in the core package. Extension tests stay in the extension package.
- A defect is handled by adding a failing test that reproduces it, fixing the code, and keeping the test.
- Files that grow beyond one responsibility are split by role.

## Dependency overview

```
W0 foundation ──► W1 specification (parallel docs) ──► W1.11 spec review
                                                        │
                                                        ▼
                                          W2 conformance assets (parallel)
                                                        │
                                                        ▼
                                          W3 TypeScript implementation (sequential core, parallel leaves)
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       ▼                                ▼                                ▼
                 W4.G Go track                    W4.R Rust track                  W4.P PHP track
                       └────────────────────────────────┼────────────────────────────────┘
                                                        ▼
                                         W4.X cross-language gate (make check)
                                                        │
                                          ┌─────────────┴─────────────┐
                                          ▼                           ▼
                                   W5 PHP extension            W6 bench, docs site, status
                                          └─────────────┬─────────────┘
                                                        ▼
                                              W7 consumer integration
```

## Wave 0 — Repository foundation (sequential)

Dependencies: none. One owner. Each task depends on the previous one.

| ID | Task | Deliverables | Verification | Done |
| --- | --- | --- | --- | --- |
| T0.1 | Initialize repository and toolchain pins | `.gitignore`, `.node-version` (26.8.1), `rust-toolchain.toml` (1.98.1, rustfmt, clippy), `.editorconfig` | `git status` clean after commit; `node --version` matches | [x] |
| T0.2 | Development rules | `AGENTS.md`, `AGENTS.ko.md`: English and Korean document pairs, contracts in `docs/spec/`, status in `docs/features.md`, procedures in `docs/operations/`, changes in `CHANGELOG.md`, simplest implementation, idempotent commands, code/test separation, red-green defect procedure, writing style (direct action names, subject and object stated, one-sentence causes, no figurative wording) | `make docs-check` | [x] |
| T0.3 | Top-level documents | `README.md`(.ko), `CHANGELOG.md`(.ko), `docs/index.md`(.ko), `docs/features.md`(.ko) with every feature row `not-started`/`pending`/`not-deployed` and evidence links | `make docs-check` | [x] |
| T0.4 | Workspace and Makefile | `package.json` (workspaces `packages/*`, scripts `lint`, `test`, `docs:check`), `Makefile` with targets `help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php conformance parity test-browser ext test-ext schema-check docs-check docs docs-verify-idempotent bench bench-ts bench-php bench-go bench-rust clean`; targets whose package does not exist yet print a `not implemented` line and exit 1 | `make help` | [x] |
| T0.5 | Document checker | `scripts/check-documents.mjs`: required English/Korean pairs, relative links resolve, code blocks identical across languages, feature status fields valid | `node scripts/check-documents.mjs` | [x] |
| T0.6 | This checklist | `docs/plans/execution-checklist.md`(.ko) | `make docs-check` | [x] |
| T0.7 | Operations documents | `docs/operations/development.md`(.ko): toolchain install, `make` targets, commit procedure; `docs/operations/documentation.md`(.ko): document rules and checker | `make docs-check` | [x] |

Exit criteria: `make docs-check` passes; `make help` lists every target; first commit exists.

## Wave 1 — Specification (parallel)

Dependencies: T0.2, T0.5. Tasks T1.1–T1.10 are `parallel`. T1.11 runs after all of them. Each document is an English file plus a `.ko.md` file with the same content. Every normative rule carries an identifier (`LEX-1`, `GRM-4`, `EXP-12`, `VAL-3`, `FUN-7`, `RT-5`, `AST-2`, `ERR-9`, `CNF-1`) so fixtures and tests can cite it.

| ID | Task | Deliverables | Content | Verification | Done |
| --- | --- | --- | --- | --- | --- |
| T1.1 | Lexical specification | `docs/spec/lexical.md`(.ko) | UTF-8 and BOM handling; line terminators; tag start rule (`{` followed by horizontal whitespace and a sigil, or `{` followed by an identifier and an assignment operator); text otherwise; escape `\{` consumed only where a tag would start; comment `{* *}`; tag end at the first `}` outside a string literal; standalone line removal rule for non-echo tags; examples for JavaScript and CSS braces that stay text | `make docs-check` | [x] |
| T1.2 | Tag grammar | `docs/spec/grammar.md`(.ko) | EBNF for echo, loop, if, elseif, else, close, include, block, if-block, assignment; block nesting and closing rules; `{:}` inside a loop as the empty branch; error conditions per rule; bare and quoted path token definition; block tag token order (optional id, optional path, scope items `name` or `name:postfix`) | `make docs-check` | [x] |
| T1.3 | Expression specification | `docs/spec/expressions.md`(.ko) | Token table; EBNF; precedence table (pipe, ternary and elvis, coalesce with trailing shorthand, or, and, equality, comparison and `in`, additive, multiplicative, unary, postfix); path access and lookup rule; loop meta access `name.index_ key_ value_ last_ first_ size_` parsed as a dedicated node; `+` rule (numeric addition unless either side is a string, then concatenation); other arithmetic numeric only; equality, strict equality, ordering, truthiness; list and map literals with `=>` and spread | `make docs-check` | [x] |
| T1.4 | Data model | `docs/spec/data-model.md`(.ko) | Value types; number as IEEE 754 double with safe integer range; string to number conversion grammar; number to string rule identical to ECMAScript `Number::toString` with per-language construction notes; boolean and null output; ordered map; host binding tables for JSON, JavaScript, PHP, Go, Rust; rejection codes | `make docs-check` | [x] |
| T1.5 | Functions | `docs/spec/functions.md`(.ko) | Signature, arity, semantics and error cases for every built-in function; pipe desugaring; `number` decimal rounding rule; `json` escaping rule; `date` token table and time zone rule; `now` from environment; host registration contract; safe-value rules for `raw` and `json` | `make docs-check` | [x] |
| T1.6 | Runtime | `docs/spec/runtime.md`(.ko) | Engine API in four languages; render call shape (template name or AST, assign data, define map, environment); flat per-file local scope; loop variable binding and restoration; include with shared scope; template definition with isolated context (root assign, definition data, scope arguments); definition entries (string path, `template` with optional `data`, or `html`); layout target selection; redefinition rule; loader interface and name resolution; strict and lenient modes; limits (iterations, depth, output size, expression depth); output escaping; HTML embedding of assign data for the browser | `make docs-check` | [x] |
| T1.7 | AST schema | `docs/spec/ast.md`(.ko), `schema/ast.schema.json`, `schema/README.md`(.ko) | Node list with fields and `span` byte offsets; desugaring of pipes, compound assignment and increment; serialization rules (number literal as JSON number, string literal decoded); JSON Schema draft-07 covering every node | `node scripts/check-schema.mjs` (schema self-validation) | [x] |
| T1.8 | Errors | `docs/spec/errors.md`(.ko) | Error object fields; complete code list by stage (lex, parse, load, data, runtime); which fields conformance compares; mode behaviour per code | `make docs-check` | [x] |
| T1.9 | Conformance | `docs/spec/conformance.md`(.ko) | Fixture directory layout and file roles; CLI contract (`parse FILE`, `render FILE --data --define --env --root`, exit codes, stdout/stderr); comparison rules (AST structural, HTML byte-exact, error fields); runner options; expression fixture format (tokens, AST, values) | `make docs-check` | [x] |
| T1.10 | Examples | `docs/spec/examples.md`(.ko) | One complete page: layout, header partial, footer definition with scope arguments, list with loop meta, card definition, assign data file, define file, expected output, AST excerpt | `make docs-check` | [x] |
| T1.11 | Specification review (sequential) | Edits across `docs/spec/*` | Term consistency; every error code used in text exists in `errors.md`; every function in `expressions.md`/`examples.md` exists in `functions.md`; every rule has an ID; both languages carry the same information | `make docs-check`; review record in `CHANGELOG.md` | [x] |

Exit criteria: all ten document pairs exist; `make docs-check` passes; `schema/ast.schema.json` validates against its meta-schema.

## Wave 2 — Conformance assets (parallel)

Dependencies: T1.11. All tasks are `parallel`. Fixture ASTs are written by hand for at least the cases marked `AST by hand`; the remaining `expected.ast.json` files are produced by the TypeScript implementation in T3.13 and reviewed before commit.

| ID | Task | Deliverables | Verification | Done |
| --- | --- | --- | --- | --- |
| T2.1 | Runner drivers | `tests/runner/drivers.mjs`: per-language command, build command, working directory, binary path | `node tests/runner/conformance.mjs --list` | [x] |
| T2.2 | Conformance runner | `tests/runner/conformance.mjs`: case enumeration, per-language invocation with timeout, AST structural diff, HTML byte comparison, error field comparison, options `--langs`, `--case`, `--list`, `--update`, table output, non-zero exit on failure | `node tests/runner/conformance.mjs --list` | [x] |
| T2.3 | Parity runner | `tests/runner/parity.mjs`: language-to-language output comparison without expected files, client/server axis report | `node tests/runner/parity.mjs --help` | [x] |
| T2.4 | Schema checker | `scripts/check-schema.mjs`: validates `schema/ast.schema.json` with ajv and every `tests/cases/**/expected.ast.json` against it | `node scripts/check-schema.mjs` | [x] |
| T2.5 | Fixtures: text | `tests/cases/text/`: plain text, braces that stay text (`{ debug: true }`, `{}`, `${x}`, `{a:1}`, newline after `{`), escape at tag position, escape elsewhere, comment removal, multi-line comment, BOM removal, CRLF input. AST by hand for 4 cases | `node scripts/check-schema.mjs` | [x] |
| T2.6 | Fixtures: echo | `tests/cases/echo/`: path, nested path, numeric index, missing key, HTML escaping of five characters, `raw`, number formatting boundaries, boolean and null output, list output error. AST by hand for 3 cases | `node scripts/check-schema.mjs` | [x] |
| T2.7 | Fixtures: if | `tests/cases/if/`: basic, elseif chain, else, nested, truthiness table (`"0"`, empty list, empty map, `null`), else outside block error, duplicate else error | `node scripts/check-schema.mjs` | [x] |
| T2.8 | Fixtures: loop | `tests/cases/loop/`: list, map order, loop meta fields, nested loops with two metas, empty branch, null iterable, loop variable restoration after loop, elseif inside loop error, unknown loop meta error | `node scripts/check-schema.mjs` | [x] |
| T2.9 | Fixtures: include and block | `tests/cases/include/`, `tests/cases/block/`: include sharing locals, include cycle error, block from registry, block with path and registration, block with scope arguments (`name` and `name:value`), block isolation of locals, `html` registry entry, undefined block error, redefinition error, if-block true and false, bare path with `../`, path outside root error | `node scripts/check-schema.mjs` | [x] |
| T2.10 | Fixtures: expressions | `tests/cases/expr/`: precedence, `+` with numbers, `+` with a string on either side, `+` with list error, division by zero error, modulo, ternary, elvis, trailing `??`, `in` for list, map and string, equality table, strict equality, ordering error for mixed types, list and map literals, spread, pipe chain, call arity error | `node scripts/check-schema.mjs` | [x] |
| T2.11 | Fixtures: functions | `tests/cases/functions/`: one case per built-in function including boundary inputs; `number(2.675, 2)`, `number(1.005, 2)`, `json` with `<`, `&` and U+2028, `url` reserved characters, `date` tokens and offsets, `now` from environment, unknown function error | `node scripts/check-schema.mjs` | [x] |
| T2.12 | Fixtures: data model | `tests/cases/data/`: map key order with integer-like keys, `0.1+0.2`, `1e21`, `1e-7`, `-0`, safe integer boundary rejection, astral character length and ordering, code point comparison, invalid UTF-8 rejection | `node scripts/check-schema.mjs` | [x] |
| T2.13 | Fixtures: whitespace | `tests/cases/whitespace/`: standalone tag lines, multiple closes on one line, echo not standalone, indentation inside loops, comment-only lines, inline tags keep the line | `node scripts/check-schema.mjs` | [x] |
| T2.14 | Fixtures: errors | `tests/cases/errors/`: unterminated tag, unterminated string, unterminated comment, unexpected token, unexpected close, unclosed block, reserved name assignment, invalid escape, invalid number; each with `expected.error.json` | `node scripts/check-schema.mjs` | [x] |
| T2.15 | Expression fixtures | `tests/fixtures/expr/cases.json` (30 cases: tokens, AST, evaluation values) and `tests/fixtures/expr/README.md`(.ko) | `node scripts/check-schema.mjs` | [x] |
| T2.16 | Rule coverage checker | `scripts/check-rules.mjs`: every `case.json` rule exists in `docs/spec`, report of uncovered rules; Makefile target `rules-check` in `check` | `node scripts/check-rules.mjs` | [x] |
| T2.17 | Fixtures: wrapped tags | `tests/cases/wrapper/`: quoted, comment and HTML-comment wrappers, `&#123;&#123;` without wrapper stays text, `"{= x}"` keeps quotes, missing wrapper closer error, wrapped tag on a standalone line | `node scripts/check-schema.mjs` | [x] |
| T2.18 | Fixtures: delimiters | `tests/cases/delimiters/`: `options.json` delimiters, file directive, directive overriding the option, close delimiter used by the grammar (`[= a[0]]`), directive not first error, invalid delimiter character error, escape with a custom open delimiter | `node scripts/check-schema.mjs` | [x] |

Exit criteria: at least 80 cases enumerated; every hand-written AST validates; every spec rule ID appears in at least one case.

## Wave 3 — TypeScript implementation

Dependencies: T2.1, T2.2, T2.4, and the fixture tasks. Package `packages/template-ts`, npm name `@polyspec/template`. Source in `src/`, tests in `tests/`. Marked tasks are `parallel`; others follow their dependencies.

| ID | Task | Deliverables | Tests | Verification | Depends on | Done |
| --- | --- | --- | --- | --- | --- | --- |
| T3.1 | Package scaffold | `package.json` (build with tsup: esm, cjs, dts, neutral platform; exports `.`, `./render`, `./node`), `tsconfig.json` (`lib: ["ES2020"]`, `types: []`), `vitest.config.ts`, root `eslint.config.mjs` | `tests/smoke.test.ts` | `npm run build -w @polyspec/template` | — | [x] |
| T3.2 `parallel` | Value model | `src/value/value.ts` (types, truthiness, equality, ordering), `src/value/number.ts` (to-number, ECMAScript to-string), `src/value/bind.ts` (host input conversion) | `tests/value/*.test.ts` | `npm test -w @polyspec/template` | T3.1 | [x] |
| T3.3 `parallel` | Errors | `src/errors.ts` (error class, codes, position) | `tests/errors.test.ts` | same | T3.1 | [x] |
| T3.4 `parallel` | Escape and output | `src/escape.ts`, `src/output.ts` (builder with size limit, safe values) | `tests/escape.test.ts` | same | T3.1 | [x] |
| T3.5 | Template lexer | `src/lexer/template.ts` (text, tag start rule, escape, comment, tag body extraction with string awareness, positions) | `tests/lexer/template.test.ts` | same | T3.3 | [x] |
| T3.6 `parallel` | Expression lexer and parser | `src/expr/lexer.ts`, `src/expr/parser.ts`, `src/expr/ast.ts` | `tests/expr/lexer.test.ts`, `tests/expr/parser.test.ts`, `tests/expr/fixtures.test.ts` (loads `tests/fixtures/expr/cases.json`) | same | T3.3 | [x] |
| T3.7 | Template parser | `src/parser/parser.ts` (tags, block stack, else and empty branches), `src/parser/standalone.ts` (line removal), `src/parser/block-tag.ts` (id, path, scope items), `src/ast.ts` (node types, JSON serialization) | `tests/parser/*.test.ts`, `tests/ast-schema.test.ts` (every parsed fixture validates against `schema/ast.schema.json`) | same | T3.5, T3.6 | [x] |
| T3.8 | Built-in functions | `src/functions/index.ts`, one file per group (`string.ts`, `collection.ts`, `number.ts`, `encoding.ts`, `date.ts`) | `tests/functions/*.test.ts` | same | T3.2, T3.4 | [x] |
| T3.9 `parallel` | Loaders | `src/loader.ts` (interface, `MapLoader`, name resolution, root check), `src/node/loader.ts` (`FsLoader`) | `tests/loader.test.ts` | same | T3.3 | [x] |
| T3.10 | Renderer | `src/render/engine.ts` (engine, template definition registration, caching by name and version), `src/render/context.ts` (frames, loop metas, template definition registry, limits, mode), `src/render/statements.ts`, `src/render/expressions.ts` | `tests/render/*.test.ts` | same | T3.7, T3.8, T3.9 | [x] |
| T3.11 | CLI | `bin/template.mjs` implementing the CLI contract | `tests/cli.test.ts` | `node packages/template-ts/bin/template.mjs parse tests/cases/text/plain/input.tpl` | T3.10 | [x] |
| T3.12 | Conformance in-process | `tests/conformance.test.ts` runs every case in `tests/cases` | same | `npm test -w @polyspec/template`; `node tests/runner/conformance.mjs --langs ts` | T3.11 | [x] |
| T3.13 | Generate and review remaining ASTs | `expected.ast.json` for fixtures without one, produced by `node tests/runner/conformance.mjs --langs ts --update ast`, reviewed case by case | — | `node scripts/check-schema.mjs` | T3.12 | [x] |
| T3.14 | Browser build check | `tests/browser/index.html`, `tests/browser/render.spec.ts`, `playwright.config.ts`; page loads `dist/index.mjs` and renders ten cases | Playwright | `make test-browser` | T3.11 | [x] |
| T3.15 | Fixture expansion | Cases added for every defect found in T3.12–T3.14 | — | `node tests/runner/conformance.mjs --langs ts` | T3.12 | [x] |
| T3.16 | Package documentation | `packages/template-ts/README.md`(.ko): API, CLI, browser usage | — | `make docs-check` | T3.11 | [x] |

Exit criteria: `make test-ts`, `npm run lint`, `node tests/runner/conformance.mjs --langs ts` and `make test-browser` pass; `docs/features.md` rows `template-ts` and `template-browser` set to `implemented`/`passed`.

## Wave 4 — Go, Rust and PHP implementations (three parallel tracks)

Dependencies: T3.13 (reviewed ASTs) and T3.15. The three tracks are independent. Inside a track the order is fixed. Each track mirrors the TypeScript module split and keeps tests separate from code.

### Track G — Go (`packages/template-go`, module `github.com/polyspec/template`)

| ID | Task | Deliverables | Tests | Verification | Done |
| --- | --- | --- | --- | --- | --- |
| T4.G.1 | Module scaffold | `go.mod` (go 1.27.1, no dependencies), `README.md`(.ko) | — | `go vet ./...` | [x] |
| T4.G.2 | Value model | `template/value/value.go`, `ordered.go` (insertion-ordered map), `number.go` (to-string via shortest round-trip digits), `bind.go` (`any`, JSON decoder preserving order, structs by field order) | `template/value/*_test.go` (external test package) | `go test ./template/value/...` | [x] |
| T4.G.3 | Errors | `template/errors.go` | `template/errors_test.go` | `go test ./template/...` | [x] |
| T4.G.4 | Template lexer | `template/lexer/lexer.go` | `template/lexer/lexer_test.go` | same | [x] |
| T4.G.5 | Expression lexer and parser | `template/expr/lexer.go`, `parser.go`, `ast.go` | `template/expr/*_test.go`, fixture test loading `tests/fixtures/expr/cases.json` | same | [x] |
| T4.G.6 | Template parser and AST | `template/parser/parser.go`, `standalone.go`, `blocktag.go`, `template/ast/ast.go` with JSON marshalling | `template/parser/*_test.go`, schema validation test | same | [x] |
| T4.G.7 | Functions | `template/functions/*.go` one file per group | `template/functions/*_test.go` | same | [x] |
| T4.G.8 | Loader | `template/loader.go` (`Loader`, `MapLoader`, `FSLoader` over `fs.FS`) | `template/loader_test.go` | same | [x] |
| T4.G.9 | Renderer | `template/render/engine.go`, `context.go`, `statements.go`, `expressions.go` | `template/render/*_test.go` | same | [x] |
| T4.G.10 | CLI | `cmd/template/main.go` | `cmd/template/main_test.go` | `go build -o template ./cmd/template` | [x] |
| T4.G.11 | Conformance | `template/conformance_test.go` over `tests/cases` | same | `make test-go`; `node tests/runner/conformance.mjs --langs ts,go` | [x] |

### Track R — Rust (`packages/template-rust`, crate `polyspec-template`)

| ID | Task | Deliverables | Tests | Verification | Done |
| --- | --- | --- | --- | --- | --- |
| T4.R.1 | Crate scaffold | `Cargo.toml` (edition 2024, `serde`, `serde_json` with `preserve_order`), `Cargo.lock`, `README.md`(.ko), `#![deny(missing_docs)]` | — | `cargo build --locked` | [x] |
| T4.R.2 | Value model | `src/value/mod.rs`, `number.rs`, `bind.rs` | `tests/value.rs` | `cargo test --locked` | [x] |
| T4.R.3 | Errors | `src/error.rs` | `tests/error.rs` | same | [x] |
| T4.R.4 | Template lexer | `src/lexer.rs` | `tests/lexer.rs` | same | [x] |
| T4.R.5 | Expression lexer and parser | `src/expr/lexer.rs`, `parser.rs`, `ast.rs` | `tests/expr.rs` with fixture loading | same | [x] |
| T4.R.6 | Template parser and AST | `src/parser/mod.rs`, `standalone.rs`, `block_tag.rs`, `src/ast.rs` with serde | `tests/parser.rs`, schema validation test | same | [x] |
| T4.R.7 | Functions | `src/functions/*.rs` | `tests/functions.rs` | same | [x] |
| T4.R.8 | Loader | `src/loader.rs` | `tests/loader.rs` | same | [x] |
| T4.R.9 | Renderer | `src/render/mod.rs`, `context.rs`, `statements.rs`, `expressions.rs` | `tests/render.rs` | same | [x] |
| T4.R.10 | CLI | `src/bin/template.rs` | `tests/cli.rs` | `cargo build --locked --release --bin template` | [x] |
| T4.R.11 | Conformance | `tests/conformance.rs` | same | `make test-rust`; `node tests/runner/conformance.mjs --langs ts,go,rust` | [x] |

### Track P — PHP (`packages/template-php`, composer `polyspec/template`)

| ID | Task | Deliverables | Tests | Verification | Done |
| --- | --- | --- | --- | --- | --- |
| T4.P.1 | Package scaffold | `composer.json` (php ^8.2, PSR-4 `Polyspec\Template\`, phpunit), `phpunit.xml`, `pint.json`, `README.md`(.ko) | — | `composer install`; `vendor/bin/pint --test` | [x] |
| T4.P.2 | Value model | `src/Value/Value.php`, `Number.php`, `Bind.php` (`array_is_list`, key string restoration, safe integer check, UTF-8 check) | `tests/Value/*Test.php` | `vendor/bin/phpunit` | [x] |
| T4.P.3 | Errors | `src/TemplateError.php`, `src/ErrorCode.php` | `tests/ErrorTest.php` | same | [x] |
| T4.P.4 | Template lexer | `src/Lexer/TemplateLexer.php` | `tests/Lexer/TemplateLexerTest.php` | same | [x] |
| T4.P.5 | Expression lexer and parser | `src/Expr/Lexer.php`, `Parser.php`, `Node.php` | `tests/Expr/*Test.php` with fixture loading | same | [x] |
| T4.P.6 | Template parser and AST | `src/Parser/Parser.php`, `Standalone.php`, `BlockTag.php`, `src/Ast/*.php` with `toArray()` | `tests/Parser/*Test.php`, schema validation test | same | [x] |
| T4.P.7 | Functions | `src/Functions/*.php` | `tests/Functions/*Test.php` | same | [x] |
| T4.P.8 | Loader | `src/Loader/LoaderInterface.php`, `ArrayLoader.php`, `FilesystemLoader.php` | `tests/Loader/*Test.php` | same | [x] |
| T4.P.9 | Renderer | `src/Render/Engine.php`, `Context.php`, `Statements.php`, `Expressions.php` | `tests/Render/*Test.php` | same | [x] |
| T4.P.10 | CLI | `bin/template.php` | `tests/CliTest.php` | `php bin/template.php parse ...` | [x] |
| T4.P.11 | Conformance | `tests/ConformanceTest.php` | same | `make test-php`; `node tests/runner/conformance.mjs --langs ts,go,rust,php` | [x] |

### Cross-language gate (sequential after the three tracks)

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T4.X.1 | Parity run with zero divergence | `node tests/runner/parity.mjs` | [x] |
| T4.X.2 | Full gate | `make check` (docs-check, lint, four unit suites, conformance) | [x] |
| T4.X.3 | Status update | `docs/features.md`(.ko) rows for `template-go`, `template-rust`, `template-php`, `conformance` with evidence links; `CHANGELOG.md`(.ko) entry | `make docs-check` | [x] |

Exit criteria: `make check` passes on a clean checkout.

## Wave 5 — PHP extension (sequential)

Dependencies: T4.R.11, T4.P.11.

| ID | Task | Deliverables | Verification | Done |
| --- | --- | --- | --- | --- |
| T5.1 | Toolchain check | Record in `docs/operations/development.md`(.ko) whether the Rust PHP binding supports the installed PHP version (8.5); if not, mark T5.2–T5.6 `blocked` with the missing version | `php-config --version` | [x] |
| T5.2 | Extension crate | `packages/template-php-ext/Cargo.toml` (cdylib, depends on the Rust crate), `src/lib.rs` (`Polyspec\Template\Native\Engine` with `parse`, `render`, `register`), `src/convert.rs` (zval to value and back) | `cargo build --locked --release` | [x] |
| T5.3 | Stubs and package wiring | `stubs/polyspec_template.stub.php`; `packages/template-php` documents how to select the native engine explicitly | `make docs-check` | [x] |
| T5.4 | CLI and tests | `bin/template-ext.php`; `tests/ExtConformanceTest.php` run with `php -d extension=...` | `make test-ext` | [x] |
| T5.5 | Makefile targets | `ext`, `test-ext`; runner driver `php-ext` | `node tests/runner/conformance.mjs --langs php-ext` | [x] |
| T5.6 | Status update | `docs/features.md`(.ko) row `template-php-ext`; `CHANGELOG.md`(.ko) | `make docs-check` | [x] |

Exit criteria: `make ext` builds; `extension_loaded('polyspec_template')` is true; conformance passes for `php-ext`.

## Wave 6 — Benchmarks, documentation site, status (parallel)

Dependencies: T4.X.2. Tasks T6.1–T6.5 and T6.7 are `parallel`; T6.6 follows them.

| ID | Task | Deliverables | Verification | Done |
| --- | --- | --- | --- | --- |
| T6.1 | Benchmarks | `tools/bench/run.mjs`, per-language drivers, `tools/bench/fixtures/`, `tools/bench/results.md`; output equality check before timing | `make bench BENCH_ITERS=3000 BENCH_WARMUP=300` | [x] |
| T6.2 | Documentation coverage checker | `scripts/check-doc-coverage.mjs` (exported symbols documented in four packages), run by `make doc-coverage` | `make doc-coverage` | [x] |
| T6.3 | Documentation site | `docs/.vitepress/config.mts`, static GitHub Pages workflow, generated API docs excluded from git | `make docs-static-check`; `make docs-verify-idempotent` | [x] |
| T6.4 | CI workflow | `.github/workflows/ci.yml` invoking existing Makefile targets only | workflow file lint | [x] |
| T6.5 | Publication procedure | `docs/operations/publication.md`(.ko): local immutable publication of Go, npm and composer packages | `make docs-check` | [x] |
| T6.7 | Executable example site | `examples/site/` scenarios and static page; `tools/showcase/build.mjs`; AST/direct renderer parity, repeatability and same-condition mode benchmark JSON artifacts | `make showcase`; `make showcase-check` | [x] |
| T6.6 | Final status | `docs/features.md`(.ko) with test revisions; `CHANGELOG.md`(.ko) | `make check` | [x] |

T6.2 is complete. `scripts/check-doc-coverage.mjs` runs from `make doc-coverage` and `make docs-check`; the checker reports 250 documented public symbols and files (template-ts 55, template-go 58, template-php 25, template-rust 1, files 111).

T6.7 covers shared layouts, nested partials and loops, define data and scope precedence, an HTML slot and a missing definition. It follows RT-43–RT-53: every scenario uses the same JSON-shaped assign and direct path-based define registry for every implementation, and every render starts from the `layout` target. The adapter types, fields, operations and state transitions are declared in `tools/showcase/adapters/interface.json`; the generator writes language declarations and Mermaid sources, and `make contract-check` verifies the mapped implementations and failure recovery. `make showcase` compares raw output and repeated-render hashes across five implementations, compares AST and direct generated renderers, and writes HTML, JSON and same-condition mode benchmark artifacts. `make showcase-check` verifies the artifacts and static HTML page. The example has no application controller or service dependency.

T6.6 is complete. On 2026-09-11, `make check` passed; `make test-ext` built the PHP extension and passed 211 of 211 conformance cases and 236 extension tests; `make bench BENCH_ITERS=3000 BENCH_WARMUP=300` passed its output equality and repeatability checks and wrote the benchmark results. The feature status and changelog record these results.

Exit criteria: `make check`, `make bench`, `make showcase-check`, `make docs-verify-idempotent` pass.

## Wave 7 — Consumer integration (parallel, separate repositories)

Dependencies: T4.X.2. Each task is executed in the consuming application and recorded in that application's own documents.

| ID | Task | Verification | Done |
| --- | --- | --- | --- |
| T7.1 | Go application: add module dependency, embed templates with `embed.FS`, render a layout with a template definition registry | consuming application build and tests | [ ] |
| T7.2 | Browser: bundle the ESM build or precompiled AST JSON, render with the same JSON data as the server, compare with server output in a browser test | consuming application browser tests | [ ] |
| T7.3 | PHP application: composer path dependency, filesystem loader, layout rendering | consuming application tests | [ ] |

T7.3 is open. Shared template examples verify assign, define and rendering; consuming application integration must be implemented and verified in that application. The PHP application oracle and temporary Composer consumer scripts have been removed from this example repository.

## Parallelism summary

| Wave | Parallel groups | Sequential constraints |
| --- | --- | --- |
| W0 | none | T0.1 → T0.7 in order |
| W1 | T1.1–T1.10 | T1.11 after all |
| W2 | T2.1–T2.18 | none |
| W3 | {T3.2, T3.3, T3.4}, {T3.6, T3.9} with T3.5, {T3.14, T3.15, T3.16} | T3.1 → T3.5 → T3.7 → T3.10 → T3.11 → T3.12 → T3.13 |
| W4 | tracks G, R, P | inside each track: 1 → 11; T4.X after all tracks |
| W5 | none | T5.1 → T5.6 |
| W6 | T6.1–T6.5, T6.7 | T6.6 after all |
| W7 | T7.1–T7.3 | none |

## Definition of done

- Every task in W0–W6 is `done`.
- `make check` passes on a clean checkout with Node 26.8.1, Go 1.27.1, Rust 1.98.1 and PHP 8.5.
- `node tests/runner/parity.mjs` reports zero divergence across `ts`, `go`, `rust`, `php` and, when built, `php-ext`.
- `make test-browser` passes.
- `docs/features.md` and `docs/features.ko.md` carry identical status fields with evidence links for every row.
