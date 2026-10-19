<!-- doc-id: agents -->
<!-- source-sha256: 72fcef986cea0be26b4bbd2655b45b71abe9a9466f04e6040d9d8de54554a6dc -->
# 개발

## 문서

- 주제마다 정본 문서를 하나 둔다. 계약은 `docs/spec/`에 둔다. 구현·검증·배포 상태는 `docs/features.md`에 둔다. 현재 절차는 `docs/operations/`에 둔다. 실제 변경과 검증 결과는 `CHANGELOG.md`에 둔다. 실행 계획은 `docs/plans/execution/plan.md`이고, 그 작업은 checklist `docs/plans/execution/checklist.md`에 있다. 승인 대기 제안은 `docs/plans/`에 두고, 승인 후 내용을 명세로 옮기고 제안을 제거한다.
  Enforced by: none, which document is authoritative is a judgement.
- 문서는 현재 동작을 서술한다. 방향이 바뀌면 명세부터 수정하고 구현되지 않은 부분을 표시한다.
  Enforced by: none, whether the documents match the code is a judgement.
- 동작 변경, 관련 문서, 기능 상태 행, 변경 기록은 하나의 변경이다.
  Enforced by: `make commits-check`
- 테스트 결과와 배포를 따로 기록한다. 이전 코드의 결과를 변경된 코드의 근거로 사용하지 않는다.
  Enforced by: none, the separation of results is a judgement.
- `make docs-check`는 기본 검사에 포함된다. 링크, 번역 쌍, 동일한 코드 블록, 상태 필드를 검사한다(`config/documents.json`). 모든 쌍은 같은 `<!-- doc-id: <id> -->`를 한 번 가지고, 한글 파일은 `<!-- source-sha256: <영어 파일의 sha256> -->`를 가지며, 이 값은 번역을 검토한 뒤에 갱신한다. 내용의 정확성은 코드와 테스트를 읽어 확인한다.
  Enforced by: `make docs-check`

## 구현

- 공유 도구는 도구 저장소 `polyspec/kit`의 npm package `@polyspec/kit`에서 온다. 이것은 release asset과 integrity로 고정한 devDependency다. `make install-tools TOOLS=npm`과 `make install-packages`가 그것을 설치한다. Makefile은 설치된 package의 `kit.mk`를 include하는 `scripts/kit/kit-bootstrap.mk`를 include하고, recipe는 그 도구를 `node $(KIT)/<tool>.$(KIT_EXT)`로 실행한다. package의 `package.json`의 `kit.copies`가 나열하는 파일은 복사본으로 두며, `make kit-sync`가 설치된 package에서 쓰고 이 저장소에서는 고치지 않는다. `make kit-check`는 복사본을 package와, `config/`의 파일을 그 schema와 비교한다. 이 저장소의 script는 package가 export하는 도구 API(`@polyspec/kit/<tool>`)만 import하고, package의 파일을 경로로 import하지 않는다. 이 저장소가 kit을 쓰는 다른 저장소와 다른 곳은 `config/*.json`(`dependency-policy`, `dependency-review`, `owner-checks`, `release`, `toolchain`, `checklist`, `documents`)과 `layout.yml`, 그리고 자기 제품 코드뿐이다.
  Enforced by: `make kit-check`
- polyspec version이 0.0.x인 동안 개발 checkout은 kit `docs/plans/local-links.md`가 설명하는 대로 설치된 polyspec package를 그 source에 link하며, link는 commit하지 않는다.
  Enforced by: `make link-check`
- 임시 스크립트나 임시 폴더를 사용하지 않는다. 모든 검사는 Makefile 타겟, `scripts/` 아래 스크립트, 커밋된 테스트 중 하나이며 멱등하다.
  Enforced by: `make rules-check`
- 각 패키지 안에서 코드와 테스트를 별도 디렉터리에 둔다. 코어 테스트는 코어 패키지에 둔다. 확장 테스트는 확장 패키지에 둔다.
  Enforced by: `make layout-check`
