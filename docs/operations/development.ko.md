<!-- doc-id: docs-operations-development -->
<!-- source-sha256: 202e0442e90b4ddc8598a1bac08145e978872f7b380d6be4b9713d712764f4c6 -->
# 개발

[English](/operations/development).

## 툴체인

| 도구 | 버전 | 출처 |
| --- | --- | --- |
| Node.js | 26.11.1 | kit의 pin인 `.node-version`; 모든 `package.json`의 `engines.node`는 `>=26.11.1` |
| npm | 12.2.0 | `package.json`의 `packageManager`; `make install-tools`가 `var/tools`에 설치 |
| Go | 1.27.2 | 모든 `go.mod`의 go directive가 toolchain 줄 없이 같아야 하는 kit의 pin; `make install-tools`가 `var/tools`에 설치 |
| Rust | rustfmt와 clippy를 포함한 1.99.0 | 모든 Cargo package의 `rust-version`이 같아야 하는 kit의 pin인 `rust-toolchain.toml`; rustup으로 설치, Makefile이 `~/.cargo/bin`을 `PATH`에 추가 |
| PHP | 8.5 | kit의 pin인 `config/toolchain.json`의 minor version; 모든 `composer.json`의 `require.php`는 `>=8.5`, `config.platform.php`는 `8.5`; 각 실행의 patch는 각 CI job의 report에 기록 |
| Composer | 2.10.3 | `config/toolchain.json` |
| Python | 3.14 | `.python-version`의 minor version; `make install`은 `config/toolchain.json`의 `pythonBuild` 중 그 minor의 Python release를 설치하고, Python을 실행하는 모든 검사는 wrapper `var/tools/bin/python3`(`scripts/python-toolchain.mjs`)를 실행하며, `PATH`의 `python3`는 실행하지 않음; CI job은 자체 Python을 설정하지 않고, CI job `python`은 그 minor만 실행하며 이는 `requires-python`이 명시 |
| ruff | 0.17.0 | `config/toolchain.json`의 `ruff`(플랫폼별 wheel의 sha256 포함); `make install-tools TOOLS=ruff`가 Python `var/tools/bin/python3`의 environment에 설치하며, kit이 복사하는 root `ruff.toml`이 규칙과 target version을 선언; 어떤 package도 자기 ruff 설정을 갖지 않음(T24.5) |
| make | 고정하지 않음 | GNU Make 3.81 이상 |

공유 도구는 npm package `@polyspec/kit`에서 온다. `make install-tools TOOLS=npm`은 kit이 `scripts/kit/bootstrap/`에 복사하는 bootstrap installer를 실행한다. 이것은 `packageManager`의 npm을 `var/tools/npm`에 설치하고 wrapper script `var/tools/bin/npm`과 `var/tools/bin/npx`를 쓴다. `make install-packages`는 그 npm으로 `@polyspec/kit`을 포함한 `package-lock.json`을 설치하며, 복사본 `scripts/kit/kit-bootstrap.mk`가 그 package의 `kit.mk`를 include한다. package가 설치되기 전에는 이 두 target만 실행된다. 그 뒤 `make install`은 `make install-tools TOOLS="go uv python"`(`node_modules/@polyspec/kit/dist/install-tools.mjs`)을 실행하며, 이것은 kit pin의 Go를 sha256으로 확인한 archive에서, uv를 release archive에서 설치하고, 그 uv로 `pythonBuild`의 Python release를 wrapper `var/tools/bin/python3`와 함께 설치한다. `make install-tools TOOLS=ruff`는 그 Python의 environment에 ruff를 설치한다. 설치는 `var/tools/bin`에 wrapper script를 쓰고 정확한 version이 있는 도구는 건너뛴다. recipe는 machine의 Python을 실행하지 않고, machine의 npm, Go, Python은 바꾸지 않는다. Makefile은 `var/tools/bin`을 `PATH`의 맨 앞에 두고 `GOTOOLCHAIN=local`을 export하므로 go는 다른 toolchain을 내려받지 않고, `GOCACHE=var/go/cache`를 export하므로 go는 다른 checkout이나 실행과 함께 쓰는 cache가 아니라 checkout의 build cache에 build한다. GNU Make 3.81은 shell 문법이 없는 recipe 줄을 직접 시작하고, `SHELL`이 다른 shell을 가리켜도 export된 `PATH`가 아니라 make가 시작할 때의 `PATH`로 program을 찾는다. 그래서 recipe는 npm을 wrapper의 경로인 `$(NPM)`으로 시작하고, go와 gofmt는 shell 문법이 있는 줄에서만 시작하며, shell은 export된 `PATH`로 그것을 찾는다. `make owner-check`가 모든 변경에 실행하는 `tests/scripts/toolchain-files.test.mjs`는 recipe의 Node.js, npm, Go, Rust, PHP minor version, Composer가 이 파일들과 다르면 기대값과 실제값을 적어 실패한다.

