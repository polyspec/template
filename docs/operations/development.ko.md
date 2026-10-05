# 개발

[English](/operations/development).

## 툴체인

| 도구 | 버전 | 출처 |
| --- | --- | --- |
| Node.js | 26.8.1 | `.node-version` |
| npm | 11 이상 | Node.js에 포함 |
| Go | 1.27.1 | `packages/template-go`의 `go.mod`; `GOTOOLCHAIN`이 내려받음 |
| Rust | rustfmt와 clippy를 포함한 1.98.1 | `rust-toolchain.toml`; rustup으로 설치, Makefile이 `~/.cargo/bin`을 `PATH`에 추가 |
| PHP | composer 2를 포함한 8.5 | `packages/template-php/composer.json` |

`packages/template-php-ext`의 Rust PHP 바인딩은 PHP 8.5를 지원한다. macOS에서는 확장을 로드하는 PHP 바이너리가 PHP 심볼을 제공하므로 확장을 `-Wl,-undefined,dynamic_lookup`으로 링크하며, 이 인자는 패키지의 빌드 스크립트가 내보낸다.

## 명령

```sh
make install
make help
make check
make rerun-failed
make owner-check
```

`make owner-check`는 바뀐 경로의 owner check를 실행한다. 경로는 commit하지 않은 변경, `PATHS`의 경로, 또는 `BASE` 이후 바뀐 경로다. `scripts/owner-checks.json`은 경로 glob마다 그것을 소유하는 make target과 node test file, 그리고 모든 변경에 실행하는 test(`always`)를 선언한다. script는 어떤 owner보다 먼저, 어느 규칙도 소유하지 않는 tracked 경로, 아무 경로에도 맞지 않는 glob, Makefile에 없는 target, 전체 suite를 실행하는 target에서 실패하고, 각 실패는 그 경로, glob, target을 적는다. `variable`이 있는 규칙은 바뀐 경로를 target에 넘긴다. `tests/cases` 아래 변경은 `make conformance-cases CASES="<paths>"`를 실행하고, 이 target은 그 case에 대해서만 AST conformance와 생성 conformance runner 넷을 실행한다. `conformance-all-modes`는 `make check`에서 모든 case를 실행한다.

`make install`은 `npm ci`와 `rustup toolchain install --no-self-update`를 실행한다. 후자는 `rust-toolchain.toml`이 지정한 Rust toolchain을 설치하고, 이미 설치되어 있으면 아무것도 바꾸지 않는다. Makefile은 `RUSTUP_AUTO_INSTALL=0`을 export하고 CI workflow도 이를 설정하므로 rustup은 첫 cargo에서 toolchain을 설치하지 않는다. 한 `node --test` 실행의 test file들이 cargo를 동시에 시작했고, 그 동시 설치가 서로를 깨뜨렸다(T18.7-1). toolchain이 없으면 rustup이 `rustup toolchain install`을 적은 `toolchain '...' is not installed` 메시지로 실패한다. npm은 모든 의존성을 사본으로 설치하고 bin link를 쓰지 않는다(`.npmrc`: `install-links=true`, `bin-links=false`). root `package.json`은 `packages/`의 다섯 package를 그 사이의 의존성에 대한 override와 함께 `file:` 의존성으로 선언하고 모든 package의 개발 도구를 가지며, npm은 workspace를 언제나 link하므로 npm workspace는 없다. 각 build target은 build 뒤 그 package의 npm 사본을 다시 설치하고(`make build-ts`는 `@polyspec/template`의 사본 등), recipe는 TypeScript, tsup, esbuild, Vitest, Playwright, ESLint, VitePress, vsce, vscode-tmgrammar-test를 그 package의 파일로 실행한다(script는 `scripts/tools.mjs`). `tests/scripts/no-symlinks.test.mjs`는 `node_modules`나 `vendor` 아래의 symbolic link 하나에도 실패한다.

