<!-- doc-id: agents -->
<!-- source-sha256: 7d4376f272f80da9b02af4cfe91cab1e4e9c60f8b922f13373b83a91e1388542 -->
# 개발

## 문서

- Own: 주제마다 정본 문서를 하나 둔다. 계약은 `docs/spec/`에 둔다. 구현·검증·배포 상태는 `docs/features.md`에 둔다. 현재 절차는 `docs/operations/`에 둔다. 실제 변경과 검증 결과는 `CHANGELOG.md`에 둔다. 실행 계획은 `docs/plans/execution/plan.md`이고, 그 작업은 checklist `docs/plans/execution/checklist.md`에 있다. 승인 대기 제안은 `docs/plans/`에 두고, 승인 후 내용을 명세로 옮기고 제안을 제거한다.
  Enforced by: none, which document is authoritative is a judgement.
- Own: 테스트 결과와 배포를 따로 기록한다. 이전 코드의 결과를 변경된 코드의 근거로 사용하지 않는다.
  Enforced by: none, the separation of results is a judgement.
- Own: `make docs-check`는 기본 검사에 포함된다. 링크, 번역 쌍, 동일한 코드 블록, 상태 필드를 검사한다(`config/documents.json`). 모든 쌍은 같은 `<!-- doc-id: <id> -->`를 한 번 가지고, 한글 파일은 `<!-- source-sha256: 5bcb76b3e5de1481d0c9a5eeb7541f649b94c4933c8d495b72a26b44095d6c4c -->`를 가지며, 이 값은 번역을 검토한 뒤에 갱신한다. 내용의 정확성은 코드와 테스트를 읽어 확인한다.
  Enforced by: `make docs-check`

## 구현

- Own: `@polyspec/kit` 변경이 필요하면 `polyspec/kit` GitHub 이슈로 요청한다. 공급자 저장소나 설치 패키지 소스를 수정하거나 소비자 전용 대체 검사로 검증을 우회하지 않는다. 공개된 릴리즈를 적용하고 `make kit-sync`로 공급자가 소유한 복사본을 갱신한다.
  Enforced by: none, provider ownership is a review judgement.

- Own: 공유 도구는 도구 저장소 `polyspec/kit`의 npm package `@polyspec/kit`에서 온다. 이것은 release asset과 integrity로 고정한 devDependency다. `make install-tools TOOLS=npm`과 `make install-packages`가 그것을 설치한다. Makefile은 설치한 package의 `node_modules/@polyspec/kit/scripts/kit/kit-bootstrap.mk`를 include한다. bootstrap은 그 package의 `kit.mk`를 include하고 native 개발 link에서는 source 도구를, release 설치에서는 컴파일한 도구를 선택하며, recipe는 그 도구를 `node $(KIT)/<tool>.$(KIT_EXT)`로 실행한다. package의 `package.json`의 `kit.copies`가 나열하는 파일은 복사본으로 두며, `make kit-sync`가 설치된 package에서 쓰고 이 저장소에서는 고치지 않는다. `PRINCIPLES.md`, 그 짝, `.editorconfig`, `.claude/settings.json`은 `make kit-sync`가 쓰는 일반 파일 복사본이다. `make kit-check`는 복사본을 package와, `config/`의 파일을 그 schema와 비교한다. 이 저장소의 script는 package가 export하는 도구 API(`@polyspec/kit/<tool>`)만 import하고, package의 파일을 경로로 import하지 않는다. 이 저장소가 kit을 쓰는 다른 저장소와 다른 곳은 `config/*.json`(`owner-checks`, `release`, `toolchain`, `checklist`, `documents`)과 `layout.yml`, 그리고 자기 제품 코드뿐이다.
  Enforced by: `make kit-check`
- Own: polyspec version이 0.0.x인 동안 개발 checkout은 kit `docs/plans/local-links.md`가 설명하는 대로 설치된 polyspec package를 그 source에 link하며, link는 `node_modules/`에 있는 생성 경로라 commit하지 않는다. `make link-check`는 개발 보조로 그 link를 나열한다.
  Enforced by: `make staged-generated-hook`
- Own: 임시 스크립트나 임시 폴더를 사용하지 않는다. 모든 검사는 Makefile 타겟, `scripts/` 아래 스크립트, 커밋된 테스트 중 하나이며 멱등하다.
  Enforced by: `make rules-check`
- Own: 저장소 상대경로를 사용한다. 외부 입력 경로는 명시적으로 받는다.
  Enforced by: none, the paths are a judgement of the code review.
