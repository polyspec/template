# Documentation

[한국어](/ko/operations/documentation).

## Document set

| Location | Content |
| --- | --- |
| `README.md` | Project introduction, minimal start procedure, document links |
| `AGENTS.md` | Development rules and required checks |
| `docs/spec/` | Approved contracts: rules, structures, acceptance criteria |
| `docs/features.md` | Implementation, verification and deployment per feature with evidence links |
| `docs/operations/` | Current procedures for development, conformance, browser tests, publication and documentation |
| `docs/plans/` | Proposals awaiting approval. After approval, the content moves into the specification and the proposal is removed |
| `CHANGELOG.md` | Actual changes and their verification results |

Every document has a `.ko.md` file with the same information.

## Rules

- A rule in `docs/spec/` carries an identifier such as `LEX-1`. Fixtures and tests cite the identifier.
- A document describes current behavior. A part that is specified but not implemented is marked as such in the specification and in `docs/features.md`.
- Feature rows use the values `not-started`, `in-progress`, `implemented` for implementation; `pending`, `passed`, `failed` for verification; `not-deployed`, `deployed` for deployment; and a relative link as evidence.
- Code blocks are identical in the English and the Korean file.

## Checker

```sh
node scripts/check-documents.mjs
```

The checker fails when a document has no translation pair, a relative link does not resolve, a link is absolute, code blocks differ between the two languages, or a feature row has an invalid status or no evidence link. `make docs-check` runs the checker.

## Source comments

A symbol of the public entry surface of a package carries a documentation comment. The public entry surface is what a consumer reaches through the documented entry points:

| Package | Public entry surface |
| --- | --- |
| `template-ts` | The symbols re-exported from `src/index.ts`, `src/render.ts` and `src/node/index.ts`, and the public members of the classes among them |
| `template-go` | The exported identifiers of the module root package, the subpackage types that its declarations name, and the exported methods of those types |
| `template-php` | The classes of the API table of the package README and their public methods |
| `template-rust` | Every public item, which the crate attribute `#![deny(missing_docs)]` makes the compiler check |

A symbol that a package exports only so that another file of the same package can use it is internal and carries no documentation comment. Every source file starts with a comment naming what the file implements; a Go package carries that comment on one of its files.

A comment says what the symbol is for in its own words. Where a specification rule defines the behavior, the comment names the rule, such as `AST-3`, instead of restating it.

```sh
node scripts/check-doc-coverage.mjs
```

The checker reports one line per undocumented symbol or file and fails. `make docs-check` runs it.