PHP는 minor version으로 고정한다. CI에서 PHP를 설치하는 setup-php는 minor version의 최신 patch를 설치하고 patch를 고정할 수 없다. `make ci-targets`의 각 실행은 자기가 실행된 version을 PHP patch까지 report의 `record.json`과 `summary.md`에 기록하고 모든 CI job이 그 report를 upload한다. Composer는 정확히 고정한다(workflow의 `composer:2.10.3`). make는 고정하지 않는다. Makefile은 GNU Make 3.81보다 새로운 구문을 쓰지 않고, make 3.81과 GNU Make 4.4.1은 모든 target에 같은 명령을 출력했다(T17.1-4). CI job은 `ubuntu-24.04`에서 실행되고, 모든 action을 commit으로 고정하며, `make install-tools TOOLS=npm`, `make install-packages`, `make install`로 설치한다. 어떤 job도 자기 Go를 설정하지 않는다.

PHP 확장 `packages/template-php-ext`는 C 구현이다. `make ext`는 `config/toolchain.json`의 모든 PHP version에서 `PATH`의 php-config로 phpize, configure, make를 실행해 빌드한다. 이 php-config는 test를 실행하는 `PATH`의 php와 같은 PHP여야 하며, CI는 둘 다 setup-php로 설치한다. `make ext-arginfo`는 PHP build의 gen_stub.php로 stub에서 arginfo header를 만든다.

## 명령

```sh
make install
make help
make check
make rerun-failed
make owner-check
```

`make owner-check`는 바뀐 경로의 owner check를 실행한다. 경로는 commit하지 않은 변경, `PATHS`의 경로, 또는 `BASE` 이후 바뀐 경로다. `config/owner-checks.json`은 경로 glob마다 그것을 소유하는 make target과 node test file, 그리고 모든 변경에 실행하는 test(`always`)를 선언한다. script는 같은 파일의 `inputs`는 검사 target마다 그것이 읽는 경로의 glob을 선언한다. 예를 들어 `lint-go`는 `packages/template-go/**`를, `conformance-generated-go`는 `packages/template-compiler/**`를 읽는다. input의 모든 경로에는 그 target이나 그것을 prerequisite로 실행하는 target을 선택하는 규칙이 있어야 하므로, 경로를 바꾸면 그것을 읽는 모든 검사가 실행된다. 어떤 owner보다 먼저, 어느 규칙도 소유하지 않는 tracked 경로, 규칙이 그 target을 선택하지 않는 input 경로, 아무 경로에도 맞지 않는 glob, Makefile에 없는 target, 전체 suite를 실행하는 target에서 실패하고, 각 실패는 그 경로, glob, target을 적는다. `variable`이 있는 규칙은 바뀐 경로를 target에 넘긴다. `tests/cases` 아래 변경은 `make conformance-cases CASES="<paths>"`를 실행하고, 이 target은 그 case에 대해서만 AST conformance와 생성 conformance runner 넷을 실행한다. `make check`의 conformance target들은 모든 case를 실행한다.

