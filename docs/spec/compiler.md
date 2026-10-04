# Compiler contract

[한국어](/ko/spec/compiler).

The compiler owns template parsing, validation, lowering and artifact emission. Runtime packages execute an already compiled program. They do not parse source or invoke a host compiler in a render request.

The single compiler and runtime contract source is [`tools/compiler/interface.json`](../../tools/compiler/interface.json). Generated declarations and Mermaid diagrams must match that manifest. TypeScript, Go, Rust and PHP mappings may change spelling and error transport; they may not change ownership, field order, operation placement or state transitions.

The manifest's `evidence` section is the machine-readable reading map for this contract. It links the specification order, conformance fixtures, executable examples, generated artifacts and required verification commands. A checker rejects missing links so a reader can follow the contract to executable proof without relying on a duplicated summary.

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

A local variable has the type of its last assignment in straight-line code. A local that a branch or a loop body assigns with a value of another type takes the merged type of all these assignments, before the loop body and after the branch or the loop, because a loop body reads the value that the previous iteration assigned and code after a branch reads the value of the branch that ran. Two different types merge to `any`.

Dynamic source graphs use a generated type manifest derived from parsed templates and the request definition schema. It declares referenced functions, definition targets and block inputs while keeping root values as `any`; it does not infer static host types from sample JSON. The conformance gate checks this derivation for every parseable fixture before compiling host-language artifacts.

The derived manifest copies each known built-in's declared `minArgs` and `maxArgs`. Dynamic conformance sources retain arity checking at runtime so an invalid call produces the same positioned `E_RUNTIME_ARITY` as AST execution; an explicit static manifest may reject that call during lowering. An unknown function remains an open-arity call and reaches the runtime registry, where the missing implementation produces the normal runtime error.

Every generated module exposes the logical structures `Assign`, `DefinitionData<T>`, `Definition<T>`, `Definitions`, `Input<T>`, `ArtifactManifest` and `GeneratedProgram`. A generated program implements the same `Program.prepare(RenderRequest)` and `Program.render(RenderRequest)` operations as an AST program. Template-specific functions are private and invoke each other directly for include and block targets.

All four generated backends pass the runtime `RenderScope` to generated template functions. An include passes the same scope so assignments remain visible to its caller. A block creates a fresh scope and seeds it only from root data, definition data and explicit block arguments. Loop bindings are installed temporarily and restored after the loop. Each generated loop materializes its entries and computes the size and final index once before iteration; each iteration installs the current index, key, value, first and last metadata in the scope. Root-only block fallback is represented separately in the IR from a normal scope-aware dynamic lookup. The generated support level is complete for the four core languages and all 248 canonical cases.

`RuntimeServices` is the common runtime interface used by both program modes. The concrete `RuntimeEnvironment` owns resource limits, registered functions and logical class functions, validates registrations once, and implements that interface. Each `AstProgram` and `GeneratedProgram` owns one environment. AST-only template loading belongs to the AST renderer and is not part of the environment or generated execution state. `RuntimeBindings` consumes `RuntimeServices`, so generated code uses the same value and error semantics without depending on an AST loader or interpreter.

Generated expressions use the target runtime's `RuntimeBindings` for unary and eager binary operations, truthiness, string conversion, escaping, numeric conversion, finite-result validation, equality, ordering, lookup, iteration entries, functions, limits and errors. AST evaluators use the same unary and binary operations; evaluators and generated control flow retain only the lazy branch selection required by `&&`, `||` and `??`. The declaration is extracted and checked against the compiler manifest. A backend may emit a native operation only when the typed operands make that operation exactly equivalent to the data-model rules.

The TypeScript backend passes its bound root, source-indexed frame, render context and runtime bindings into direct template functions. Those functions write to the context output builder, so generated execution uses the same UTF-8 output limit and positioned error as AST execution. Includes and blocks call generated template functions directly while entering and leaving the shared render chain.

The PHP backend follows the same execution boundary. Its generated template functions receive `Context`, `Frame`, `RuntimeBindings` and the bound root map, write through the context output limiter, and delegate value operations and function calls to the package runtime. Typed maps remain `MapValue` instances so generated lookup, truthiness, ordering and spread preserve the data model instead of inheriting PHP array key conversion.

The PHP backend requires a namespace that the caller of the compiler chooses: the `phpNamespace` option of `compileSource`, or the `--php-namespace` option of the compiler command. A namespace is one or more PHP identifiers separated by `\`. Compiling to PHP without a valid namespace fails before any source is emitted. The generated file declares every class, function and constant inside that namespace and refers to the runtime package by fully qualified names. A class that the program instantiates from its embedded binding schema is resolved in the same namespace. Two generated programs with different namespaces therefore load and render in one PHP process, and neither declares a global name that can collide with a class outside the generated file.

Every backend writes each string of the program, including template text, string literals, template names, paths and messages, as an exact string literal of the target language, so the generated program writes the same bytes as the AST program for every valid UTF-8 text. This includes control characters and characters that a target language interprets inside a string literal, such as `$` in a double-quoted PHP string. The PHP backend writes single-quoted literals in which only `\` and `'` are escaped, and writes a line break as the double-quoted literal `"\n"` or `"\r"` joined with `.`, so that no literal spans two lines of the generated source. The Rust backend escapes `\` and `"` and writes every control character as `\u{…}`. The Go backend escapes `\` and `"` and writes every control character as `\u00XX`. The TypeScript backend writes JSON string literals, which are exact JavaScript string literals.

