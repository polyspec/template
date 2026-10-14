<!-- doc-id: docs-operations-publication -->
<!-- source-sha256: 30a8622efb7aee3dfbbb3c7566b79a55c998440b6b7676fb34f863b9596201f4 -->
# 발행

[English](/operations/publication).

레지스트리에 발행된 패키지는 없다. 각 패키지는 로컬 체크아웃에서 다음과 같이 설치한다. 레지스트리 발행은 실제로 이루어질 때 `docs/features.md`에 기록한다.

## 로컬 설치

Go module:

```
go work init . ../template/packages/go
```

Go module은 checkout을 소비자의 `go.work`로 해석하며, 릴리스된 module이 보지 못하는 `go.mod`의 `replace`는 쓰지 않는다.

npm package:

```json
{ "dependencies": { "@polyspec/template": "file:../template/packages/ts" } }
```

Composer package:

```json
{
  "repositories": [{ "type": "path", "url": "../template/packages/php" }],
  "require": { "polyspec/template": "@dev" }
}
```

Cargo crate:

```toml
[dependencies]
polyspec-template = { path = "../template/packages/rust" }
```

Python 패키지는 release asset의 wheel `polyspec_template-X.Y.Z-py3-none-any.whl`에서 설치합니다:

```sh
pip install ./polyspec_template-X.Y.Z-py3-none-any.whl
```

## 버전

모든 패키지는 버전 `0.0.6`을 선언한다. 버전은 모든 패키지, `make release-consumer-lock TAG=vX.Y.Z`가 쓰는 lock과 함께 `tests/fixtures/release-consumer`의 consumer project, `CHANGELOG.md`에서 함께 바뀌며, 릴리스된 버전 위의 section `## Unreleased`가 마지막 릴리스 뒤의 모든 변경 항목을 담는다.

## Tag 릴리스