`make build-ts`, `make build-language`, `make build-lsp`, `make build-codemirror`, `make build-vscode`는 `scripts/build-package.mjs --package <package>`를 실행한다. 이 script는 입력의 hash가 `packages/<package>/dist.inputs.json`에 기록된 hash와 다를 때만 package를 빌드하고, 같으면 `dist`가 최신이라고 출력하므로 `make check` 한 번은 package마다 많아야 한 번 빌드한다. 입력은 package의 소스와 설정, manifest, root `package-lock.json`, package가 의존하는 이 저장소 package의 설치된 사본, Node.js version이다. 빌드는 `packages/<package>/dist.next-<pid>`에 쓰고 각 file을 rename으로 `dist`에 옮기되 file은 그것이 import하는 상대 module 뒤에 옮기므로 entry가 마지막에 옮겨지고, 그 뒤 새 빌드에 없는 이전 빌드의 file을 지운다. package를 복사하는 다른 저장소나 실행의 다음 target 같은 `dist`의 reader는 빠진 file을 보지 않는다. 한계: 바뀐 소스의 빌드가 내보내는 동안 여러 file을 읽는 reader는 두 빌드의 file을 섞어 읽을 수 있다. 예를 들어 새 빌드가 지운 chunk를 쓰는 이전 빌드의 entry다. 입력이 같은 다시 빌드는 같은 file을 쓴다. `--install`이면 `node_modules`의 npm 사본은 그 file이 package와 다를 때만 같은 방식으로 다시 설치한다. 다른 file마다 `node_modules/<name>.next-<pid>`에 쓰고 rename으로 사본에 옮기되 file은 그것이 import하는 상대 module 뒤에, `package.json`은 마지막에 옮기며, 그 뒤 package에 더는 없는 file을 지운다. 그래서 같은 `node --test` 실행의 다른 test file 같은 사본의 reader는 빠진 file을 보지 않는다. package 의존성의 변경은 `package-lock.json`의 변경이므로, 그때 설치는 실패하고 고치는 방법으로 `npm install`을 적는다. `tests/scripts/build-package.test.mjs`는 자기가 의존하는 package를 직접 빌드하고 설치하므로 아무것도 빌드하지 않은 checkout에서도 통과한다.

