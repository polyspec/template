# Typed compiler contract

The compiler has one shared structure before its output branches by host language. A source graph contains canonical template ASTs. The type manifest fixes assign fields, records, callable functions, definition targets and template inputs. `lowerSourceGraph` resolves names, paths, scopes and types into a `TypedProgram`; each language backend only expresses that program in its host syntax.

The contract source is [`tools/compiler/interface.json`](../../tools/compiler/interface.json). `make compiler-interface-check` rejects a missing or private generated API, a stale diagram and any generated module that restores the pre-rendered string-slot path.

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-architecture.mmd-->
```

Generated modules expose the same logical components. Language spelling differs only through the manifest mapping: `renderTemplate` becomes `RenderTemplate` in Go and `render_template` in Rust and PHP.

```mermaid
<!--@include: ../../tools/compiler/generated/compiler-classes.mmd-->
```

`Definition<T>.data` has the fixed `Input<T>` shape of its declared target. A generated block creates that input in the order `assign`, `definition.data`, `block scope`, then calls the generated child template function directly. `Definition<T>.html` is the explicit branch that returns already trusted HTML. It does not masquerade as a compiled template.

The generator emits source text because host compilers consume source text. This is a normal compiler backend boundary. Correctness depends on every emitted declaration and statement coming from the typed program. Scenario names, fixed fields and pre-rendered output are not backend inputs.
