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

Each backend is a separate `LanguageBackend` implementation. A backend emits declarations and direct template control flow through a structured code writer. It does not contain scenario names, fixed request data, expected output or an interpreter for serialized AST nodes.

## Public structures

`TypeManifest` declares assign fields, record fields, definition targets, template inputs and host-function signatures. Types are never inferred from one request value. An explicit `any` declaration uses the runtime value model without creating another execution mode.

The typed IR resolves every symbol, template path, definition target, function signature and input type. It preserves the source span on every node and expression so generated runtime failures point to the original template. A missing variable, unknown statically typed member, undeclared definition, invalid include path, unknown function implementation kind or incompatible block input fails compilation. Explicit dynamic `any` member, index, spread and loop operations remain in the IR and use `RuntimeBindings`. Built-in and host signatures use the same call node and preserve their implementation kind for program loading.

Every generated module exposes the logical structures `Assign`, `DefinitionData<T>`, `Definition<T>`, `Definitions`, `Input<T>`, `ArtifactManifest` and `GeneratedProgram`. A generated program implements the same `Program.prepare(RenderRequest)` and `Program.render(RenderRequest)` operations as an AST program. Template-specific functions are private and invoke each other directly for include and block targets.

`RuntimeServices` is the common runtime boundary owned by both program modes. It exposes resource limits and host-function lookup. AST-only template loading belongs to the AST renderer and is not part of generated execution state. `RuntimeBindings` consumes `RuntimeServices`, so generated code uses the same value and error semantics without depending on an AST loader or interpreter.

Generated expressions use the target runtime's `RuntimeBindings` for truthiness, string conversion, escaping, numeric conversion, finite-result validation, equality, ordering, lookup, iteration entries, functions, limits and errors. The AST evaluator and statement renderer already use this boundary in all four runtimes. Its declaration is extracted and checked against the compiler manifest. A backend may emit a native operation only when the typed operands make that operation exactly equivalent to the data-model rules.

Built-ins are known to the compiler. A referenced host function requires a manifest signature and a runtime implementation. Missing signatures fail before emission. Missing runtime implementations, arity errors and host failures use the same error fields as AST execution.

## Artifact refresh

Compilation mode and artifact refresh are independent build settings.

- `dev` parses, validates and emits on every compiler invocation. A development watcher rebuilds and restarts a statically linked Go or Rust process.
- `true` computes source, type and contract digests and emits only when a digest changed.
- `false` reads no template source and emits nothing. It validates and uses the deployed artifact.

Generated files are completed in a temporary location and replaced atomically. An artifact manifest records its mode, target, entry, source digest, type digest, contract digest and files. A missing, corrupt or incompatible artifact fails before runtime startup.

## Implementation status

The AST compiler and runtimes are implemented. Generated execution is partial: it is currently verified by five showcase scenarios, accepts only the `default` built-in in the typed compiler and uses a separate showcase generator. These paths do not satisfy this contract and are removed as the generated compiler is completed.

Generated artifacts use the same refresh boundary as canonical AST artifacts. `dev` always emits a fresh source file and manifest, `true` verifies source, type and contract digests before deciding whether to rebuild, and `false` reads and verifies only the deployed generated source and its manifest. Source and manifest replacements are atomic, with the manifest committed last.

Both program modes use the same execution-state split. `RenderFrame` owns only `name`, `lines` and `context`; it cannot retain an AST. `RenderScope` owns `locals` and `loops`, exposes `lookup` and `loopMeta`, is shared by includes and is replaced for each block render. The interface gate checks these fields and operations in all four languages.