릴리스는 `main`의 commit에 붙인 tag다(AGENTS, T22.1-4). `vX.Y.Z`는 npm 패키지 `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `@polyspec/template-compiler`, Composer 패키지 `polyspec/template`, `polyspec/template-php-ext`를 버전 X.Y.Z로 릴리스하고, `packages/go/vX.Y.Z`는 Go module `github.com/polyspec/template/packages/go`를 릴리스한다. Cargo 패키지 `polyspec-template`는 버전 X.Y.Z를 담지만 archive로 릴리스하지 않고 git tag로 사용한다. `cargo package`는 git 의존성을 해석되지 않는 crates.io 요구로 바꾸기 때문이다(T22.1-5). Python 패키지 `polyspec-template`(`packages/python`, `config/release.json`의 package kind `wheel`)은 버전 X.Y.Z를 가지며 PEP 427 wheel `polyspec_template-X.Y.Z-py3-none-any.whl`로 릴리스한다. wheel은 tag된 commit에서 `pythonBackend`(`config/toolchain.json`이 버전과 sha256으로 고정한 build backend, `setuptools==84.0.0`)로 build한다. wheel의 metadata는 Requires-Dist를 담지 않는다. wheel은 다른 패키지에 의존하지 않으며, `dev` dependency group은 wheel의 요구가 아니다. tag의 push는 `ci.yml`의 job `release`가 아닌 `.github/workflows/release.yml`(`on: push: tags: ['v*', '**/v*']`, 권한 `contents: write`. tag filter에서 `*`는 `/`와 맞지 않으므로 `**/v*`가 어느 깊이의 Go module tag든 포함한다)을 실행한다. `make install` 뒤에 그 step은 다음 순서로 `node_modules/@polyspec/kit/dist/release.mjs`(패키지, manifest, Go module은 `config/release.json`의 data다)를 실행하고 첫 실패에서 멈춘다.

```sh
make release-verify
make release-versions
make release-assets
make release-publish
```

1. `make release-verify`는 tag된 commit이 `origin/main`의 조상이고(`git merge-base --is-ancestor`), 같은 commit에 Go module의 tag `packages/go/vX.Y.Z`가 있고, 그 commit의 최신 check run `ci-passed`(`gh api repos/<repository>/commits/<sha>/check-runs`)가 결론 `success`로 완료되었는지 확인한다. 없거나 실패한 check의 이름을 적으며 test를 다시 실행하지 않는다.
2. `make release-versions`는 각 `composer.json`의 `version` field를 포함해 `config/release.json`의 `manifests`에 있는 모든 manifest에 X.Y.Z가 있고 `CHANGELOG.md`와 `CHANGELOG.ko.md`에 section `## X.Y.Z`가 있는지 확인하며, 다른 파일마다 그 버전과 tag의 버전을 적는다. `packages/go/vX.Y.Z`에는 `packages/go/go.mod`의 module 경로와 section을 확인한다.
3. `make release-assets`는 npm 패키지를 build하고 `var/release/assets`를 쓴다. 각 npm 패키지의 `npm pack`(`.tgz`), tag된 commit의 시각으로 만든 각 Composer 패키지 directory의 `git archive`(`.zip`)이다. Python 패키지의 wheel(`.whl`)도 만든다. `pip wheel --no-deps --no-index`를 `var/tools/wheels`의 고정된 build backend와 함께 실행하고, `SOURCE_DATE_EPOCH`는 commit의 시각이다. wheel의 METADATA는 패키지 이름과 tag의 버전을 담고 `name==version` Requires-Dist만 담아야 한다. 릴리스 asset은 npm tarball, Composer zip과 wheel이다. archive 이름은 `<package>-<language>-<version>.<ext>`이고 `@scope/`와 `vendor/`는 `scope-`와 `vendor-`로 쓰며 language는 `npm` 또는 `php`다. `polyspec-template-npm-X.Y.Z.tgz`는 `@polyspec/template`, `polyspec-template-language-npm-X.Y.Z.tgz`는 `@polyspec/template-language`, `polyspec-template-php-X.Y.Z.zip`은 `polyspec/template`, `polyspec-template-php-ext-php-X.Y.Z.zip`은 `polyspec/template-php-ext`이다. Go tag는 아무것도 만들거나 첨부하지 않는다. `release-assets`는 `/`가 없는 tag에서만 npm 패키지를 build한다. 각 archive는 패키지의 manifest를 바꾸지 않고 담는다. tree의 발행 manifest가 발행되는 패키지다. 이어서 step은 pack된 모든 manifest가 tag된 commit의 manifest와 같고, 이 저장소의 scope에 속한 각 의존성을 정확한 버전으로, 이 저장소의 패키지를 X.Y.Z로 적으며, `overrides`를 선언하지 않고, 각 `composer.json`이 `artifact` repository가 읽는 버전 X.Y.Z를 선언하고 `repositories`를 선언하지 않을 때만 통과한다(`manifestProblems`). 경로(`file:`, `link:`, `workspace:`), git source(`git`, `github:`, ssh), URL, range, 개발 버전은 저장소 안에서만 설치된다.
4. `make release-publish`는 archive와 함께 `gh release create <tag> --verify-tag --title <tag> --notes-file <notes>`를 실행한다. notes는 `CHANGELOG.md`의 section `## X.Y.Z`가 GitHub release body의 한도인 125000자(`NOTES_LIMIT`) 이하이면 그 section이다. 더 긴 section은 한 줄 `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/template/blob/<tag>/CHANGELOG.md#XYZ).`로 바뀌며, anchor는 점을 뺀 버전이다.

release workflow는 `make release-assets` 전에 `make release-tools`를 실행하며, 이것은 `mise.toml`의 Python과 `config/toolchain.json`의 build backend `pythonBackend`를 설치한다. wheel은 그 Python으로 build하기 때문이다.