- 저장소 상대경로를 사용한다. 외부 입력 경로는 명시적으로 받는다.
  Enforced by: none, the paths are a judgement of the code review.
- symbolic link를 만들지 않는다. npm이 쓰는 link(`node_modules`의 workspace package와 `node_modules/.bin`의 명령)와 uv가 쓰는 link는 그 도구의 동작이므로 받아들인다. recipe와 script는 도구를 `node_modules/.bin`에서 실행한다.
  Enforced by: none, no check reads the links.
- checkout마다 Rust crate를 자기 target에 빌드한다. `CARGO_TARGET_DIR`를 다른 checkout의 target으로 두지 않는다. cargo는 수정 시각으로 최신 여부를 판정하므로 다른 checkout의 소스로 빌드한 binary를 최신으로 받아들인다. Makefile은 물려받은 `CARGO_TARGET_DIR`를 cargo에 넘기지 않고, worktree는 지울 때 자기 target도 지운다. test는 checkout의 file을 binary에 compile된 경로가 아니라 cargo가 test를 실행할 때 정하는 `CARGO_MANIFEST_DIR`에서 읽는다.
  Enforced by: none, no check reads the target.

## 멱등성

검사는 같은 tree에 대해 언제, 어느 machine에서나 같은 결과를 낸다. 아래 규칙은 각각 한 종류의 결함을 다룬다. 한 종류의 결함은 그 종류가 나타나는 모든 곳에서 고치고, 규칙에는 test를 둔다.

- Toolchain: 모든 recipe는 checkout의 파일이 선언한 도구 version을 실행한다. Node.js는 `mise.toml`(mise가 `var/tools`에 설치하고 `$(NODE)`로 실행, kit K171), npm은 `package.json`의 `packageManager`, Go, Python, Composer와 lint·audit 도구는 `mise.toml`이 선언하고 그 digest는 `mise.lock`에 둔다. Go와 Python은 kit pin이며 `packages/go/go.mod`의 `go` 줄이 같아야 한다. Rust는 `rust-toolchain.toml`, PHP minor version과 mise는 `config/toolchain.json`이 선언한다. C PHP extension은 `PATH`에 있는 PHP의 phpize와 php-config로 build하며, 이 PHP는 test를 실행하는 PHP여야 한다(그렇지 않으면 `scripts/build-php-extension.mts`가 실패한다). `make install-tools`(`node_modules/@polyspec/kit/dist/install-tools.mjs`)가 `make install-tools TOOLS=npm`이 npm과 mise를 설치한 뒤 `mise.toml`의 도구를 mise로 `var/tools`에 설치하며, machine의 도구는 아무것도 바꾸지 않는다. CI는 모든 action을 commit으로, runner image를 version으로 고정한다. `tests/scripts/toolchain-files.test.mts`가 모든 변경에서 version을 검사한다.
  Enforced by: `make toolchain-check`
- Network: 최신 릴리스, 버전 range의 resolve, outdated 패키지나 새 릴리스의 조회처럼 결과가 시간에 따라 달라지는 registry 조회는 검사에서 실행하지 않는다. registry에 묻는 review는 따로 있는 명령이고 그 결과를 commit한다. lock이 정확한 버전과 integrity로 고정한 패키지의 download는 설치이며 검사에서 실행할 수 있다. `make install`이 `npm ci`와 `composer install`로, `make release-consumer`가 `tests/fixtures/release-consumer`의 commit된 lock으로 그렇게 한다. 검사가 `cargo --offline`으로 resolve하는 모든 Cargo.lock의 crate처럼 다른 검사가 읽는 것은 `make install`이 받아 두므로, 어떤 검사도 먼저 실행된 명령에 기대지 않는다. Makefile은 `$(ONLINE)`을 쓰는 `install`, `install-tools`, `dependency-review`, `release-consumer-lock`의 download와 `make release-consumer`의 설치를 빼고 모든 recipe에서 cargo, go, npm, Composer를 offline으로 실행한다(`CARGO_NET_OFFLINE`, `GOPROXY=off`, `npm_config_offline`, `COMPOSER_DISABLE_NETWORK`). cargo를 실행하는 모든 target은 `cargo-downloads-check`에 의존하며, 이것은 없는 crate에 대해 `make install`을 밝히므로 어떤 검사도 offline mode를 벗어나라는 cargo의 안내를 보이지 않는다.
  Enforced by: `make dependency-policy-check`