The Go backend emits typed template control flow while routing observable value operations through `render.RuntimeBindings`. Generated functions share `render.Context`, source-indexed frames and the render chain. Internal error propagation preserves the original structured template error, including its code and source position, and native typed values are bound to the canonical value model at the runtime boundary.

The Rust backend likewise returns `Result` directly from generated template functions and delegates value operations to `RuntimeBindings`. It reconstructs `LineIndex` from verified artifact data, writes through `RenderContext`, and propagates structured errors as values, never as panics. A panic is caught only at the public `prepare` and `render` operations and reported as `E_INTERNAL` (ERR-13). Serialization at the typed boundary converts generated records and collections to and from the canonical `Value` model.

A Rust generated source module directly depends on `polyspec-template`, `serde` with its `derive` feature and `serde_json` with `preserve_order` and `arbitrary_precision`. These are compile-time dependencies of the generated module and must be declared by its host crate. The isolated Cargo install project compiles the generated module against an extracted `.crate` package to enforce this boundary.

A typed value that holds a record reaches every runtime operation as a canonical value: a function, class function or method argument, an operand of an operator other than `&&`, `||` and `??`, and the expression of an echo. A record becomes a map of its declared fields in declaration order, and a list or map of records becomes a list or map of such maps, at every depth, so a host function receives the form of VAL-21 and an operator applies EXP-34 in every backend. Typed member access and loops keep the typed record. Reason: the AST program passes maps for the same data; the Go backend passed a record as a native object, and in the TypeScript and PHP backends a render that passed a record to a function failed with `E_INTERNAL`. `make generated-native-check` compiles `tests/fixtures/typed-values` with a typed manifest in every backend and compares the output with the AST program.

Built-ins are known to the compiler. A referenced host function requires a manifest signature and a runtime implementation. Missing signatures fail before emission. Missing runtime implementations, arity errors and host failures use the same error fields as AST execution.

## Artifact refresh

Compilation mode and artifact refresh are independent build settings.

- `dev` parses, validates and emits on every compiler invocation. A development watcher rebuilds and restarts a statically linked Go or Rust process.
- `true` computes source, type, contract and compiler-implementation digests and emits only when a digest changed.
- `false` reads no template source and emits nothing. It validates and uses the deployed artifact.

Generated files are completed in a temporary location and replaced atomically. An artifact manifest records its mode, target, entry, source digest, type digest, contract digest, compiler digest and files. The compiler digest covers the parser/compiler modules that produced that target, so a compiler implementation change invalidates an otherwise unchanged artifact. A missing, corrupt or incompatible artifact fails before runtime startup.

## Implementation status

The AST compiler and runtimes are implemented. The product compiler emits concrete `GeneratedProgram` implementations for TypeScript, Go, Rust and PHP, and the showcase executes those artifacts directly. The generated backends emit native object and class-call operations. The complete 248-case generated matrix passes in TypeScript, Go, Rust and PHP, and a separate generated native-call fixture renders the same assigned object field, instance method and class function in all four languages, with the same host arguments (VAL-21) and native object equality (EXP-39) as the AST programs.

Generated artifacts use the same refresh boundary as canonical AST artifacts. `dev` always emits a fresh source file and manifest, `true` verifies source, type, contract and compiler digests before deciding whether to rebuild, and `false` reads and verifies only the deployed generated source and its manifest. Source and manifest replacements are atomic, with the manifest committed last.

`make conformance-generated-ts` builds a fresh generated TypeScript program for every canonical case. It compares compile diagnostics, input-binding diagnostics, runtime diagnostics and successful UTF-8 output with the same expected artifacts used by AST execution.
`make conformance-generated-php` performs the same proof with a separately generated and syntax-checked PHP source file for every case.
`make generated-native-check` compiles one dynamic-root program through every backend and executes a native object assignment, public field read, instance method call and registered class function call. The same matrix checks missing public members, missing registered class functions, native method and class-function failures, wrong native argument types and wrong native argument counts. Every backend must return the same error code at the same call span. The same object must reach an included template, a block argument and template definition data as the original host object (VAL-18). The PHP backend is compiled twice, with two namespaces, and both programs load and render in one PHP process next to global classes named `GeneratedProgram` and `Assign`; compiling to PHP without a valid namespace must fail.

Both program modes use the same execution-state split. `RenderFrame` owns only `name`, `lines` and `context`; it cannot retain an AST. `RenderScope` owns `locals` and `loops`, exposes `lookup` and `loopMeta`, is shared by includes and is replaced for each block render. The interface gate checks these fields and operations in all four languages.

The same gate checks the concrete `RuntimeEnvironment` field order, operation ownership and parameter counts through the TypeScript compiler API, Go AST, Rust syntax tree and PHP Reflection. It also verifies that the AST program owns the environment instead of duplicating limits or host-function state.