release workflow는 push된 tag마다 한 번 실행된다. tag `vX.Y.Z`의 `make release-verify`는 같은 commit의 tag `packages/go/vX.Y.Z`를 요구하므로, 메인테이너는 Go tag를 tag `vX.Y.Z`보다 먼저, 또는 같은 push로 push한다. Go tag의 실행은 archive를 만들지 않고 asset 없는 GitHub Release를 만든다.

tag는 환경 변수 `TAG`로 step에 전달된다. kit은 자기 저장소에서 fixture 저장소로 자기 step을 test한다. `make release-consumer TAG=vX.Y.Z`는 `var/release/assets`의 archive를 저장소 밖의 directory에 `tests/fixtures/release-consumer`의 consumer project로 설치하고(`node_modules/@polyspec/kit/dist/release-consumer.mjs`, `config/release.json`의 `consumers`: 빈 cache와 연결되지 않는 `@polyspec` scope registry로 모든 npm 패키지의 `npm ci`, 빈 `COMPOSER_HOME`과 cache와 zip의 `artifact` repository로 `polyspec/template`의 `composer install`) 각 패키지의 smoke 명령을 실행한다. commit된 lock은 각 registry 패키지를 정확한 버전과 integrity로 고정하고 매 실행 build하는 test 대상 archive를 `integrity` 없이 또는 빈 `shasum`으로 이름과 버전만 기록하며, `make release-consumer-lock TAG=vX.Y.Z`가 그 tag의 archive로 lock을 쓰므로 lock은 버전이나 의존성과 함께만 바뀐다. `make release-coverage`는 모든 추적 manifest가 tag의 릴리스 방식(`archive`, `version`, Rust crate처럼 git tag로 사용하는 `git-tag`)과 함께 `config/release.json`의 `manifests`에 있거나 이유와 함께 `notReleased`에 있기를 요구하고, `tests/scripts/toolchain-files.test.mts`는 trigger, 권한, step의 순서를 요구한다.

릴리스가 만들어진 뒤 `make release-proof TAG=vX.Y.Z`(online, `node_modules/@polyspec/kit/dist/release-proof.mjs`)가 checkout 밖에서 릴리스를 증명하며, 이 명령은 어떤 검사에도 속하지 않는다. GitHub Release의 asset이 그 버전의 archive와 정확히 같고 consumer project에 함께 설치되며, Python wheel이 `pip install --no-index --require-hashes --no-deps`로 새 virtual environment에 설치되어 (`make release-consumer`가 같은 설치를 var/release/assets에서 실행한다) `python -c "import polyspec.template"`가 통과하고, Rust crate `polyspec-template`가 새 crate의 git 의존성으로 build되며, `go list -m`이 Go module을 그 tag에서 해석한다. `tests/scripts/release-config.test.mts`는 `config/release.json`이 이 패키지들을 manifest가 선언한 대로 적었는지 검사한다.

## 릴리스 asset 설치

0.1 전에는 어떤 polyspec 패키지도 registry에 발행하지 않는다. 사용자는 GitHub Release의 archive `https://github.com/polyspec/template/releases/download/vX.Y.Z/<archive>`를 내려받아 함께 설치한다. 각 archive는 의존하는 polyspec 패키지를 이름과 정확한 버전으로 적고, 옆에 둔 그 버전의 archive가 의존성을 만족한다.