`make install`은 `make install-tools TOOLS="go uv python"`, `rust-toolchain.toml`이 지정한 Rust toolchain을 설치하고 이미 설치되어 있으면 아무것도 바꾸지 않는 `rustup toolchain install --no-self-update`, 모든 `Cargo.lock`의 crate를 내려받는 `make cargo-downloads-fetch`를 실행한다. Makefile은 `RUSTUP_AUTO_INSTALL=0`을 export하고 CI workflow도 이를 설정하므로 rustup은 첫 cargo에서 toolchain을 설치하지 않는다. 한 `node --test` 실행의 test file들이 cargo를 동시에 시작했고, 그 동시 설치가 서로를 깨뜨렸다(T18.7-1). toolchain이 없으면 rustup이 `rustup toolchain install`을 적은 `toolchain '...' is not installed` 메시지로 실패한다. root `package.json`은 `packages/`의 JavaScript package를 npm workspace로 선언하고 모든 package의 개발 도구를 가진다. npm은 각 workspace package를 `node_modules`에, package의 명령을 `node_modules/.bin`에 link하며, recipe는 TypeScript, tsup, esbuild, Vitest, Playwright, VitePress, vsce, vscode-tmgrammar-test를 거기서 실행한다(script는 `scripts/tools.mjs`). 그래서 package는 다른 package의 build를 build가 쓰는 곳에서 읽는다(T24.2). `make install`은 `scripts/python-wheelhouse.mjs`도 실행하며, 이것은 `packages/template-python/build-requirements.json`이 SHA-256으로 고정한 build requirement를 `var/python/wheelhouse`에 내려받고, package install check는 이 directory로 Python wheel을 offline build한다.

`make build-ts`, `make build-language`, `make build-lsp`, `make build-codemirror`, `make build-vscode`는 `scripts/build-package.mjs --package <package>`를 실행한다. 이 script는 입력의 hash가 `packages/<package>/dist.inputs.json`에 기록된 hash와 다를 때만 package를 빌드하고, 같으면 `dist`가 최신이라고 출력하므로 `make check` 한 번은 package마다 많아야 한 번 빌드한다. 입력은 package의 소스와 설정, manifest, root `package-lock.json`, package가 의존하는 이 저장소 package의 설치된 사본, Node.js version이다. 빌드는 `packages/<package>/dist.next-<pid>`에 쓰고 각 file을 rename으로 `dist`에 옮기되 file은 그것이 import하는 상대 module 뒤에 옮기므로 entry가 마지막에 옮겨지고, 그 뒤 새 빌드에 없는 이전 빌드의 file을 지운다. package를 복사하는 다른 저장소나 실행의 다음 target 같은 `dist`의 reader는 빠진 file을 보지 않는다. 한계: 바뀐 소스의 빌드가 내보내는 동안 여러 file을 읽는 reader는 두 빌드의 file을 섞어 읽을 수 있다. 예를 들어 새 빌드가 지운 chunk를 쓰는 이전 빌드의 entry다. 입력이 같은 다시 빌드는 같은 file을 쓴다. `--install`이면 `node_modules`의 npm 사본은 그 file이 package와 다를 때만 같은 방식으로 다시 설치한다. 다른 file마다 `node_modules/<name>.next-<pid>`에 쓰고 rename으로 사본에 옮기되 file은 그것이 import하는 상대 module 뒤에, `package.json`은 마지막에 옮기며, 그 뒤 package에 더는 없는 file을 지운다. 그래서 같은 `node --test` 실행의 다른 test file 같은 사본의 reader는 빠진 file을 보지 않는다. package 의존성의 변경은 `package-lock.json`의 변경이므로, 그때 설치는 실패하고 고치는 방법으로 `npm install`을 적는다. `tests/scripts/build-package.test.mjs`는 자기가 의존하는 package를 직접 빌드하고 설치하므로 아무것도 빌드하지 않은 checkout에서도 통과한다.

