# @polyspec/template-compiler

[English](README.md).

템플릿 소스의 build 시점 compiler다([타입 compiler](../../docs/spec/compiler.ko.md)). 요청 처리 밖에서 실행되고 runtime이 읽는 artifact를 쓴다.

| 진입점 | 용도 |
| --- | --- |
| `@polyspec/template-compiler/ast-artifact.mjs` | `compileAst({ root, output, entry, refresh, typeManifest, delimiters })`는 소스 directory를 `manifest.json`이 있는 canonical AST graph로 컴파일한다 |
| `@polyspec/template-compiler/type-manifest.mjs` | `deriveTypeManifest(templates, define)`는 parse된 템플릿의 입력 타입 manifest를 만든다 |
| `@polyspec/template-compiler/compiler.mjs` | `compileSource(graph, manifest, language, options)`는 AST graph와 타입 manifest를 TypeScript, Go, Rust, PHP 프로그램으로 컴파일한다 |
| `@polyspec/template-compiler/functions.json` | 기계 판독 가능한 함수 계약([함수](../../docs/spec/functions.ko.md)) |

```sh
node node_modules/@polyspec/template-compiler/compiler.mjs --graph compiled/ast/manifest.json --manifest types.json \
  --lang go --output generated.go --refresh true
```

parser는 같은 버전의 `@polyspec/template`이다. 각 artifact는 자신을 쓴 compiler의 digest를 기록하고, refresh는 그 digest가 바뀌면 artifact를 다시 컴파일한다.