- Build: 검사는 자기가 읽는 것을, 입력이 바뀌지 않으면 아무것도 하지 않는 build로 만든다. 앞 target이나 앞 실행의 build에 기대지 않는다. 다른 것이 읽는 build는 byte가 바뀔 때에만 임시 파일과 rename으로 게시한다.
  Enforced by: none, the build behavior is verified by the tests of the packages.
- 공유 상태: 실행은 자기 directory에만 쓴다. 임시 파일은 checkout 밖에 실행의 이름으로, cache는 checkout 안(`var/`)에 둔다. 여러 실행이 읽고 쓰는 record는 읽을 때부터 마지막으로 쓸 때까지 lock을 쥔다. 실행은 자기가 시작한 group의 process를 남기지 않는다.
  Enforced by: none, the sharing of runs is a judgement.
- 아무것도 검증하지 않으면 실패: test가 하나도 실행되지 않은 실행은 실패한다. test는 build나 package가 없을 때 자기를 건너뛰지 않고, 그것을 build하거나 실패한다.
  Enforced by: none, a test that does not run is found by reading the output.
- 한 실행에 모든 실패: make는 계속 진행하고(`MAKEFLAGS += -k`), 전체 suite의 target은 명령 하나를 실행하며 다른 검사는 prerequisite로 적고, 여러 언어의 검사는 모든 언어를 실행하고 실패한 언어를 모두 밝힌다. `make check`와 `make ci-targets`는 target마다의 log와, 실패한 target마다 첫 실패 줄을 담은 summary를 `var/report`에 쓰고, 모든 CI job은 실패한 뒤에도 그 report를 upload한다.
  Enforced by: `make ci-targets`
- Owner: 검사가 읽는 모든 경로는 `config/owner-checks.json`의 `inputs`에 선언되고, 그 검사를 선택하는 규칙을 가진다.
  Enforced by: `make owner-validate`
- 메시지: 실패는 실패한 것을 기대값과 실제값, 또는 명령과 해결 방법과 함께 밝힌다.
  Enforced by: none, the wording of messages is a judgement.
- Platform: script, test, recipe는 stream을 실행의 파일이나 `-`로 다루고 `/dev/stdin`, `/dev/fd`, `/proc/self` 같은 device path로 다루지 않는다. Linux는 이 경로를 파일로 열기 때문에 Node.js가 child의 input으로 주는 socket을 열지 못한다. `tests/scripts/device-paths.test.mts`가 추적되는 모든 source를 검사한다.
  Enforced by: `make test-scripts`
- 독립성: test는 도구 출력의 문구나 형식, test를 실행하는 사용자, 자기 timeout을 넘지 않는 소요 시간에 기대지 않는다. 계산할 수 있는 것은 계산하고, test를 실행하는 사용자와 platform에 맞는 결과를 검사한다.
  Enforced by: none, the independence of a test is a judgement.

## 결정과 수용 규칙

- 구현을 바꾸기 전에 불변 조건, 수용 조건, 실패 조건을 정한다. test는 그 조건의 근거를 제공하며, 구현 뒤에 더 약한 대체 조건을 정의하지 않는다.
  Enforced by: none, the order of definitions is a judgement.
- 실패하는 구현을 통과시키려고 수용된 조건을 약화하거나 건너뛰거나 제거하지 않는다. 구현을 고친다.
  Enforced by: `make test-markers-check`