`make check`는 아래에 설명한 guard를 거쳐 `push-gate-commit`, `kit-check`, `lint-python`, `docs-check`, `docs-static-check`, `test-scripts`, `rules-check`, `editor-boundary-check`, `runtime-interface-check`, `compiler-interface-check`, `parity-declarations-check`, `parity-check`, `dependency-audit`, `contract-check`, `function-contract-check`, `function-inventory-check`, `benchmark-check`, `lint-ts`, `lint-go`, `lint-rust`, `lint-go-format`, `lint-rust-format`, `lint-showcase-format`, `lint-showcase-warnings`, `lint-php`, `lint-php-format`, `test-ts`, `test-language`, `test-lsp`, `test-codemirror`, `format-check`, `test-vscode`, `test-vscode-integration`, `test-go`, `test-rust`, `test-php`, `test-python`, `conformance-ts`, `conformance-go`, `conformance-rust`, `conformance-php`, `conformance-python`, `conformance-generated-ts`, `conformance-generated-go`, `conformance-generated-rust`, `conformance-generated-php`, `conformance-generated-python`, `delimiter-matrix`, `generated-native-check`, `test-ext`, `typed-generator-compile-check`, `install-check`, `test-browser`, `showcase-check`, `benchmark-smoke`, `docs-verify-idempotent`를 실행한다. 그중 `install-check`, `test-browser`, `showcase-check`, `benchmark-smoke` 같은 릴리스 계층은 `make check`를 통과한 변경이 릴리스 매트릭스에서 실패하면 안 되므로 `make check`에 포함한다. 전체 suite의 target과 그 prerequisite는 모두 명령을 많아야 하나 실행한다. 검사가 여럿인 target은 `lint`의 `lint-go`와 `lint-php`처럼 그것들을 prerequisite로 적고, Makefile은 `MAKEFLAGS += -k`를 설정하므로 make는 실패한 검사 뒤의 모든 검사를 실행하고 끝에서 실패한다. 실패한 prerequisite는 그것에 의존하는 target을 실행하지 않게 한다. 언어마다 검사하는 script(`scripts/check-generated-*.mjs`, `scripts/check-typed-generator.mjs`, `scripts/check-package-installs.mjs`)는 `scripts/language-checks.mjs`의 `checkLanguages`로 모든 언어를 실행하고 실패한 언어를 모두 밝힌다. `tests/scripts/failure-accumulation.test.mjs`가 이 규칙을 검사한다. `lint`는 kit이 복사하는 설정으로 kit의 lint target을 실행한다(T24.6). `lint-ts`는 oxlint-tsgolint와 함께 oxlint(`.oxlintrc.json`)와 knip(`knip.json`)을, `lint-go`는 각 Go module에서 golangci-lint(`.golangci.yml`)와 deadcode를, `lint-rust`는 각 Cargo workspace에서 clippy를, `lint-php`는 phpcs(`phpcs.xml.dist`)와 PHPStan(`phpstan.dist.neon`)을, `lint-python`은 ruff(`ruff.toml`)와 vulture를 실행한다. template의 format check는 `lint-go-format`(gofmt), `lint-rust-format`과 `lint-showcase-format`(`cargo fmt --check`), `lint-php-format`(Pint)이며, `lint-showcase-warnings`는 Rust showcase adapter를 경고를 오류로 처리해 컴파일한다. `test-rust`와 `test-ext`는 Rust 크레이트와 PHP 확장에 경고를 오류로 처리하는 clippy를 실행한다.

`make check`는 `docs/plans/execution-checklist.md`의 작업 중 `[~]`인 것이 없을 때, 커밋된 tree마다 한 번 실행된다. 어떤 단계보다 먼저 `node_modules/@polyspec/kit/dist/full-run.mjs`를 시작하며, 이 guard는 판단을 이유와 함께 출력하고(`[full-run] run: ...` 또는 `[full-run] refuse: ...`) 다음의 경우 status 1로 거부한다.

- checklist의 작업 행이 `[~]`일 때. 거부 메시지는 활성 ID를 작업과 함께 나열한다.
- pre-push hook이 설치되지 않았을 때. 즉 `core.hooksPath`가 `.githooks`가 아니거나 `.githooks/pre-push`가 실행 파일이 아닐 때. 거부 메시지는 해결 방법으로 `make hooks`를 밝힌다.
- 추적 파일에 커밋되지 않은 변경이 있거나 무시되지 않은 untracked 파일이 있을 때. record는 둘 다 담지 않는 tree를 이름으로 삼기 때문이다.
- `var/full-run.json`이 현재 tree(`git rev-parse HEAD^{tree}`)의 전체 실행을 기록하고 있을 때. 거부 메시지는 그 실행을 commit, 시작 시각, 결과와 함께 밝힌다.
- `incomplete` record의 process가 아직 실행 중일 때.
- 다른 실행의 guard가 record의 holder lock `var/full-run.lock`(`node_modules/@polyspec/kit/dist/holder-lock.mjs`)을 쥐고 있을 때. guard는 record를 읽기 전에 이 lock을 잡고 마지막으로 쓴 뒤에 놓으며, target이 예외를 던져도 놓으므로, 두 guard가 같은 record로 결정하거나 번갈아 쓰지 않는다. 거부 메시지는 holder를 밝히고, `node node_modules/@polyspec/kit/dist/holder-lock.mjs clear var/full-run.lock`은 process가 끝난 lock을 지운다.

