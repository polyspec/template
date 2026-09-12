# 발행

[English](/operations/publication).

발행된 패키지는 없다. 이 절차는 소비 애플리케이션이 로컬 체크아웃의 패키지를 사용하는 방법을 설명한다. 레지스트리 발행은 실제로 이루어질 때 `docs/features.md`에 기록한다.

## 로컬 소비

Go 애플리케이션:

```
require github.com/polyspec/template v0.0.1
replace github.com/polyspec/template => ../template/packages/template-go
```

Node 애플리케이션:

```json
{ "dependencies": { "@polyspec/template": "file:../template/packages/template-ts" } }
```

PHP 애플리케이션:

```json
{
  "repositories": [{ "type": "path", "url": "../template/packages/template-php" }],
  "require": { "polyspec/template": "@dev" }
}
```

Rust 애플리케이션:

```toml
[dependencies]
polyspec-template = { path = "../template/packages/template-rust" }
```

## 버전

모든 패키지는 버전 `0.0.1`을 선언한다. 버전은 모든 패키지와 `CHANGELOG.md`에서 함께 바뀐다.

## 문서 사이트

온라인 문서는 정적 VitePress 사이트다. `main`의 모든 필수 CI job이 통과하면 `pages` job이 `make docs-static-check`로 `docs/.vitepress/dist`를 생성하고, 이미 생성된 showcase HTML과 커밋된 AST artifact를 `examples/site/`에 복사해 Pages artifact로 배포한다. release job이 문서와 showcase를 이미 검증하므로 발행 단계는 그 게이트를 반복하지 않는다. showcase는 parser나 renderer를 브라우저에 배포하지 않는다. 빌드는 저장소 경로에서 링크와 asset이 동작하도록 `VITEPRESS_BASE`를 전달하며 서버 측 애플리케이션은 사용하지 않는다.

문서 빌드는 모든 `*.ko.md` 번역 쌍을 찾아 `/ko/` 아래에 발행한다. VitePress locale 설정이 이 경로 트리 전체에 한국어 탐색 메뉴와 `ko-KR` HTML 메타데이터를 제공한다. 정적 사이트 게이트는 suffix 형태의 출력 경로, 현재 locale을 벗어나는 탐색 링크, 잘못된 HTML 언어 메타데이터, 해석되지 않은 테마 보간을 거부한다.

게시 artifact를 로컬에서 재현하려면 다음을 실행한다.

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
