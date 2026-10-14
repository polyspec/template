<!-- doc-id: packages-template-compiler-readme -->
# @polyspec/template-compiler

[한국어](README.ko.md).

Build-time compiler of template sources ([typed compiler](../../docs/spec/compiler.md)). It runs outside request handling and writes artifacts that the runtimes load.

| Entry point | Use |
| --- | --- |
| `@polyspec/template-compiler/ast-artifact.mjs` | `compileAst({ root, output, entry, refresh, typeManifest, delimiters })` compiles a source directory into a canonical AST graph with its `manifest.json` |
| `@polyspec/template-compiler/type-manifest.mjs` | `deriveTypeManifest(templates, define)` derives the input type manifest of parsed templates |
| `@polyspec/template-compiler/compiler.mjs` | `compileSource(graph, manifest, language, options)` compiles an AST graph and a type manifest into a TypeScript, Go, Rust or PHP program |
| `@polyspec/template-compiler/functions.json` | the machine-readable function contract ([functions](../../docs/spec/functions.md)) |

```sh
node node_modules/@polyspec/template-compiler/dist/compiler.mjs --graph compiled/ast/manifest.json --manifest types.json \
  --lang go --output generated.go --refresh true
```

The package is written in strict TypeScript (`src/`); `make build-compiler` bundles it with tsup into `dist/`, which the entry points export with their declarations. The parser is `@polyspec/template` of the same version, and the compiler validates the documents that it reads (AST artifacts, type manifests) with ajv. Each artifact records the digest of the compiler that wrote it, and a refresh compiles it again when that digest changes.