- Own: symbolic link를 만들지 않는다. npm이 쓰는 link(`node_modules`의 workspace package와 `node_modules/.bin`의 명령)와 uv가 쓰는 link는 그 도구의 동작이므로 받아들인다. recipe와 script는 도구를 `node_modules/.bin`에서 실행한다.
  Enforced by: none, no check reads the links.
- Own: checkout마다 Rust crate를 자기 target에 빌드한다. `CARGO_TARGET_DIR`를 다른 checkout의 target으로 두지 않는다. cargo는 수정 시각으로 최신 여부를 판정하므로 다른 checkout의 소스로 빌드한 binary를 최신으로 받아들인다. Makefile은 물려받은 `CARGO_TARGET_DIR`를 cargo에 넘기지 않고, worktree는 지울 때 자기 target도 지운다. test는 checkout의 file을 binary에 compile된 경로가 아니라 cargo가 test를 실행할 때 정하는 `CARGO_MANIFEST_DIR`에서 읽는다.
  Enforced by: none, no check reads the target.

## 멱등성

검사는 같은 tree에 대해 언제, 어느 machine에서나 같은 결과를 낸다. 아래 규칙은 각각 한 종류의 결함을 다룬다. 한 종류의 결함은 그 종류가 나타나는 모든 곳에서 고치고, 규칙에는 test를 둔다.

- Refines S4: Toolchain: 모든 recipe는 checkout의 파일이 선언한 도구 version을 실행한다. Node.js는 `mise.toml`(mise가 `var/tools`에 설치하고 `$(NODE)`로 실행, kit K171), npm은 `package.json`의 `packageManager`, Go, Python, Composer와 lint·audit 도구는 `mise.toml`이 선언하고 그 digest는 `mise.lock`에 둔다. Go와 Python은 kit pin이며 `packages/go/go.mod`의 `go` 줄이 같아야 한다. Rust는 `rust-toolchain.toml`, PHP minor version과 mise는 `config/toolchain.json`이 선언한다. C PHP extension은 `PATH`에 있는 PHP의 phpize와 php-config로 build하며, 이 PHP는 test를 실행하는 PHP여야 한다(그렇지 않으면 kit의 `make build-php-ext`가 실패한다). `make install-tools`(`$(KIT)/install-tools.$(KIT_EXT)`)가 `make install-tools TOOLS=npm`이 npm과 mise를 설치한 뒤 `mise.toml`의 도구를 mise로 `var/tools`에 설치하며, machine의 도구는 아무것도 바꾸지 않는다. CI는 모든 action을 commit으로, runner image를 version으로 고정한다. `tests/scripts/toolchain-files.test.mts`가 모든 변경에서 version을 검사한다.
  Enforced by: `make toolchain-check`
- Refines P17: Network: 최신 릴리스, 버전 range의 resolve, outdated 패키지나 새 릴리스의 조회처럼 결과가 시간에 따라 달라지는 registry 조회는 검사에서 실행하지 않는다. lock이 정확한 버전과 integrity로 고정한 패키지의 download는 설치이며 검사에서 실행할 수 있다. `make install`이 `npm ci`와 `composer install`로 그렇게 한다. 검사가 `cargo --offline`으로 resolve하는 모든 Cargo.lock의 crate처럼 다른 검사가 읽는 것은 `make install`이 받아 두므로, 어떤 검사도 먼저 실행된 명령에 기대지 않는다. Makefile은 `$(ONLINE)`을 쓰는 `install`, `install-tools`의 download를 빼고 모든 recipe에서 cargo, go, npm, Composer를 offline으로 실행한다(`CARGO_NET_OFFLINE`, `GOPROXY=off`, `npm_config_offline`, `COMPOSER_DISABLE_NETWORK`). cargo를 실행하는 모든 target은 `cargo-downloads-check`에 의존하며, 이것은 없는 crate에 대해 `make install`을 밝히므로 어떤 검사도 offline mode를 벗어나라는 cargo의 안내를 보이지 않는다.
  Enforced by: `make template-test-scripts`
- Refines P17: 공유 상태: 실행은 자기 directory에만 쓴다. 임시 파일은 checkout 밖에 실행의 이름으로, cache는 checkout 안(`var/`)에 둔다. 여러 실행이 읽고 쓰는 record는 읽을 때부터 마지막으로 쓸 때까지 lock을 쥔다. 실행은 자기가 시작한 group의 process를 남기지 않는다.
  Enforced by: none, the sharing of runs is a judgement.
