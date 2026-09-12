# 발행

[English](publication.md).

발행된 패키지는 없다. 각 패키지는 로컬 체크아웃에서 다음과 같이 설치한다. 레지스트리 발행은 실제로 이루어질 때 `docs/features.md`에 기록한다.

## 로컬 설치

Go module:

```
require github.com/polyspec/template v0.0.1
replace github.com/polyspec/template => ../template/packages/template-go
```

npm package:

```json
{ "dependencies": { "@polyspec/template": "file:../template/packages/template-ts" } }
```

Composer package:

```json
{
  "repositories": [{ "type": "path", "url": "../template/packages/template-php" }],
  "require": { "polyspec/template": "@dev" }
}
```

Cargo crate:

```toml
[dependencies]
polyspec-template = { path = "../template/packages/template-rust" }
```

## 버전

모든 패키지는 버전 `0.0.1`을 선언한다. 버전은 모든 패키지와 `CHANGELOG.md`에서 함께 바뀐다.

## 문서 사이트

온라인 문서는 정적 VitePress 사이트다. GitHub Pages workflow가 `make docs-check`와 `make showcase-check`를 실행하고 `make docs-static-check`로 `docs/.vitepress/dist`를 생성한 뒤, 이미 생성된 showcase HTML과 커밋된 AST artifact를 `examples/site/`에 복사해 Pages artifact로 배포한다. showcase는 parser나 renderer를 브라우저에 배포하지 않는다. 저장소 경로에서 링크와 asset이 동작하도록 `VITEPRESS_BASE`를 전달하며 서버 측 program은 사용하지 않는다.

게시 artifact를 로컬에서 재현하려면 다음을 실행한다.

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