- 수용된 조건이 내부적으로 모순되거나 틀린 것이 입증되면, 먼저 결함과 그 영향을 설명한다. 구현을 계속하기 전에 명세, test, 문서를 함께 고친다.
  Enforced by: none, the consistency of a condition is a judgement.
- 기존 코드, 이력, 관례는 검토할 근거이지 권위가 아니다. 현재 계약과 이 규칙을 충족할 때만 유지한다.
  Enforced by: none, the use of existing code is a judgement.
- 예외는 기계로 검사하는 좁은 경계, 문서화된 이유, 제거 조건을 가져야 한다. 아키텍처가 불변 조건을 직접 충족할 수 있으면 예외를 만들지 않는다.
  Enforced by: none, the boundary of an exception is a judgement.
- 프로젝트가 선언한 runtime 범위를 지원하는 최신 stable 의존성 release, 곧 의존성을 고르거나 올릴 때 알려진 최신 release를 사용한다. prerelease를 stable로 취급하지 않는다. 의존성은 `make dependency-review UPDATE=1`로 고르고 올리며, 바뀐 manifest나 lock은 `make dependency-review RECORD=1`이 쓰는 review 기록과 함께 커밋한다. 검증 suite는 그 기록을 읽고 registry를 조회하지 않으므로 같은 tree는 언제나 같은 결과를 낸다.
  Enforced by: `make dependency-policy-check`
- 오래된 의존성을 말없이 고정하지 않는다. 재현 가능한 호환성 이유와 고정을 풀 수 있는 조건을 기록하고, release 검사가 오래되었거나 설명 없는 고정을 거부하게 한다.
  Enforced by: `make dependency-policy-check`
- release는 설정된 심각도의 알려진 의존성 취약점을 거부해야 하며, 정확히 잠긴 의존성 graph로 전체 release matrix를 통과해야 한다. review는 모든 lock의 보안 권고를 기록하고, gate는 review 때 보안 권고가 있던 lock을 거부하며, 예약된 dependency review가 나중에 공개된 보안 권고를 찾는다.
  Enforced by: `make dependency-audit`

## 변경과 기록

- 커밋 메시지, 주석, 문서, 번역은 직접적인 언어로 쓴다: 동작 이름(생성, 등록, 제거, 반환, 실패)을 사용하고, 주체와 대상을 명시하고, 원인은 한 문장으로 설명하고, 비유와 구어체를 사용하지 않는다. 영어와 한국어에 같은 정보를 제공한다.
  Enforced by: none, the wording of records is a judgement.
- 문서, 주석, 기록, 커밋 메시지는 template만 서술한다. 기록은 결함이나 변경을 template에 관한 사실, 즉 입력, 동작, 기대 동작으로 적고, 보고자, 출처, template을 쓰는 제품이나 program을 적지 않는다. 그런 사실을 담지 않는 문장은 지운다.
  Enforced by: none, the wording of records is a judgement.

## 필수 검사

- 개발에서는 unit test만 실행한다. 작업이 진행 중일 때는 변경을 소유한 Red와 Green unit test를 실행한다. 개발 중에도, commit이나 push 전에도 전체 검사나 end-to-end 검사를 로컬에서 실행하지 않는다. `make check`, `make rerun-failed`, `make owner-check`, conformance runner, browser test, VS Code integration test가 그렇다. CI가 `main`에 대한 모든 push와 모든 수동 실행에서 이것을 실행하며(`.github/workflows/ci.yml`), job마다의 report(`var/report`)가 모든 실패를 log와 함께 밝힌다. 새 경로는 같은 변경에서 `config/owner-checks.json`에 owner를 얻고, owner check는 CI에서 실행된다.
  Enforced by: none, a local run is not observed by a tool.
