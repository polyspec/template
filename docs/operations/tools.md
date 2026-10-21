<!-- doc-id: docs-operations-tools -->
# Repository tools

[한국어](/ko/operations/tools).

These rules of the showcase contract were moved out of the specification because they bind the repository's showcase
adapters and tools, not the template language. Every implementation of the template language does not need them.

- The shared render request maps to each language's native API without change: a native map, object or JSON value is an
  adapter representation, so the field names, nesting and value types of the request stay as they are.
- An adapter may decode the shared JSON and construct the native API values, but it must not add controller data, rename
  fields, apply filters or otherwise reshape the request.

## Rules of the repository tools

The rules below bind the build compiler, the browser package and the showcase tooling. Each one moved out of the specification because it describes a single implementation or a repository tool. A rule that every implementation shares stays in the specification.

The TypeScript package renders in a browser with a map loader that holds the template sources or their parsed ASTs.

A server that renders a page for later rendering in the browser embeds the assign data as `<script type="application/json">` whose content is produced by `{= json(assign) | raw}`. The browser parses that JSON with the parser of the package, as defined in the data model document, and renders the same template name with the same assign data, define map and env to produce the same output.

A scenario stores template sources as root-relative UTF-8 `*.tpl` names, `assign` in `data.json`, definitions in `define.json`, and the optional environment in `env.json`. The scenario target is passed separately as `target`.

The cross-language fixture form represents a template definition directly as a string path. An object with `template: string` and optional `data: object`, or an object with `html: string`, is reserved for definitions that need those extra values.

A successful parity check compares the complete UTF-8 output bytes and then renders the same request again to compare the repeated bytes.

The manifest is the design source for `Adapter`, `Scenario`, `RenderRequest`, `DefineEntry`, `Environment` and `RepeatResult`. Its record fields and union variants keep their declared order; ownership and `from` links describe which values are transferred from `Scenario` into `RenderRequest`.

[The contract generator](../../scripts/generate-showcase-contract.mts) produces the TypeScript, JavaScript, Go and Rust declarations, the PHP declarations and the Mermaid sources. A generated file that differs from the manifest fails the contract gate.

Language syntax may follow local conventions (`NewAdapter`, `Adapter::new` and `__construct` are constructor names), while the concrete type, constructor parameter, method order, argument types, return types and request fields remain the same through the manifest mappings.

[The contract checker](../../scripts/check-showcase-contract.mts) checks source declarations, TypeScript compilation, Go interface assignment and formatting, Rust trait compilation, PHP syntax and `ReflectionClass`, generated runtime assertions, and all five adapters on every showcase scenario.

The state proof performs `constructor -> loadScenario -> buildRequest -> renderTwice`, observes an invalid-target error, renders the original request again, and compares first, second and recovered UTF-8 hashes. The request remains unchanged across the failure and recovery path.

The interface manifest declares one compiler with two peer modes. `ast` returns an `AstArtifact`; `gen` returns host-language source and an artifact manifest. Both produce a `Program` with the same prepared render contract.

An artifact manifest contains its contract format, mode, target language, entry, source digest, type digest, contract digest and output paths. The artifact is generated before service startup and is loaded or statically linked once into the process. A repository builds its artifacts with its build and does not track them: the manifest records the digests, and the build reuses an artifact whose digests match (RT-71).

Artifact refresh is a build policy. `dev` regenerates on every compiler invocation, `true` regenerates when a source, type or contract digest changes, and `false` reads no source and uses only the deployed artifact. A development watcher rebuilds and restarts statically linked Go and Rust processes after regeneration.

Compilation mode is `ast` or `gen`. `ast` produces an AST artifact interpreted by the AST renderer. `gen` produces host-language renderer code called directly. The generated renderer receives the same normalized request (`target`, `assign` and `define` after host binding, and resolved `env`) as the AST renderer. The mode does not select the artifact refresh policy.

Artifact refresh is `dev`, `true` or `false`. Build coordination regenerates on every compiler invocation in `dev`, after a digest change in `true`, and never reads source under `false`. Missing, stale or corrupt deployed artifacts under `false` are errors.

A typed generated artifact declares its assign, presence-preserving definition data, definitions and template inputs. A generated block calls its target template function directly after applying root assign, supplied definition data fields and block scope in that order. A pre-rendered string slot is not a generated template target.

The build compiler accepts `--refresh dev|true|false`. `dev` always writes, `true` reuses artifacts whose source, type and contract digests match, and `false` never reads or parses source and never writes an artifact.
