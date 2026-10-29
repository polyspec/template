<!-- doc-id: docs-operations-publication -->
<!-- source-sha256: a922aaf01aaaae35888f0954aad8e8530b16ffc70f8c034f9eb43b2de04f30c6 -->
# 발행

[English](/operations/publication).

릴리스 아카이브는 GitHub Release asset으로 배포한다. 다음 명령은 로컬 source checkout에서 패키지를 설치한다. 레지스트리 발행은 실제로 이루어질 때 `docs/features.md`에 기록한다.

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

릴리스 버전은 `config/release.json`의 manifest 전체에서 일치시킨다. 버전은 모든 패키지와 `CHANGELOG.md`에서 함께 바뀌며, 릴리스된 버전 위의 section `## Unreleased`가 마지막 릴리스 뒤의 모든 변경 항목을 담는다.

## Tag 릴리스

릴리스는 `main`의 commit에 붙인 tag다(AGENTS, T22.1-4). `vX.Y.Z`는 npm 패키지 `@polyspec/template`, `@polyspec/template-language`, `@polyspec/template-lsp`, `@polyspec/template-codemirror`, `@polyspec/template-compiler`, Composer 패키지 `polyspec/template`, `polyspec/template-cli`, `polyspec/template-php-ext`를 버전 X.Y.Z로 릴리스하고, `packages/go/vX.Y.Z`는 Go module `github.com/polyspec/template/packages/go`를 릴리스한다. Cargo 패키지 `polyspec-template`는 버전 X.Y.Z를 담지만 archive로 릴리스하지 않고 git tag로 사용한다. `config/release.json`의 `git-tag` manifest가 이를 선언한다. Python 패키지 `polyspec-template`(`packages/python`, `config/release.json`의 package kind `wheel`)은 버전 X.Y.Z를 가지며 PEP 427 wheel `polyspec_template-X.Y.Z-py3-none-any.whl`로 릴리스한다. wheel은 tag된 commit에서 `packages/python/pyproject.toml`의 `build-system.requires`가 고정한 build backend(`setuptools==84.2.1`)로 build한다. wheel의 metadata는 `packages/python/pyproject.toml`에 고정한 runtime 의존성을 선언하며 전체 의존성 그래프와 hash는 `packages/python/pylock.toml`에 있다. development dependency group은 wheel의 요구가 아니다. tag의 push는 `ci.yml`의 job `release`가 아닌 `.github/workflows/release.yml`(`on: push: tags: ['v*', '**/v*']`, 권한 `contents: write`. tag filter에서 `*`는 `/`와 맞지 않으므로 `**/v*`가 어느 깊이의 Go module tag든 포함한다)을 실행한다. bootstrap과 `make release-tools` 뒤에 그 step은 다음 순서로 설치한 release target(패키지, manifest, Go module은 `config/release.json`의 data다)을 실행하고 첫 실패에서 멈춘다.

```sh
make release-verify
make release-assets
make release-publish
make release-undraft
```

1. `make release-verify`는 tag된 commit이 `origin/main`의 조상이고(`git merge-base --is-ancestor`), 같은 commit에 Go module의 tag `packages/go/vX.Y.Z`가 있고, 그 commit의 최신 check run `ci-passed`(`gh api repos/<repository>/commits/<sha>/check-runs`)가 결론 `success`로 완료되었는지 확인한다. 없거나 실패한 check의 이름을 적으며 test를 다시 실행하지 않는다.
2. `make release-assets`는 npm 패키지를 build하고 `var/release/assets`를 쓴다. 각 npm 패키지의 `npm pack`(`.tgz`), tag된 commit의 시각으로 만든 각 Composer 패키지 directory의 `git archive`(`.zip`)이다. Python 패키지의 wheel(`.whl`)도 만든다. `uv build --wheel`을 `build-system.requires`의 build backend로 실행하고, `SOURCE_DATE_EPOCH`는 commit의 시각이다. wheel의 METADATA는 패키지 이름과 tag의 버전을 담고 `name==version` Requires-Dist만 담아야 한다. 릴리스 asset은 npm tarball, Composer zip과 wheel이다. archive 이름은 `<package>-<language>-<version>.<ext>`이고 `@scope/`와 `vendor/`는 `scope-`와 `vendor-`로 쓰며 language는 `npm` 또는 `php`다. `polyspec-template-npm-X.Y.Z.tgz`는 `@polyspec/template`, `polyspec-template-language-npm-X.Y.Z.tgz`는 `@polyspec/template-language`, `polyspec-template-php-X.Y.Z.zip`은 `polyspec/template`, `polyspec-template-php-ext-php-X.Y.Z.zip`은 `polyspec/template-php-ext`이다. Go tag는 아무것도 만들거나 첨부하지 않는다. `release-assets`는 `/`가 없는 tag에서만 npm 패키지를 build한다. 각 archive는 패키지의 manifest를 바꾸지 않고 담는다. tree의 발행 manifest가 발행되는 패키지다.
3. `make release-publish`는 GitHub API로 draft를 만들고 archive를 upload한다. 이전 실행의 draft는 교체하지만 공개한 릴리스는 교체하지 않는다. notes는 `CHANGELOG.md`의 section `## X.Y.Z`가 GitHub release body의 한도인 125000자(`NOTES_LIMIT`) 이하이면 그 section이다. 더 긴 section은 한 줄 `The changes of X.Y.Z are listed in [CHANGELOG.md](https://github.com/polyspec/template/blob/<tag>/CHANGELOG.md#XYZ).`로 바뀌며, anchor는 점을 뺀 버전이다.