- `.github/workflows/ci.yml`의 job들은 `main`에 대한 모든 push와 모든 수동 실행(`workflow_dispatch`)에서 전체 suite, 곧 `CHECK_TARGETS`의 target을 실행한다. 각 job은 자기 target을 `make ci-targets TARGETS="..."`로 실행하고, `CHECK_TARGETS`의 모든 target은 정확히 한 job에서 실행된다(`tests/scripts/suite-parity.test.mts`). `make check`는 같은 suite를 한 checkout에서 tree마다 한 번 실행하며, guard `node_modules/@polyspec/kit/dist/full-run.mjs`가 어떤 단계보다 먼저 이를 강제한다. 작업이 `[~]`이거나, 추적 파일의 변경이 커밋되지 않았거나, `var/full-run.json`이 현재 tree의 전체 실행을 기록하고 있으면 `make check`는 거부된다. `make rerun-failed`는 현재 tree에서 통과하지 못한 target만 다시 실행한다(`docs/operations/development.md`).
  Enforced by: `make test-scripts`
- push는 push되는 commit에도 working tree에도 `[~]` 작업이 없을 때만 한다. pre-push hook `.githooks/pre-push`는 `make push-gate-hook`으로 push gate를 실행하고, 이 gate는 그런 push를 거부하며 각 작업을 밝힌다. 모든 make 실행은 `core.hooksPath`를 `.githooks`로 설정한다. `make hooks`는 hook을 설치하고 검사하며, `make hooks-check`는 hook이 설치되지 않았을 때 실패하고, guard는 hook이 없으면 `make check`를 거부한다. target `push-gate-commit`은 `.github/workflows/ci.yml`의 job `docs`에서 push된 commit에 같은 gate를 실행한다(`docs/operations/development.md`).
  Enforced by: `make push-gate-hook`
- 버전 0.x는 `main`에서 바로 작업한다. pull request, merge queue, GitHub ruleset은 없다. checklist 행마다 로컬에서 작업한다. 소유 unit test가 통과하면 행이 `[o]`가 되고, 그 changelog 항목과 commit을 함께 남긴다. `main`은 checklist의 모든 행이 `[o]`일 때에만 한 번 push하며, force-push는 하지 않는다. CI는 그 push에서 전체 suite를 실행하고, 릴리스는 그 실행의 job `ci-passed`가 성공한 뒤에만 그 commit에 tag를 붙인다(릴리스).
  Enforced by: `make ci-passed`
- 모든 test는 실행 중에 시작, 결과, 경과 시간을 출력하고 자기 timeout을 가진다. 실행 전체, package, 파일에 시간 제한을 두지 않는다. 수십 분 걸리는 test와 시작과 끝만 출력하는 test는 결함이다.
  Enforced by: none, the output of a test is a judgement.
- build, `tsc` type check, 설치, download, program 설치나 실행, 실행 전체 같은 오래 걸리는 작업은 단계마다 log 줄을 출력하고 timeout을 두지 않으며, 출력이 없는 시간의 deadline도 두지 않는다. 성공과 실패는 exit status, 결과, 오류로 판단한다. 시간 제한은 예상보다 느린 정상 실행을 실패시키기 때문이다. test case는 짧은 검증 단위이므로 자기 timeout을 유지한다.
  Enforced by: none, the output of an operation is a judgement.

## 릴리스

- 릴리스는 CI 실행이 성공한 `main`의 commit에 붙인 tag이다. `.github/workflows/ci.yml`의 job `ci-passed`는 그 실행의 다른 모든 job이 통과했을 때만 통과한다. tag를 만들고 옮기고 push하는 것은 메인테이너뿐이다(T22.1-4).
  Enforced by: `make release-verify`
- 버전 올림 commit `chore(release): Release X.Y.Z (#task)`는 `config/release.json`의 `manifests`가 나열한 모든 manifest(루트 `package.json`, npm 패키지, VS Code 확장, Rust crate와 Python 패키지(`packages/python/pyproject.toml`), `package-lock.json`, `packages/rust/Cargo.lock`. `composer.json`에는 `version` field가 없고 버전을 tag에서 받는다)의 버전을 X.Y.Z로 정하고, `CHANGELOG.md`와 `CHANGELOG.ko.md`의 `## Unreleased`를 `## X.Y.Z`로 바꾸며 그 위에 비어 있는 새 `## Unreleased`를 둔다.
  Enforced by: `make release-versions`