npm: 필요한 모든 tarball을 `file:` 의존성으로 적는다. `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `@polyspec/template-compiler`는 X.Y.Z의 `@polyspec/template-language` 또는 `@polyspec/template`에 의존하므로 그 패키지의 tarball도 적는다.

```json
{
  "dependencies": {
    "@polyspec/template": "file:vendor/polyspec-template-X.Y.Z.tgz",
    "@polyspec/template-language": "file:vendor/polyspec-template-language-X.Y.Z.tgz"
  }
}
```

`npm install`은 polyspec 패키지를 tarball만으로 설치한다. `@polyspec/template-lsp`와 `@polyspec/template-codemirror`의 다른 의존성은 npm registry에서 온다.

Composer: 내려받은 zip을 담은 directory인 `artifact` repository,

```json
{
  "repositories": [{ "type": "artifact", "url": "vendor/polyspec" }],
  "require": { "polyspec/template": "X.Y.Z" }
}
```

또는 zip URL마다 이름, 버전, zip의 `dist`를 적은 `package` repository 항목 하나를 쓴다.

```json
{
  "repositories": [{
    "type": "package",
    "package": {
      "name": "polyspec/template",
      "version": "X.Y.Z",
      "type": "library",
      "require": { "php": ">=8.5", "ext-mbstring": "*" },
      "autoload": { "psr-4": { "Polyspec\\Template\\": "src/" } },
      "dist": { "type": "zip", "url": "https://github.com/polyspec/template/releases/download/vX.Y.Z/polyspec-template-X.Y.Z.zip" }
    }
  }],
  "require": { "polyspec/template": "X.Y.Z" }
}
```

`package` 항목은 zip의 `composer.json`을 대신하므로 그 `require`와 `autoload`를 다시 적는다. Composer는 type `php-ext`의 패키지를 설치하지 않는다. `polyspec/template-php-ext`의 zip은 PIE가 extension을 build하는 source다.

저장소에서는 발행하지 않는 private root `package.json`이 저장소의 npm 패키지를 해석한다. 그 `workspaces`는 각 패키지의 directory를 적고, npm은 각각을 `node_modules`에 link한다. 역시 발행하지 않는 root `composer.json`도 같은 방식으로 Composer 패키지를 해석한다. 그 `path` repository는 `packages/php`를 적고, Composer는 그것을 root `vendor/`에 link하며 root `composer.lock`이 그것을 기록한다. 그 autoload는 Composer가 설치하지 않는 `php-ext` type의 패키지인 `packages/php-ext`의 class와 test를 map한다. 각 패키지의 발행 `package.json`과 `composer.json`은 의존하는 polyspec 패키지를 정확한 버전으로만 적고, 각 `composer.json`은 모든 릴리스가 다른 manifest와 함께 정하는 버전을 선언한다. 라이브러리는 lock을 commit하지 않으므로 발행 `composer.json`은 `repositories`를 선언하지 않고 `composer.lock`을 갖지 않는다. 저장소의 어떤 패키지도 다른 저장소의 polyspec 패키지에 의존하지 않으므로 다른 저장소의 릴리스 tag는 기록하지 않는다.

## 문서 사이트

온라인 문서는 정적 VitePress 사이트다. `main`에 대한 push 뒤에 `pages` job은 `make docs-static-check`로 `docs/.vitepress/dist`를 build하고, 이미 생성된 showcase HTML과 commit된 AST artifact를 `examples/site/`에 복사하며, 그 directory를 Pages artifact로 배포한다. `ci.yml`의 job `docs`와 job `showcase`가 같은 push에서 문서와 showcase를 검증했으므로 게시는 그 gate를 반복하지 않는다. showcase는 parser나 renderer를 browser에 보내지 않는다. build는 저장소 경로에 맞춰 `VITEPRESS_BASE`를 넘기므로 server 쪽 program 없이 `/<repository>/` 아래에서 링크와 asset이 동작한다.

문서 빌드는 모든 `*.ko.md` 번역 쌍을 찾아 `/ko/` 아래에 발행한다. VitePress locale 설정이 이 경로 트리 전체에 한국어 탐색 메뉴와 `ko-KR` HTML 메타데이터를 제공한다. 정적 사이트 게이트는 suffix 형태의 출력 경로, 현재 locale을 벗어나는 탐색 링크, 잘못된 HTML 언어 메타데이터, 해석되지 않은 테마 보간을 거부한다.

게시 artifact를 로컬에서 재현하려면 다음을 실행한다.

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```