4. `make release-undraft`가 릴리스를 공개한다. 앞 step이 실패하면 draft 상태로 남는다.

release workflow는 `make release-assets` 전에 `make release-tools`를 실행하며, 이것은 `mise.toml`의 Python을 설치한다. wheel은 그 Python으로 build하기 때문이다.

release workflow는 push된 tag마다 한 번 실행된다. tag `vX.Y.Z`의 `make release-verify`는 같은 commit의 tag `packages/go/vX.Y.Z`를 요구하므로, 메인테이너는 Go tag를 tag `vX.Y.Z`보다 먼저, 또는 같은 push로 push한다. Go tag의 실행은 archive를 만들지 않고 asset 없는 draft를 만들고 그 릴리스를 공개한다.

tag는 환경 변수 `TAG`로 step에 전달된다. kit은 자기 저장소에서 fixture 저장소로 자기 step을 test한다. `make release-coverage`는 모든 추적 manifest가 tag의 릴리스 방식(`archive`, `version`, Rust crate처럼 git tag로 사용하는 `git-tag`)과 함께 `config/release.json`의 `manifests`에 있거나 이유와 함께 `notReleased`에 있기를 요구하고, `tests/scripts/toolchain-files.test.mts`는 trigger, 권한, step의 순서를 요구한다.

consumer는 자기 package manager로 archive를 설치해 릴리스를 확인하며, 릴리스의 어떤 step도 archive를 설치하지 않는다. `tests/scripts/release-config.test.mts`는 `config/release.json`이 패키지들을 manifest가 선언한 대로 적었는지 검사한다.

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
      "require": { "php": ">=8.4", "ext-mbstring": "*" },
      "autoload": { "psr-4": { "Polyspec\\Template\\": "src/" } },
      "dist": { "type": "zip", "url": "https://github.com/polyspec/template/releases/download/vX.Y.Z/polyspec-template-X.Y.Z.zip" }
    }
  }],
  "require": { "polyspec/template": "X.Y.Z" }
}
```

`package` 항목은 zip의 `composer.json`을 대신하므로 그 `require`와 `autoload`를 다시 적는다. Composer는 type `php-ext`의 패키지를 설치하지 않는다. `polyspec/template-php-ext`의 zip은 PIE가 extension을 build해 설치하는 C source이며 PHP class도 명령도 담지 않는다. 확장의 PHP 쪽은 `polyspec/template`에 있다. 명령 `vendor/bin/template.php`는 PHP가 확장을 로드하면 확장의 class 위에서, 로드하지 않으면 라이브러리의 PHP 구현 위에서 실행된다.

저장소에서는 발행하지 않는 private root `package.json`이 저장소의 npm 패키지를 해석한다. 그 `workspaces`는 각 패키지의 directory를 적고, npm은 각각을 `node_modules`에 link한다. 역시 발행하지 않는 root `composer.json`도 같은 방식으로 Composer 패키지를 해석한다. 그 `path` repository는 `packages/php`를 적고, Composer는 그것을 root `vendor/`에 link하며 root `composer.lock`이 그것을 기록한다. 그 autoload-dev는 Composer가 설치하지 않는 `php-ext` type의 패키지인 `packages/php-ext`의 test를 map한다. 각 패키지의 발행 `package.json`과 `composer.json`은 의존하는 polyspec 패키지를 정확한 버전으로만 적고, 각 `composer.json`은 모든 릴리스가 다른 manifest와 함께 정하는 버전을 선언한다. 라이브러리는 lock을 commit하지 않으므로 발행 `composer.json`은 `repositories`를 선언하지 않고 `composer.lock`을 갖지 않는다. 저장소의 어떤 패키지도 다른 저장소의 polyspec 패키지에 의존하지 않으므로 다른 저장소의 릴리스 tag는 기록하지 않는다.

## 문서 사이트

온라인 문서는 정적 VitePress 사이트다. `main`의 CI run이 성공하면 `pages` workflow의 job이 `make docs-static-check`로 `docs/.vitepress/dist`를 build하고, 같은 commit의 CI run에서 `showcase` job이 build한 artifact `example-site`를 내려받아 `examples/site/`로 복사하며, 그 directory를 Pages artifact로 배포한다. `ci.yml`의 job `docs`와 job `showcase`가 같은 push에서 문서와 showcase를 검증했으므로 게시는 그 gate를 반복하지 않는다. showcase는 parser나 renderer를 browser에 보내지 않는다. build는 저장소 경로에 맞춰 `VITEPRESS_BASE`를 넘기므로 server 쪽 program 없이 `/<repository>/` 아래에서 링크와 asset이 동작한다.

문서 빌드는 모든 `*.ko.md` 번역 쌍을 찾아 `/ko/` 아래에 발행한다. VitePress locale 설정이 이 경로 트리 전체에 한국어 탐색 메뉴와 `ko-KR` HTML 메타데이터를 제공한다. 정적 사이트 게이트는 suffix 형태의 출력 경로, 현재 locale을 벗어나는 탐색 링크, 잘못된 HTML 언어 메타데이터, 해석되지 않은 테마 보간을 거부한다.

게시 artifact를 로컬에서 재현하려면 다음을 실행한다.

```sh
VITEPRESS_BASE=/template/ make docs-static-check
```

Pages는 make가 bootstrap을 읽기 전에 잠긴 도구 패키지를 설치한 뒤 Node 도구만 선택한다. artifact는 같은 커밋의 성공한 CI 실행에서 가져와야 한다.
