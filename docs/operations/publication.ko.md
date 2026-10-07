# 발행

[English](/operations/publication).

레지스트리에 발행된 패키지는 없다. 각 패키지는 로컬 체크아웃에서 다음과 같이 설치한다. 레지스트리 발행은 실제로 이루어질 때 `docs/features.md`에 기록한다.

## 로컬 설치

Go module:

```
require github.com/polyspec/template/packages/template-go v0.0.2
replace github.com/polyspec/template/packages/template-go => ../template/packages/template-go
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

모든 패키지는 버전 `0.0.2`를 선언한다. 버전은 모든 패키지와 `CHANGELOG.md`에서 함께 바뀌며, 릴리스된 버전 위의 section `## Unreleased`가 마지막 릴리스 뒤의 모든 변경 항목을 담는다.

## Tag 릴리스

릴리스는 `main`의 commit에 붙인 tag다(AGENTS, T22.1-4). `vX.Y.Z`는 npm 패키지 `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror`, Composer 패키지 `polyspec/template`, `polyspec/template-php-ext`를 버전 X.Y.Z로 릴리스하고, `packages/template-go/vX.Y.Z`는 Go module `github.com/polyspec/template/packages/template-go`를 릴리스한다. Cargo 패키지 `polyspec-template`는 버전 X.Y.Z를 담지만 archive로 릴리스하지 않고 git tag로 사용한다. `cargo package`는 git 의존성을 해석되지 않는 crates.io 요구로 바꾸기 때문이다(T22.1-5). tag의 push는 `ci.yml`의 job `release`가 아닌 `.github/workflows/release.yml`(`on: push: tags: ['v*', '**/v*']`, 권한 `contents: write`. tag filter에서 `*`는 `/`와 맞지 않으므로 `**/v*`가 어느 깊이의 Go module tag든 포함한다)을 실행한다. `make install` 뒤에 그 step은 다음 순서로 `scripts/release.mjs`를 실행하고 첫 실패에서 멈춘다.

```sh
make release-verify
make release-versions
make release-assets
make release-publish
```

1. `make release-verify`는 tag된 commit이 `origin/main`의 조상이고(`git merge-base --is-ancestor`), 그 commit의 최신 check run `push-gate`와 `ci-passed`(`gh api repos/<repository>/commits/<sha>/check-runs`)가 결론 `success`로 완료되었는지 확인한다. 없거나 실패한 check의 이름을 적으며 test를 다시 실행하지 않는다.
2. `make release-versions`는 `MANIFESTS`의 모든 manifest에 X.Y.Z가 있고(`version` field가 없는 `composer.json`은 Composer처럼 버전을 tag에서 받는다) `CHANGELOG.md`에 section `## X.Y.Z`가 있는지 확인하며, 다른 파일마다 그 버전과 tag의 버전을 적는다. `packages/template-go/vX.Y.Z`에는 `packages/template-go/go.mod`의 module 경로와 section을 확인한다.
3. `make release-assets`는 npm 패키지를 build하고 `var/release/assets`를 쓴다. 각 npm 패키지의 `npm pack`(`.tgz`), tag된 commit의 각 Composer 패키지 directory의 `git archive`(`.zip`)이다. 릴리스 asset은 npm tarball과 Composer zip뿐이다. archive 이름은 `<package name>-<version>.<ext>`이고 `@scope/`와 `vendor/`는 `scope-`와 `vendor-`로 쓴다. Go tag는 아무것도 만들거나 첨부하지 않는다. `release-assets`는 `/`가 없는 tag에서만 npm 패키지를 build한다.
4. `make release-publish`는 archive와 함께 `gh release create <tag> --verify-tag --title <tag> --notes-file <section X.Y.Z>`를 실행한다.

tag는 환경 변수 `TAG`로 step에 전달된다. `tests/scripts/release.test.mjs`는 `gh`, `npm`의 fake로 각 step을 실행하고, 모든 추적 manifest가 tag의 릴리스 방식과 함께 `MANIFESTS`에 있거나(Rust crate는 archive로 릴리스하지 않고 git tag로 사용) 이유와 함께 `NOT_RELEASED`에 선언되기를 요구하며, Cargo archive가 있으면 실패하고, `tests/scripts/toolchain-files.test.mjs`는 trigger, 권한, step의 순서를 요구한다.

## 문서 사이트

온라인 문서는 정적 VitePress 사이트다. merge queue가 필수 check `push-gate`와 `ci-passed`(`.github/workflows/ci.yml`의 모든 job이 통과했을 때만 통과)를 통과한 commit으로 `main`을 옮기면 `pages` job이 `make docs-static-check`로 `docs/.vitepress/dist`를 생성하고, 이미 생성된 showcase HTML과 커밋된 AST artifact를 `examples/site/`에 복사해 Pages artifact로 배포한다. `ci.yml`의 job `release`가 문서와 showcase를 이미 검증하므로 발행 단계는 그 게이트를 반복하지 않는다. showcase는 parser나 renderer를 브라우저에 배포하지 않는다. 빌드는 저장소 경로에서 링크와 asset이 동작하도록 `VITEPRESS_BASE`를 전달하며 서버 측 program은 사용하지 않는다.

문서 빌드는 모든 `*.ko.md` 번역 쌍을 찾아 `/ko/` 아래에 발행한다. VitePress locale 설정이 이 경로 트리 전체에 한국어 탐색 메뉴와 `ko-KR` HTML 메타데이터를 제공한다. 정적 사이트 게이트는 suffix 형태의 출력 경로, 현재 locale을 벗어나는 탐색 링크, 잘못된 HTML 언어 메타데이터, 해석되지 않은 테마 보간을 거부한다.

게시 artifact를 로컬에서 재현하려면 다음을 실행한다.

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