`make check`는 아래에 설명한 guard를 거쳐 `docs-check`, `docs-static-check`, `test-scripts`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `feature-check`, `language-test-matrix`, `contract-check`, `function-contract-check`, `function-inventory-check`, `lint`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `conformance-all-modes`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser`, `showcase-check`를 실행한다. 마지막 네 개는 릴리스 계층이기도 하다. `make check`를 통과한 변경이 릴리스 매트릭스에서 실패하면 안 되므로 `make check`에 포함한다. 패키지가 아직 없는 타겟은 `not implemented`를 출력하고 상태 1로 종료한다. `lint`는 ESLint, gofmt, Rust 크레이트·PHP 확장·Rust showcase adapter의 `cargo fmt --check`를 실행하고, Rust showcase adapter를 경고를 오류로 처리해 컴파일하며, Pint를 실행한다. `test-rust`와 `test-ext`는 Rust 크레이트와 PHP 확장에 경고를 오류로 처리하는 clippy를 실행한다.

`make check`는 `docs/plans/execution-checklist.md`의 작업 중 `[~]`인 것이 없을 때, 커밋된 tree마다 한 번 실행된다. 어떤 단계보다 먼저 `scripts/full-run.mjs`를 시작하며, 이 guard는 판단을 이유와 함께 출력하고(`[full-run] run: ...` 또는 `[full-run] refuse: ...`) 다음의 경우 status 1로 거부한다.

- checklist의 작업 행이 `[~]`일 때. 거부 메시지는 활성 ID를 작업과 함께 나열한다.
- 추적 파일에 커밋되지 않은 변경이 있을 때(`git status --porcelain --untracked-files=no`). 전체 실행은 커밋된 tree를 검증하기 때문이다.
- `var/full-run.json`이 현재 tree(`git rev-parse HEAD^{tree}`)의 전체 실행을 기록하고 있을 때. 거부 메시지는 그 실행을 commit, 시작 시각, 결과와 함께 밝힌다.
- `incomplete` record의 process가 아직 실행 중일 때.

guard는 `CHECK_TARGETS`의 각 target을 `make <target>`으로 끝까지 실행하며, target이 실패한 뒤에도 계속하고, `[full-run] start <target> (<n>/<total>)`와 `[full-run] <target> passed|failed in <seconds> s`를 출력한다. 어떤 target에도 시간 제한이 없다. 각 target의 앞뒤에 `var/full-run.json`을 쓴다. 이 record는 tree, commit, process, 시작과 끝 시각, 결과(마지막 target이 끝날 때까지 `incomplete`, 그다음 `passed` 또는 `failed`), 실패한 target, 그리고 각 target의 상태(`pending`, `running`, `passed`, `failed`), 시각, 경과 millisecond를 담는다. 따라서 멈춘 실행은 실행 중이던 target과 함께 `incomplete`로 기록되어 남는다. `var/`는 Git이 무시하므로 checkout과 worktree마다 자기 record를 가진다. tree를 바꾸는 commit은 `[~]` 작업이 없을 때 새 전체 실행을 허용한다.

`make rerun-failed`는 현재 tree에서 통과하지 못한 target, 즉 실패한 target과 `incomplete` 실행이 끝내지 못한 target만 다시 실행한다. 진행 중인 작업, 커밋되지 않은 변경, 실행 중인 process에 대해서는 `make check`와 같이 거부되고, record가 없을 때, record가 다른 tree의 것일 때, 그 tree의 전체 실행이 통과했을 때도 거부된다. 각 재실행을 record의 `reruns`에 쓰고, 모든 target이 통과하면 그 tree의 결과는 `passed`가 된다.

CI workflow(`.github/workflows/ci.yml`)는 `main`으로의 push와 pull request마다 target을 별도 job에서 실행한다. `make check`를 실행하지 않으므로 guard는 CI 실행을 판단하지 않는다. push는 활성 작업이 모두 끝났을 때만 한다. CI처럼 새 checkout에는 record가 없으므로, 그곳에서 `make check`는 `[~]` 작업이 없고 tree가 깨끗하면 실행된다.

`test-go`, `test-rust`, `test-php`는 `go test`, `cargo test`, PHPUnit을 `scripts/run-tests.mjs`로 실행하고, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`는 vitest를, `test-vscode`는 `node --test`를 이 runner로 실행한다. runner는 각 test가 시작할 때, 실행 중에는 5 s마다, 통과·실패·건너뜀으로 끝날 때 경과 시간과 함께 출력하고, test가 자기 timeout(30 s, `--timeout <seconds>`)을 넘으면 도구를 멈춘다. package, 파일, 실행 전체에는 시간 제한이 없다. `cargo test`는 test를 하나씩 실행하므로 각 test는 결과 전에 시작을 출력한다. PHPUnit도 10 s가 지난 test를 멈춘다(`enforceTimeLimit`, `failOnRisky`). `test-scripts`는 `tests/scripts/`에 있는 runner의 test를 실행한다.

언어별 명령:

```sh
make test-ts
make test-go
make test-rust
make test-php
node tests/runner/conformance.mjs --langs ts,go
node tests/runner/parity.mjs
```

## 변경 절차

1. `docs/spec/`의 명세와 `.ko.md` 파일을 수정한다.
2. `tests/cases/`의 픽스처 케이스와 `tests/fixtures/expr/`의 표현식 픽스처를 추가하거나 수정한다.
3. 패키지에 실패 테스트를 추가하고, 코드를 수정하고, 테스트를 유지한다.
4. `docs/features.md`, `docs/features.ko.md`, `CHANGELOG.md`, `CHANGELOG.ko.md`를 갱신한다.
5. 변경을 소유한 Red와 Green test와 `make docs-check`를 실행한다.
6. 동작, 주체, 대상을 명시한 메시지로 커밋한다.
