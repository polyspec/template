# Compiler contract

[한국어](compiler.ko.md).

The compiler owns template parsing, validation, lowering and artifact emission. Runtime packages execute an already compiled program. They do not parse source or invoke a host compiler in a render request.

The single compiler and runtime contract source is [`tools/compiler/interface.json`](../../tools/compiler/interface.json). Generated declarations and Mermaid diagrams must match that manifest. TypeScript, Go, Rust and PHP mappings may change spelling and error transport; they may not change ownership, field order, operation placement or state transitions.

## Pipeline

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-architecture.mmd-->
```

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-classes.mmd-->
```

One source graph and one explicit type manifest are lowered to one typed program. `ast` emits a language-neutral canonical AST artifact. `gen` sends the same typed program to the selected TypeScript, Go, Rust or PHP backend. JavaScript ESM is a delivery artifact produced from the TypeScript backend, not a separate semantic implementation.

The compile request carries the initial delimiter pair. The canonical artifact manifest records that value, and the source digest binds it together with every template byte. Changing only the delimiter pair therefore invalidates the AST and every generated artifact derived from it.

The source compiler starts from `.tpl` files and follows every static include and block path. A referenced template may use any filename extension; once discovered, its bytes, AST and line index become part of the same source graph. Dynamic conformance manifests derive the free inputs of included templates and propagate them through nested include edges so caller locals are bound explicitly.

The canonical artifact manifest stores every template's source-line start byte offsets with its digest entry. Generated programs combine this line index with preserved node and expression spans to report the original line and column without reading template source at runtime.

Each backend is a separate `LanguageBackend` implementation. A backend emits declarations and direct template control flow through a structured code writer. It does not contain scenario names, fixed request data, expected output or an interpreter for serialized AST nodes.

## Public structures

`TypeManifest.root` is either `Assign` or `any`. `Assign` declares fixed root fields. `any` declares a map-shaped dynamic root whose unknown members have type `any?`; it is used when the input contract is intentionally dynamic. Record fields, definition targets, template inputs and host-function signatures remain explicit in both forms. Types are never inferred from one request value. An `any` field or parameter uses the runtime value model without creating another execution mode, and it does not disable field checks when the root is `Assign`.

The typed IR resolves every symbol, template path, definition target, function signature and input type. It preserves the source span on every node and expression so generated runtime failures point to the original template. A missing variable, unknown statically typed member, undeclared definition, invalid include path, unknown function implementation kind or incompatible block input fails compilation. Explicit dynamic `any` member, index, spread and loop operations remain in the IR and use `RuntimeBindings`. Built-in and host signatures use the same call node and preserve their implementation kind for program loading.

Dynamic source graphs use a generated type manifest derived from parsed templates and the request definition schema. It declares referenced functions, definition targets and block inputs while keeping root values as `any`; it does not infer static host types from sample JSON. The conformance gate checks this derivation for every parseable fixture before compiling host-language artifacts.

Every generated module exposes the logical structures `Assign`, `DefinitionData<T>`, `Definition<T>`, `Definitions`, `Input<T>`, `ArtifactManifest` and `GeneratedProgram`. A generated program implements the same `Program.prepare(RenderRequest)` and `Program.render(RenderRequest)` operations as an AST program. Template-specific functions are private and invoke each other directly for include and block targets.

All four generated backends pass the runtime `RenderScope` to generated template functions. An include passes the same scope so assignments remain visible to its caller. A block creates a fresh scope and seeds it only from root data, definition data and explicit block arguments. Loop bindings are installed temporarily and restored after the loop. Each generated loop materializes its entries and computes the size and final index once before iteration; each iteration installs the current index, key, value, first and last metadata in the scope. Root-only block fallback is represented separately in the IR from a normal scope-aware dynamic lookup. The generated support level remains partial until the four-language matrix passes.

`RuntimeServices` is the common runtime interface used by both program modes. The concrete `RuntimeEnvironment` owns resource limits and the host-function registry, validates registrations once, and implements that interface. Each `AstProgram` and `GeneratedProgram` owns one environment. AST-only template loading belongs to the AST renderer and is not part of the environment or generated execution state. `RuntimeBindings` consumes `RuntimeServices`, so generated code uses the same value and error semantics without depending on an AST loader or interpreter.