guard는 `CHECK_TARGETS`의 각 target을 `make -k <target>`으로 끝까지 실행하며, target이 실패한 뒤에도 계속하고, `[full-run] start <target> (<n>/<total>)`와 `[full-run] <target> passed|failed in <seconds> s`를 출력한다. 어떤 target에도 시간 제한이 없다. 각 target의 앞뒤에 `var/full-run.json`을 쓴다. 이 record는 tree, commit, process, 시작과 끝 시각, 결과(마지막 target이 끝날 때까지 `incomplete`, 그다음 `passed` 또는 `failed`), 실패한 target, 그리고 각 target의 상태(`pending`, `running`, `passed`, `failed`), 시각, 경과 millisecond를 담는다. 따라서 멈춘 실행은 실행 중이던 target과 함께 `incomplete`로 기록되어 남는다. `var/`는 Git이 무시하므로 checkout과 worktree마다 자기 record를 가진다. tree를 바꾸는 commit은 `[~]` 작업이 없을 때 새 전체 실행을 허용한다.

`make rerun-failed`는 현재 tree에서 통과하지 못한 target, 즉 실패한 target과 `incomplete` 실행이 끝내지 못한 target만 다시 실행한다. 진행 중인 작업, 설치되지 않은 pre-push hook, 커밋되지 않은 변경, 실행 중인 process에 대해서는 `make check`와 같이 거부되고, record가 없을 때, record가 다른 tree의 것일 때, 그 tree의 전체 실행이 통과했을 때도 거부된다. 각 재실행을 record의 `reruns`에 쓰고, 모든 target이 통과하면 그 tree의 결과는 `passed`가 된다.

개발에서는 unit test만 실행하고, 개발 중에도 commit이나 push 전에도 전체 검사나 end-to-end 검사를 로컬에서 실행하지 않는다. `make check`, `make rerun-failed`, `make owner-check`, conformance runner, browser test, VS Code integration test는 로컬에서 실행하지 않고, CI가 전체 suite를 실행한다. CI workflow(`.github/workflows/ci.yml`)는 `main`에 대한 push와 수동 실행(`workflow_dispatch`)마다 실행된다. 각 job은 `make ci-targets`로 자기 target을 실행하고, `CHECK_TARGETS`의 모든 target은 정확히 한 job에서 실행되며(`tests/scripts/suite-parity.test.mjs`), 모든 job은 log, 실패, toolchain version의 report(`var/report`)를 upload한다.

push는 `[~]` 작업이 없을 때만 한다. `.githooks/pre-push`를 추적하는 checkout의 모든 make 실행은 `core.hooksPath`를 추적되는 hook 디렉터리 `.githooks`로 설정한다. `make hooks`는 이를 설정하고 pre-push hook을 쓰며 hook을 검사하고, `make hooks-check`는 `core.hooksPath`가 `.githooks`가 아니거나 `.githooks/pre-push`가 없거나 실행 파일이 아니거나 바뀌었을 때 실패한다. pre-push hook은 `node node_modules/@polyspec/kit/dist/push-gate.mjs hook`을 실행하고, 이 script는 push되는 각 commit의 checklist(`git show <commit>:docs/plans/execution-checklist.md`)와 working tree의 checklist를 읽는다. 작업이 `[~]`인 동안 push를 거부하며 각 작업을 push되는 ref와 commit 또는 working tree와 함께 밝히고 `[ ]`, `[o]`, `[!]` 작업은 막지 않는다고 적는다. checklist가 없는 commit처럼 checklist를 읽을 수 없을 때, 그리고 한글 checklist가 영어 checklist와 작업 ID나 상태가 다를 때도 거부한다. 원격 branch의 삭제는 working tree만 읽는다. `make push-gate-commit`은 `node node_modules/@polyspec/kit/dist/push-gate.mjs commit HEAD`를 실행하며(`COMMIT`이 다른 commit을 지정한다), 그 commit의 작업이 `[~]`일 때, 그리고 commit이 `.githooks/pre-push`를 mode `100755`로 추적하지 않을 때 실패한다. 각 줄을 GitHub annotation으로 출력하고 job summary에 쓰며, `ci.yml`의 job `docs`가 push된 commit에 이것을 실행한다. 따라서 hook이 없는 clone이나 hook을 끈 push처럼 hook을 실행하지 않은 push는 작업을 밝히는 실패한 실행을 받는다.