- Own: 한 실행에 모든 실패: make는 계속 진행하고(`MAKEFLAGS += -k`), 전체 suite의 target은 명령 하나를 실행하며 다른 검사는 prerequisite로 적고, 여러 언어의 검사는 모든 언어를 실행하고 실패한 언어를 모두 밝힌다. `make ci-targets`는 target마다의 log와, 실패한 target마다 첫 실패 줄을 담은 summary를 `var/report`에 쓰고, 모든 CI job은 실패한 뒤에도 그 report를 upload한다.
  Enforced by: `make ci-targets`
- Own: Owner: 검사가 읽는 모든 경로는 `config/owner-checks.json`의 `inputs`에 선언되고, 그 검사를 선택하는 규칙을 가진다.
  Enforced by: `make owner-validate`
- Own: Platform: script, test, recipe는 stream을 실행의 파일이나 `-`로 다루고 `/dev/stdin`, `/dev/fd`, `/proc/self` 같은 device path로 다루지 않는다. Linux는 이 경로를 파일로 열기 때문에 Node.js가 child의 input으로 주는 socket을 열지 못한다. `tests/scripts/device-paths.test.mts`가 추적되는 모든 source를 검사한다.
  Enforced by: `make template-test-scripts`
- Own: 독립성: test는 도구 출력의 문구나 형식, test를 실행하는 사용자, 자기 timeout을 넘지 않는 소요 시간에 기대지 않는다. 계산할 수 있는 것은 계산하고, test를 실행하는 사용자와 platform에 맞는 결과를 검사한다.
  Enforced by: none, the independence of a test is a judgement.

## 변경과 기록

- Own: 문서, 주석, 기록, 커밋 메시지는 template만 서술한다. 기록은 결함이나 변경을 template에 관한 사실, 즉 입력, 동작, 기대 동작으로 적고, 보고자, 출처, template을 쓰는 제품이나 program을 적지 않는다. 그런 사실을 담지 않는 문장은 지운다.
  Enforced by: none, the wording of records is a judgement.

## 필수 검사

- Refines P20: 개발에서는 unit test만 실행한다. 작업이 진행 중일 때는 변경을 소유한 Red와 Green unit test를 실행한다. 개발 중에도, commit이나 push 전에도 전체 검사나 end-to-end 검사를 로컬에서 실행하지 않는다. `make owner-check`, conformance runner, browser test, VS Code integration test가 그렇다. CI가 `main`에 대한 모든 push와 모든 수동 실행에서 이것을 실행하며(`.github/workflows/ci.yml`), job마다의 report(`var/report`)가 모든 실패를 log와 함께 밝힌다. 새 경로는 같은 변경에서 `config/owner-checks.json`에 owner를 얻고, owner check는 CI에서 실행된다.
  Enforced by: none, a local run is not observed by a tool.
- Own: `.github/workflows/ci.yml`의 job들은 `main`에 대한 모든 push와 모든 수동 실행(`workflow_dispatch`)에서 전체 suite, 곧 `CHECK_TARGETS`의 target을 실행한다. 각 job은 자기 target을 `make ci-targets TARGETS="..."`로 실행하고, `CHECK_TARGETS`의 모든 target은 정확히 한 job에서 실행된다(`tests/scripts/suite-parity.test.mts`).
  Enforced by: `make template-test-scripts`
- Own: 모든 make 실행은 `core.hooksPath`를 `config/checklist.json`의 hook인 `.githooks`로 설정한다. `make hooks`는 hook을 설치하고 검사하며, `make hooks-check`는 hook이 설치되지 않았을 때 실패한다. push는 검사하지 않는다. message 규칙은 commit에서 실행되고, CI는 release에서 읽는다(`docs/operations/development.md`).
  Enforced by: `make hooks-check`
- Own: 모든 test는 실행 중에 시작, 결과, 경과 시간을 출력하고 자기 timeout을 가진다. 실행 전체, package, 파일에 시간 제한을 두지 않는다. 수십 분 걸리는 test와 시작과 끝만 출력하는 test는 결함이다.
  Enforced by: none, the output of a test is a judgement.
- Own: build, `tsc` type check, 설치, download, program 설치나 실행, 실행 전체 같은 오래 걸리는 작업은 단계마다 log 줄을 출력하고 timeout을 두지 않으며, 출력이 없는 시간의 deadline도 두지 않는다. 성공과 실패는 exit status, 결과, 오류로 판단한다. 시간 제한은 예상보다 느린 정상 실행을 실패시키기 때문이다. test case는 짧은 검증 단위이므로 자기 timeout을 유지한다.
  Enforced by: none, the output of an operation is a judgement.