Generated expressions use the target runtime's `RuntimeBindings` for unary and eager binary operations, truthiness, string conversion, escaping, numeric conversion, finite-result validation, equality, ordering, lookup, iteration entries, functions, limits and errors. AST evaluators use the same unary and binary operations; evaluators and generated control flow retain only the lazy branch selection required by `&&`, `||` and `??`. The declaration is extracted and checked against the compiler manifest. A backend may emit a native operation only when the typed operands make that operation exactly equivalent to the data-model rules.

The TypeScript backend passes its bound root, source-indexed frame, render context and runtime bindings into direct template functions. Those functions write to the context output builder, so generated execution uses the same UTF-8 output limit and positioned error as AST execution. Includes and blocks call generated template functions directly while entering and leaving the shared render chain.

The PHP backend follows the same execution boundary. Its generated template functions receive `Context`, `Frame`, `RuntimeBindings` and the bound root map, write through the context output limiter, and delegate value operations and function calls to the package runtime. Typed maps remain `MapValue` instances so generated lookup, truthiness, ordering and spread preserve the data model instead of inheriting PHP array key conversion.

The Go backend emits typed template control flow while routing observable value operations through `render.RuntimeBindings`. Generated functions share `render.Context`, source-indexed frames and the render chain. Internal error propagation preserves the original structured template error, including its code and source position, and native typed values are bound to the canonical value model at the runtime boundary.

The Rust backend likewise returns `Result` directly from generated template functions and delegates value operations to `RuntimeBindings`. It reconstructs `LineIndex` from verified artifact data, writes through `RenderContext`, and propagates structured errors without panic conversion. Serialization at the typed boundary converts generated records and collections to and from the canonical `Value` model.

A Rust generated source module directly depends on `polyspec-template`, `serde` with its `derive` feature and `serde_json` with `preserve_order` and `arbitrary_precision`. These are compile-time dependencies of the generated module and must be declared by its host crate. The isolated Cargo consumer compiles the generated module against an extracted `.crate` package to enforce this boundary.

Built-ins are known to the compiler. A referenced host function requires a manifest signature and a runtime implementation. Missing signatures fail before emission. Missing runtime implementations, arity errors and host failures use the same error fields as AST execution.

## Artifact refresh

Compilation mode and artifact refresh are independent build settings.

- `dev` parses, validates and emits on every compiler invocation. A development watcher rebuilds and restarts a statically linked Go or Rust process.
- `true` computes source, type, contract and compiler-implementation digests and emits only when a digest changed.
- `false` reads no template source and emits nothing. It validates and uses the deployed artifact.

Generated files are completed in a temporary location and replaced atomically. An artifact manifest records its mode, target, entry, source digest, type digest, contract digest, compiler digest and files. The compiler digest covers the parser/compiler modules that produced that target, so a compiler implementation change invalidates an otherwise unchanged artifact. A missing, corrupt or incompatible artifact fails before runtime startup.

## Implementation status

The AST compiler and runtimes are implemented. The product compiler emits concrete `GeneratedProgram` implementations for TypeScript, Go, Rust and PHP, and the showcase executes those artifacts directly. All four generated programs pass the complete 211-case conformance suite. Together with the four AST implementations, `make conformance-all-modes` verifies all 1,688 core mode-language-case cells without generated-to-AST fallback.

Generated artifacts use the same refresh boundary as canonical AST artifacts. `dev` always emits a fresh source file and manifest, `true` verifies source, type, contract and compiler digests before deciding whether to rebuild, and `false` reads and verifies only the deployed generated source and its manifest. Source and manifest replacements are atomic, with the manifest committed last.

`make conformance-generated-ts` builds a fresh generated TypeScript program for every one of the 211 canonical cases. It compares compile diagnostics, input-binding diagnostics, runtime diagnostics and successful UTF-8 output with the same expected artifacts used by AST execution.
`make conformance-generated-php` performs the same proof with a separately generated and syntax-checked PHP source file for every case.

Both program modes use the same execution-state split. `RenderFrame` owns only `name`, `lines` and `context`; it cannot retain an AST. `RenderScope` owns `locals` and `loops`, exposes `lookup` and `loopMeta`, is shared by includes and is replaced for each block render. The interface gate checks these fields and operations in all four languages.

The same gate checks the concrete `RuntimeEnvironment` field order, operation ownership and parameter counts through the TypeScript compiler API, Go AST, Rust syntax tree and PHP Reflection. It also verifies that the AST program owns the environment instead of duplicating limits or host-function state.