- 그 commit을 `main`으로 가져온 push의 CI 실행이 성공한 뒤, 메인테이너는 그 commit에 `vX.Y.Z` tag를, Go module에는 `packages/go/vX.Y.Z` tag를 붙이고 tag를 push한다. tag push는 `.github/workflows/release.yml`을 실행한다. 이 workflow는 tag된 commit이 `main`에 있고 check `ci-passed`를 통과했는지, 모든 manifest에 tag의 버전이 있고 `CHANGELOG.md`에 section `## X.Y.Z`가 있는지 확인하고, `<package>-<language>-<version>.<ext>`(`polyspec-template-npm-X.Y.Z.tgz`)라는 이름의 패키지 archive를 만들어 GitHub Release를 생성한다(`docs/operations/publication.md`).
  Enforced by: `make release-verify`

## 생성 파일

- 생성 파일은 Git에 추적하지 않습니다. 여기에는 의존성 설치(`node_modules/`, `vendor/`, 가상 환경), 빌드 산출물(`dist/`, `target/`, `*.tsbuildinfo`), 캐시(`.cache/`, `__pycache__/`, `.pytest_cache/`), 테스트 실행 산출물(`test-results/`, `playwright-report/`, PHPUnit 캐시), 도구 다운로드(`var/`)가 포함됩니다. 예외는 저장소가 의도적으로 필요로 하는 파일뿐이며 이것만 추적합니다: lock 파일(`package-lock.json`, `composer.lock`, `Cargo.lock`, uv lock, `mise.lock`), 이 문서가 밝히는 커밋된 생성 문서, 테스트 fixture. 각 `.gitignore`가 이 경로를 덮으며, 새 생성기는 같은 commit에서 ignore 항목을 추가합니다.
  Enforced by: `make staged-generated-hook`

## Checklist

- 이 저장소의 checklist는 `docs/plans/execution/checklist.md` 하나다. 작업을 하위 항목으로 나누거나 작업을 추가하고, 다른 checklist를 만들지 않는다. 저장소마다 자기 checklist를 따로 운영한다.
  Enforced by: `make docs-check`
- 웨이브의 계획, 의존 관계, 작업의 원인, 완료 기준, 완료 정의와 그 증거는 `docs/plans/execution/plan.md`에 둔다. checklist에는 작업만 둔다.
  Enforced by: `make docs-check`
- `[!]`는 이 작업을 우회하지 않으면 다음 작업을 진행할 수 없을 때만 쓴다. 재시도 조건이 성립하면 승인을 기다리지 않고 재개한다. `[!]`는 완료가 아니다. 감사는 `[!]` 작업과 그 원인·재시도 조건만 다루고, 관련 없는 full test를 반복하지 않는다.
  Enforced by: `make docs-check`
- 독립 작업은 병렬로 진행해도 되지만, 새 작업을 시작하는 것보다 진행 중인 작업을 끝내는 것이 먼저다. `[~]`가 아니라 `[o]`가 계속 늘어나야 한다.
  Enforced by: none, the order of tasks is a judgement.
- 지시를 받으면 먼저 checklist의 작업인지, 이 파일의 규칙인지, agent memory에 둘 일인지, 답변만 할 일인지 분류한다. agent memory에는 요청자와 agent가 session 사이에 알아야 하는 것만 두고, project가 남겨야 하는 것은 저장소(문서, 주석, 커밋 메시지)에 둔다. 지시가 급하다고 명시하지 않는 한, 우선순위와 함께 작업으로 기록하고 진행 중인 작업을 계속한다. 규칙은 이 파일에 중복 없이 두고, checklist나 changelog에는 넣지 않는다.
  Enforced by: none, the classification is a judgement.