## 릴리스

- Own: 릴리스는 CI 실행이 성공한 `main`의 commit에 붙인 tag이다. `.github/workflows/ci.yml`의 job `ci-passed`는 그 실행의 다른 모든 job이 통과했을 때만 통과한다. tag를 만들고 옮기고 push하는 것은 메인테이너뿐이다(T22.1-4).
  Enforced by: `make release-verify`
- Own: 버전 올림 commit `chore(release): Release X.Y.Z (#task)`는 `config/release.json`의 `manifests`가 나열한 모든 manifest(루트 `package.json`, npm 패키지, VS Code 확장, Rust crate와 Python 패키지(`packages/python/pyproject.toml`), `package-lock.json`, `packages/rust/Cargo.lock`. `composer.json`에는 `version` field가 없고 버전을 tag에서 받는다)의 버전을 X.Y.Z로 정하고, `CHANGELOG.md`와 `CHANGELOG.ko.md`의 `## Unreleased`를 `## X.Y.Z`로 바꾸며 그 위에 비어 있는 새 `## Unreleased`를 둔다.
  Enforced by: none, the version-bump commit is a judgement; the package managers resolve the versions.
- Own: 그 commit을 `main`으로 가져온 push의 CI 실행이 성공한 뒤, 메인테이너는 그 commit에 `vX.Y.Z` tag를, Go module에는 `packages/go/vX.Y.Z` tag를 붙이고 tag를 push한다. tag push는 `.github/workflows/release.yml`을 실행한다. 이 workflow는 tag된 commit이 `main`에 있고 check `ci-passed`를 통과했는지, 모든 manifest에 tag의 버전이 있고 `CHANGELOG.md`에 section `## X.Y.Z`가 있는지 확인하고, `<package>-<language>-<version>.<ext>`(`polyspec-template-npm-X.Y.Z.tgz`)라는 이름의 패키지 archive를 만들어 GitHub Release를 생성한다(`docs/operations/publication.md`).
  Enforced by: `make release-verify`

## 생성 파일

- Own: 생성 파일은 Git에 추적하지 않습니다. 여기에는 의존성 설치(`node_modules/`, `vendor/`, 가상 환경), 빌드 산출물(`dist/`, `target/`, `*.tsbuildinfo`), 캐시(`.cache/`, `__pycache__/`, `.pytest_cache/`), 테스트 실행 산출물(`test-results/`, `playwright-report/`, PHPUnit 캐시), 도구 다운로드(`var/`)가 포함됩니다. 예외는 저장소가 의도적으로 필요로 하는 파일뿐이며 이것만 추적합니다: lock 파일(`package-lock.json`, `composer.lock`, `Cargo.lock`, uv lock, `mise.lock`), 이 문서가 밝히는 커밋된 생성 문서, 테스트 fixture. 각 `.gitignore`가 이 경로를 덮으며, 새 생성기는 같은 commit에서 ignore 항목을 추가합니다.
  Enforced by: `make staged-generated-hook`

## Checklist

- Refines P24: 이 저장소의 checklist는 `docs/plans/execution/checklist.md` 하나다. 작업을 하위 항목으로 나누거나 작업을 추가하고, 다른 checklist를 만들지 않는다. 저장소마다 자기 checklist를 따로 운영한다.
  Enforced by: `make docs-check`
- Refines P24: 웨이브의 계획, 의존 관계, 작업의 원인, 완료 기준, 완료 정의와 그 증거는 `docs/plans/execution/plan.md`에 둔다. checklist에는 작업만 둔다.
  Enforced by: `make docs-check`
- Own: 독립 작업은 병렬로 진행해도 되지만, 새 작업을 시작하는 것보다 진행 중인 작업을 끝내는 것이 먼저다. `[~]`가 아니라 `[o]`가 계속 늘어나야 한다.
  Enforced by: none, the order of tasks is a judgement.
- Own: 지시를 받으면 먼저 checklist의 작업인지, 이 파일의 규칙인지, agent memory에 둘 일인지, 답변만 할 일인지 분류한다. agent memory에는 요청자와 agent가 session 사이에 알아야 하는 것만 두고, project가 남겨야 하는 것은 저장소(문서, 주석, 커밋 메시지)에 둔다. 지시가 급하다고 명시하지 않는 한, 우선순위와 함께 작업으로 기록하고 진행 중인 작업을 계속한다. 규칙은 이 파일에 중복 없이 두고, checklist나 changelog에는 넣지 않는다.
  Enforced by: none, the classification is a judgement.