버전 0.x는 `main`에서 바로 작업한다(AGENTS). pull request, merge queue, GitHub ruleset은 없다. checklist 행은 소유 unit test가 통과하면 `[o]`가 되고, `main`은 모든 행이 `[o]`일 때 한 번 push한다. 그 push에서 `.github/workflows/ci.yml`의 실행이 그 commit의 증거이다. 마지막 job `ci-passed`는 workflow의 다른 모든 job을 need로 가지고, 그중 하나가 실패하거나 skip되거나 취소되어도 그 모든 job 뒤에 실행되며(<code v-pre>if: ${{ always() }}</code>), <code v-pre>make ci-passed RESULTS='${{ toJSON(needs) }}'</code>(`node_modules/@polyspec/kit/dist/ci-passed.mjs`)를 실행한다. 이 명령은 need로 가진 모든 job의 결과를 출력하고, 하나라도 `success`가 아니면 실패한다. skip된 step은 check를 통과시키므로 그 step에는 조건이 없다. `ci.yml`에 추가한 job은 `needs`에 넣으며, `tests/scripts/toolchain-files.test.mjs`는 `ci-passed`가 없거나, 마지막 job이 아니거나, <code v-pre>if: ${{ always() }}</code>가 없거나, 다른 모든 job을 need로 가지지 않거나, 다른 runner에서 실행되거나, 다른 step을 실행하면 실패한다(T22.1-3). 더 새로운 push는 이전 push의 실행을 취소하지 않는다. workflow `.github/workflows/pages.yml`은 `main`에 대한 모든 push의 문서 site를 게시하고 수동 실행(`workflow_dispatch`)에서도 게시한다. `.github/workflows/dependency-review.yml`은 일정과 수동 실행에서 실행되며, `.github/workflows/release.yml`은 tag `v*` 또는 `**/v*`의 push에서만 실행되어 그 tag를 릴리스한다(`docs/operations/publication.md`).

`test-go`, `test-rust`, `test-php`, `test-ext`는 `go test`, `cargo test`, PHPUnit을 `node_modules/@polyspec/kit/dist/run-tests.mjs`로 실행하며, `test-ext`는 build된 extension을 PHPUnit의 PHP에 로드하는 `--php-extension`을 쓴다. `test-ts`, `test-language`, `test-lsp`, `test-codemirror`는 vitest를, `test-vscode`는 `node --test`를 이 runner로 실행한다. runner는 각 test가 시작할 때, 실행 중에는 5 s마다, 통과·실패·건너뜀으로 끝날 때 경과 시간과 함께 출력하고, test가 자기 timeout(30 s, `--timeout <seconds>`)을 넘으면 도구를 멈춘다. package, 파일, 실행 전체에는 시간 제한이 없다. `cargo test`는 test를 하나씩 실행하므로 각 test는 결과 전에 시작을 출력한다. PHPUnit도 10 s가 지난 test를 멈춘다(`enforceTimeLimit`, `failOnRisky`). build되지 않는 Go package는 compiler 출력과 `✖ build of <package> failed`를 출력하고, 요약 줄은 compiler error를 밝힌다. test가 하나도 실행되지 않은 실행은 `no test ran`으로 실패한다. test는 필요한 것이 build되지 않았을 때 자기를 건너뛰지 않고 그것을 build하며, conformance runner는 `--langs`가 언어를 지정하지 않으면 모든 언어를 실행하고 없는 package에서 실패한다. `test-scripts`는 `tests/scripts/`에 있는 runner의 test를 실행한다.

언어별 명령:

```sh
make test-ts
make test-go
make test-rust
make test-php
node tests/runner/conformance.mjs --langs ts,go
make parity-check
```

## 변경 절차

1. `docs/spec/`의 명세와 `.ko.md` 파일을 수정한다.
2. `tests/cases/`의 픽스처 케이스와 `tests/fixtures/expr/`의 표현식 픽스처를 추가하거나 수정한다.
3. 패키지에 실패 테스트를 추가하고, 코드를 수정하고, 테스트를 유지한다.
4. `docs/features.md`, `docs/features.ko.md`, `CHANGELOG.md`, `CHANGELOG.ko.md`를 갱신한다.
5. 변경을 소유한 Red와 Green test와 `make docs-check`를 실행한다.
6. 동작, 주체, 대상을 명시한 메시지로 커밋한다.
