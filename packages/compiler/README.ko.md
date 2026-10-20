<!-- doc-id: packages-template-compiler-readme -->
<!-- source-sha256: 1db5b5329bbcaf03f9fe173bb7c6552654e02ff42ea522ce5cb227ac4ec16473 -->
# @polyspec/template-compiler

[English](README.md).

템플릿 소스의 build 시점 compiler다([타입 compiler](../../docs/spec/compiler.ko.md)). 요청 처리 밖에서 실행되고 runtime이 읽는 artifact를 쓴다.

| 진입점 | 용도 |
| --- | --- |
| `@polyspec/template-compiler/ast-artifact.mjs` | `compileAst({ root, output, entry, refresh, typeManifest, delimiters })`는 소스 directory를 `manifest.json`이 있는 canonical AST graph로 컴파일한다 |
| `@polyspec/template-compiler/type-manifest.mjs` | `deriveTypeManifest(templates, define)`는 parse된 템플릿의 입력 타입 manifest를 만든다 |
| `@polyspec/template-compiler/compiler.mjs` | `compileSource(graph, manifest, language, options)`는 AST graph와 타입 manifest를 대상 언어의 프로그램으로 컴파일한다 |
| `@polyspec/template-compiler/functions.json` | 기계 판독 가능한 함수 계약([함수](../../docs/spec/functions.ko.md)) |

```sh
node node_modules/@polyspec/template-compiler/dist/compiler.mjs --graph compiled/ast/manifest.json --manifest types.json \
  --lang go --output generated.go --refresh true
```

package는 strict TypeScript(`src/`)로 쓰였고, `make template-build-compiler`가 tsup으로 이를 `dist/`에 bundle하며 진입점은 declaration과 함께 이를 export한다. parser는 같은 버전의 `@polyspec/template`이고, compiler는 읽는 문서(AST artifact, 타입 manifest)를 ajv로 검증한다. 각 artifact는 자신을 쓴 compiler의 digest를 기록하고, refresh는 그 digest가 바뀌면 artifact를 다시 컴파일한다.
