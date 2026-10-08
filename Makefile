# Build, test and documentation targets. Every target is idempotent.

# make install-tools installs the npm of packageManager in package.json and the Go of packages/template-go/go.mod into
# var/tools (scripts/install-tools.mjs); their wrappers in var/tools/bin come first, so every recipe uses the tools of
# the checkout and never the npm or Go of the machine (T19.2). GOTOOLCHAIN=local keeps go from downloading another
# toolchain at run time.
export PATH := $(CURDIR)/var/tools/bin:$(HOME)/.cargo/bin:$(PATH)
export GOTOOLCHAIN := local
# go builds into the build cache of the checkout, never into a cache that other checkouts and runs share (T19.14).
export GOCACHE := $(CURDIR)/var/go/cache
# GNU Make 3.81 starts a recipe line without shell syntax itself and finds its program with the PATH that make started
# with, not the exported PATH above, also when SHELL names another shell: a line `npm ci` ran the npm of the machine. A
# recipe therefore starts npm by the path of its wrapper, $(NPM), and go and gofmt only in lines that the shell runs,
# which finds them with the exported PATH (T19.2). A script that a recipe starts gets the exported PATH.
NPM := $(CURDIR)/var/tools/bin/npm
# make install installs the Rust toolchain of rust-toolchain.toml; rustup does not install it on the first cargo, which
# several processes start at once in one run and whose installs then break each other (T18.7-1). A missing toolchain
# fails with rustup's message, which names rustup toolchain install.
export RUSTUP_AUTO_INSTALL := 0
CARGO ?= $(HOME)/.cargo/bin/cargo
# Each checkout builds its Rust crates into their own target. A CARGO_TARGET_DIR inherited from the environment, such as
# the target of another checkout, would let cargo judge binaries built from other sources fresh for this one (T18.7).
unexport CARGO_TARGET_DIR
# A check makes no registry query whose result depends on time, and downloads only what a lock pins by exact version and
# integrity (AGENTS): make install downloads what the checks read, and every recipe and the scripts that it starts run
# cargo, go, npm and Composer offline, so a missing download fails at once instead of reaching a registry in one run and
# not in another (T20.1-2). The targets that resolve or download, install, install-tools, dependency-review and
# release-consumer-lock, run their commands with $(ONLINE); the install test of the release assets runs npm ci of its
# committed lock online (scripts/release-consumer.mjs).
export CARGO_NET_OFFLINE := true
export GOPROXY := off
export npm_config_offline := true
export COMPOSER_DISABLE_NETWORK := 1
ONLINE := env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK

# Git runs the hooks of core.hooksPath. Every make invocation sets it to the tracked hooks in .githooks, whose pre-push
# hook runs the push gate scripts/push-gate.mjs (T17.1-3); `make hooks` installs and checks it.
ifneq ($(shell git config core.hooksPath),.githooks)
$(shell git config core.hooksPath .githooks)
endif

.DEFAULT_GOAL := help
# make keeps going after a failed target and fails at the end, so one run reports every failure (T19.8). A target that
# runs several checks names them as prerequisites of one command each, because make stops a recipe at its first
# failed command; a prerequisite that fails keeps the targets that depend on it from running.
MAKEFLAGS += -k
.PHONY: help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php test-scripts runtime-interface-generate runtime-interface-check compiler-interface-generate compiler-interface-check feature-check \
	conformance delimiter-matrix parity test-browser ext ext-arginfo test-ext rules-check editor-boundary-check schema-check doc-coverage docs-check docs docs-verify-idempotent \
	conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-all-modes generated-native-check \
	contract-generate contract-check compiler-ir-check typed-generator typed-generator-check typed-generator-compile-check install-check showcase showcase-check showcase-compile language-test-matrix \
	bench benchmark-check benchmark-smoke template-function-inventory function-contract-check dependency-policy-check dependency-audit release-test-matrix release-check docs-static-check clean \
	install install-tools lint-js build-language test-language build-lsp test-lsp build-codemirror test-codemirror format-check format-external-check install-cli build-vscode test-vscode test-vscode-integration vscode-package vscode-install install-vscode install-browsers ci-targets cargo-downloads-check uninstall-cli rerun-failed \
	owner-check conformance-cases function-inventory-check dependency-review hooks hooks-check push-gate-commit github-ruleset github-ruleset-check ci-passed \
	release-verify release-versions release-assets release-publish release-consumer-lock

SHOWCASE_LANGS  ?= ts,go,rust,php

TS_DIR   := packages/template-ts
GO_DIR   := packages/template-go
RUST_DIR := packages/template-rust
PHP_DIR  := packages/template-php
EXT_DIR  := packages/template-php-ext
# The builds that the checks run, published by scripts/publish-build.mjs only when their bytes change: cargo links
# target/release again on every build, and macOS checks a new executable file on its first run (T19.6-1). The C PHP
# extension is built by phpize as polyspec_template.so on every platform (T21.4).
EXT_LIBRARY := var/build/polyspec_template.so
SHOWCASE_RUST := tools/showcase/adapters/rust
LANGUAGE_DIR := packages/template-language
LSP_DIR      := packages/template-lsp
VSCODE_DIR := packages/template-vscode
CODEMIRROR_DIR := packages/template-codemirror
# The VS Code build of the integration test, installed by make install-vscode (scripts/install-vscode.mjs) after make
# install and only read by the test, which never downloads (T20.1-4). Only a run of the test needs it (T20.1-6).
VSCODE_TOOLS := $(CURDIR)/var/tools/vscode
VSIX       := $(VSCODE_DIR)/dist/polyspec-template.vsix
# The prefix of `make install-cli`: the formatter copy in $(CLI_PREFIX)/lib and the script in $(CLI_PREFIX)/bin.
CLI_PREFIX ?= $(HOME)/.local

# npm installs every dependency, also every package of this repository, as a copy and writes no bin link
# (.npmrc, T18.4), so the recipes start each tool with the file of its package.
TSC        := node $(CURDIR)/node_modules/typescript/bin/tsc
# The esbuild package replaces bin/esbuild with the executable of the platform when it installs.
ESLINT     := node $(CURDIR)/node_modules/eslint/bin/eslint.js
VITEPRESS  := node $(CURDIR)/node_modules/vitepress/bin/vitepress.js
VITEST     := node $(CURDIR)/node_modules/vitest/vitest.mjs
PLAYWRIGHT := node $(CURDIR)/node_modules/@playwright/test/cli.js
VSCE       := node $(CURDIR)/node_modules/@vscode/vsce/vsce
TMGRAMMAR  := node $(CURDIR)/node_modules/vscode-tmgrammar-test/dist/unit.js

help: ## List targets
	@echo "Targets:"
	@echo "  check                  The full suite through scripts/full-run.mjs: once per tree, when no checklist task is [~]"
	@echo "  rerun-failed           Rerun the targets of check that did not pass on the current tree"
	@echo "  hooks                  Set core.hooksPath to .githooks and check the pre-push hook of the push gate"
	@echo "  hooks-check            Fail while core.hooksPath is not .githooks or .githooks/pre-push is not executable"
	@echo "  push-gate-commit       The push gate of CI on COMMIT (HEAD): fail while it has a task [~] or no executable pre-push hook"
	@echo "  github-ruleset         Change the GitHub ruleset and repository settings of .github/ruleset.json where they differ"
	@echo "  github-ruleset-check   Fail when the live GitHub ruleset or repository settings differ from .github/ruleset.json"
	@echo "  owner-check            The owner checks of the changed paths (scripts/owner-checks.json); PATHS or BASE select the paths"
	@echo "  conformance-cases      Conformance in all modes for the cases of CASES only"
	@echo "  lint                   eslint, gofmt, cargo fmt --check, Rust showcase warnings, pint --test"
	@echo "  lint-js                eslint on the TypeScript sources"
	@echo "  install                install-tools; npm ci: every dependency as a copy, no bin links; the Rust toolchain of rust-toolchain.toml"
	@echo "  install-tools          npm of package.json packageManager and Go of go.mod into var/tools, first on PATH"
	@echo "  build-ts|go|rust|php   Build one package"
	@echo "  test-ts|go|rust|php    Unit tests of one package"
	@echo "  test-scripts           Tests of the test runner and the conformance runners"
	@echo "  conformance            Cross-language conformance suite (tests/runner/conformance.mjs)"
	@echo "  parity                 Cross-language output comparison without expected files"
	@echo "  test-browser           Browser rendering test (Playwright)"
	@echo "  ext / test-ext         Build and test the PHP extension"
	@echo "  ext-arginfo            Generate the arginfo header of the C extension from its stub with gen_stub.php"
	@echo "  rules-check            Check case.json rule identifiers against docs/spec"
	@echo "  editor-boundary-check  Check the editor layer boundaries (EDT-2, EDT-3)"
	@echo "  doc-coverage           Check that public symbols carry documentation comments"
	@echo "  schema-check           Validate schema/ast.schema.json and every expected.ast.json"
	@echo "  docs-check             Document links, translation pairs, code blocks, status fields"
	@echo "  contract-check         Generate and verify the cross-language showcase contract"
	@echo "  docs                   Build the documentation site"
	@echo "  docs-verify-idempotent Build the documentation site twice and compare"
	@echo "  docs-static-check      Build the static site and verify its entry page"
	@echo "  showcase               Build the example site, parity proof and benchmark artifact"
	@echo "  showcase-compile       Generate committed canonical AST artifacts"
	@echo "  showcase-check         Verify example artifacts, parity and static HTML structure"
	@echo "  install-check         Install package artifacts and compare AST/generated output"
	@echo "  bench                  Measure equal-output AST/generated production artifacts"
	@echo "  release-test-matrix    The full suite of make check through the same guard"
	@echo "  release-check          Install and test HEAD in an isolated clean worktree"
	@echo "  dependency-audit       The dependency gate, which also rejects a lock with an advisory at its review"
	@echo "  dependency-policy-check Check manifests and locks against the policy and the review record, without a network"
	@echo "  dependency-review      Ask the registries for newer stable releases and advisories; RECORD=1 records the review, UPDATE=1 updates first"
	@echo "  build-language           Build the formatter library and the template-fmt CLI"
	@echo "  test-language            Formatter, safety invariant and CLI tests, type check"
	@echo "  build-lsp              Build the language server template-lsp"
	@echo "  test-lsp               Language server protocol tests against the editor fixtures, type check"
	@echo "  format-check           Run template-fmt --check on the formatter fixtures"
	@echo "  format-external-check  Run the safety invariant on TEMPLATE_SOURCE_ROOT"
	@echo "  install-cli            Install a copy of the formatter and the script template-fmt under CLI_PREFIX (~/.local)"
	@echo "  uninstall-cli          Remove them"
	@echo "  build-codemirror       Build the CodeMirror 6 adapter"
	@echo "  test-codemirror        CodeMirror adapter tests against the editor fixtures, browser test, type check"
	@echo "  build-vscode           Bundle the VS Code extension"
	@echo "  test-vscode            Grammar tests, extension tests and type check"
	@echo "  test-vscode-integration Run the extension inside the VS Code that make install-vscode installs into var/tools/vscode"
	@echo "  vscode-package         Build the .vsix with vsce"
	@echo "  vscode-install         Install the .vsix into the local VS Code"
	@echo "  clean                  Remove build outputs"

# The targets of the full suite, the one list of every runner: `make check`, `make release-test-matrix` and `make
# release-check` in a clean checkout run them through the guard scripts/full-run.mjs, which refuses while a checklist
# task is [~], while tracked changes are uncommitted or when var/full-run.json records a run of the current tree, runs
# each target with `make <target>` to its end and records its result; `make rerun-failed` reruns the targets of the
# current tree that did not pass. The jobs of the CI workflow run each target of the list in exactly one job with `make
# ci-targets` (T17.1-10), so the list names the targets that the jobs run, such as lint-js and conformance-ts. The list
# stays on one line: scripts/owner-check.mjs reads it.
CHECK_TARGETS := docs-check docs-static-check test-scripts rules-check editor-boundary-check runtime-interface-check compiler-interface-check feature-check dependency-audit language-test-matrix contract-check function-contract-check function-inventory-check benchmark-check lint-js lint-go lint-rust lint-showcase-format lint-showcase-warnings lint-php test-ts test-language test-lsp test-codemirror format-check test-vscode test-vscode-integration test-go test-rust test-php conformance-ts conformance-go conformance-rust conformance-php conformance-python test-python conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python delimiter-matrix generated-native-check test-ext typed-generator-compile-check install-check test-browser showcase-check benchmark-smoke docs-verify-idempotent

check: ## Full check through the guard: once per tree, when no checklist task is [~]
	node scripts/full-run.mjs run $(CHECK_TARGETS)

rerun-failed: ## Rerun only the targets of make check that did not pass on the current tree
	node scripts/full-run.mjs rerun-failed

lint: lint-js lint-go lint-rust lint-showcase-format lint-showcase-warnings lint-php ## Lint every package

.PHONY: lint-go lint-rust lint-showcase-format lint-showcase-warnings lint-php
lint-go:
	@out=$$(gofmt -l $(GO_DIR)) || exit 1; test -z "$$out" || { echo "gofmt -l $(GO_DIR) lists files that are not formatted:"; echo "$$out"; exit 1; }
lint-rust:
	$(CARGO) fmt --manifest-path $(RUST_DIR)/Cargo.toml --check
lint-showcase-format:
	$(CARGO) fmt --manifest-path $(SHOWCASE_RUST)/Cargo.toml --check
lint-showcase-warnings: cargo-downloads-check
	$(CARGO) rustc --locked --manifest-path $(SHOWCASE_RUST)/Cargo.toml --bin showcase-adapter-rust -- -D warnings
lint-php: build-php
	$(PHP_DIR)/vendor/bin/pint --test --config $(PHP_DIR)/pint.json $(PHP_DIR)

lint-js: ## Lint the TypeScript sources with eslint
	$(ESLINT) packages/template-ts/src packages/template-language/src packages/template-lsp/src packages/template-codemirror/src packages/template-vscode/src

# make install also downloads the crates of every Cargo.lock into the registry of CARGO_HOME: the generated checks and
# runners resolve their temporary crates with cargo --offline, which finds a crate only when an earlier cargo command
# downloaded it, so whether they passed depended on which cargo command ran first (T20.1-1).
install: install-tools ## Install the tools of the checkout, the npm dependencies as copies without bin links (.npmrc), the Rust toolchain of rust-toolchain.toml, the Composer packages and the crates of every Cargo.lock
	$(ONLINE) $(NPM) ci
	rustup toolchain install --no-self-update
	$(ONLINE) node scripts/composer-install.mjs $(PHP_DIR)
	$(ONLINE) node scripts/composer-install.mjs $(EXT_DIR)
	$(ONLINE) $(CARGO) fetch --locked --manifest-path $(RUST_DIR)/Cargo.toml
	$(ONLINE) $(CARGO) fetch --locked --manifest-path $(SHOWCASE_RUST)/Cargo.toml

# The recipes run cargo offline, and cargo answers a missing crate with "retry without --offline"; this check names the
# lock and the fix, make install, and every target that runs cargo depends on it (T20.1-5).
install-vscode: ## Install the VS Code of the integration test into var/tools/vscode, after make install
	$(ONLINE) node scripts/install-vscode.mjs $(VSCODE_TOOLS)

# The CI jobs run their targets with make ci-targets: each target runs to its end also after a failure, and the report
# in var/report/ci-targets holds the log of each target and a summary of the failures, which the job uploads (T20.1-9).
ci-targets: ## Run TARGETS past failures and write their logs and summary to var/report/ci-targets
	node scripts/ci-targets.mjs $(CURDIR)/var/report/ci-targets $(TARGETS)

# ci-passed is the step of the job ci-passed, the last job of .github/workflows/ci.yml and its check that the ruleset main
# requires: it fails unless every job of RESULTS, the JSON of needs, has the result success (T22.1-3). make passes a
# variable of its command line to the environment of the recipe, so the script reads RESULTS there and the JSON never
# becomes shell text.
ci-passed: ## Fail unless every job of RESULTS, the JSON of needs of the job ci-passed, has the result success
	node scripts/ci-passed.mjs

# The steps of .github/workflows/release.yml for the tag TAG (scripts/release.mjs, T22.1-4), in this order: release-verify
# requires the tagged commit on origin/main with the checks push-gate and ci-passed passed, release-versions the version
# of the tag in every manifest and its section in CHANGELOG.md, release-assets builds the npm packages and packs the npm
# tarballs and Composer zips into var/release/assets, and release-publish creates the GitHub Release. The workflow sets
# TAG in the environment, and the recipe passes it as "$$TAG", so the name of a tag never becomes shell text. A Go module
# tag <directory>/vX.Y.Z builds and attaches nothing, so release-assets builds the npm packages only for a tag without /
# (T22.1-5).
release-verify release-versions release-assets release-publish: ## A step of the release of the tag TAG (release.yml)
	$(if $(TAG),,$(error make $@ needs TAG=<tag>, a tag vX.Y.Z or packages/template-go/vX.Y.Z))
	node scripts/release.mjs $(@:release-%=%) "$$TAG"
release-assets: $(if $(findstring /,$(TAG)),,build-ts build-language build-lsp build-codemirror)

# The locks of the consumer projects of tests/fixtures/release-consumer, written from their manifests and the archives of
# the built packages of the tree (scripts/release-consumer.mjs, T22.3-1); a release that changes the version runs it.
release-consumer-lock: build-ts build-language build-lsp build-codemirror ## Write the locks of the consumer projects of the release assets
	$(ONLINE) node scripts/release-consumer.mjs lock

install-browsers: ## Install the Chromium of Playwright and its system packages, after make install
	$(ONLINE) $(PLAYWRIGHT) install --with-deps chromium

cargo-downloads-check: ## Check that the crates of every Cargo.lock are downloaded; names make install otherwise
	node scripts/check-cargo-downloads.mjs

install-tools: ## Install npm and Go of the checkout into var/tools; skipped when the exact versions are present
	$(ONLINE) node scripts/install-tools.mjs

build-ts: ## Build the TypeScript package
	node scripts/build-package.mjs --package template-ts --install

build-go: ## Build the Go CLI
	cd $(GO_DIR) && go build -o template ./cmd/template && cd $(CURDIR) && node scripts/publish-build.mjs $(GO_DIR)/template var/build/template-go

build-rust: cargo-downloads-check ## Build the Rust CLI
	$(CARGO) build --locked --release --manifest-path $(RUST_DIR)/Cargo.toml && node scripts/publish-build.mjs $(RUST_DIR)/target/release/template var/build/template-rust

build-php: ## Install PHP dependencies
	node scripts/composer-install.mjs $(PHP_DIR)

test-ts: test-ts-unit test-ts-types test-ts-types-node ## TypeScript unit tests and type check

.PHONY: test-ts-unit test-ts-types test-ts-types-node
test-ts-unit: build-ts
	node scripts/run-tests.mjs vitest --cwd $(TS_DIR)
test-ts-types: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.json
test-ts-types-node: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.node.json

test-go: test-go-vet test-go-unit ## Go unit tests

.PHONY: test-go-vet test-go-unit
test-go-vet:
	cd $(GO_DIR) && go vet ./...
test-go-unit:
	node scripts/run-tests.mjs go --cwd $(GO_DIR) -- -race ./...

test-rust: test-rust-clippy test-rust-unit ## Rust clippy and tests

.PHONY: test-rust-clippy test-rust-unit
test-rust-clippy: cargo-downloads-check
	$(CARGO) clippy --locked --release --manifest-path $(RUST_DIR)/Cargo.toml -- -D warnings
test-rust-unit: cargo-downloads-check
	node scripts/run-tests.mjs cargo --cwd $(RUST_DIR) -- --locked

test-php: build-php ## PHP unit tests
	node scripts/run-tests.mjs phpunit --cwd $(PHP_DIR)

test-scripts: cargo-downloads-check build-ts build-language build-lsp build-codemirror build-php ## Tests of the test runner and the conformance runners
	node scripts/run-tests.mjs node -- tests/scripts/

build-language: build-ts ## Build the formatter library and the template-fmt CLI
	node scripts/build-package.mjs --package template-language --install

test-language: test-language-unit test-language-types ## Formatter, safety invariant and CLI tests, type check

.PHONY: test-language-unit test-language-types
test-language-unit: build-language
	node scripts/run-tests.mjs vitest --cwd $(LANGUAGE_DIR)
test-language-types: build-language
	$(TSC) --noEmit -p $(LANGUAGE_DIR)/tsconfig.json

build-lsp: build-language ## Build the language server template-lsp
	node scripts/build-package.mjs --package template-lsp --install

test-lsp: test-lsp-unit test-lsp-types ## Language server protocol tests against the editor fixtures, type check

.PHONY: test-lsp-unit test-lsp-types
test-lsp-unit: build-lsp
	node scripts/run-tests.mjs vitest --cwd $(LSP_DIR)
test-lsp-types: build-lsp
	$(TSC) --noEmit -p $(LSP_DIR)/tsconfig.json

format-check: build-language ## Check that the formatter fixtures are formatted
	node $(LANGUAGE_DIR)/bin/template-fmt.mjs --check $(LANGUAGE_DIR)/tests/fixtures/expected

format-external-check: build-language ## Run the formatter safety invariant on an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	cd $(LANGUAGE_DIR) && TEMPLATE_SOURCE_ROOT="$(abspath $(TEMPLATE_SOURCE_ROOT))" $(VITEST) run tests/invariant.test.ts

build-codemirror: build-language ## Build the CodeMirror 6 adapter
	node scripts/build-package.mjs --package template-codemirror --install

test-codemirror: test-codemirror-unit test-codemirror-browser test-codemirror-types ## CodeMirror adapter tests against the editor fixtures, browser test, type check

.PHONY: test-codemirror-unit test-codemirror-browser test-codemirror-types
test-codemirror-unit: build-codemirror
	node scripts/run-tests.mjs vitest --cwd $(CODEMIRROR_DIR)
test-codemirror-browser: build-codemirror
	cd $(CODEMIRROR_DIR) && $(PLAYWRIGHT) test
test-codemirror-types: build-codemirror
	$(TSC) --noEmit -p $(CODEMIRROR_DIR)/tsconfig.json

install-cli: build-language ## Install a copy of the formatter and the script $(CLI_PREFIX)/bin/template-fmt
	node scripts/install-cli.mjs install --prefix $(CLI_PREFIX)

uninstall-cli: ## Remove the formatter copy and the script template-fmt of $(CLI_PREFIX)
	node scripts/install-cli.mjs uninstall --prefix $(CLI_PREFIX)

build-vscode: build-lsp ## Bundle the VS Code extension
	node scripts/build-package.mjs --package template-vscode

test-vscode: test-vscode-grammar test-vscode-unit test-vscode-types ## Grammar tests, extension tests and type check

.PHONY: test-vscode-grammar test-vscode-unit test-vscode-types
test-vscode-grammar: build-vscode
	cd $(VSCODE_DIR) && $(TMGRAMMAR) --config package.json -g ../../node_modules/tm-grammars/grammars/html.json -g ../../node_modules/tm-grammars/grammars/css.json -g ../../node_modules/tm-grammars/grammars/javascript.json "tests/grammar/*.tpl"
test-vscode-unit: build-vscode
	node scripts/run-tests.mjs node --cwd $(VSCODE_DIR) -- tests/extension.test.mjs tests/integration-step.test.mjs tests/integration-wait.test.mjs
test-vscode-types: build-vscode
	$(TSC) --noEmit -p $(VSCODE_DIR)/tsconfig.json

test-vscode-integration: vscode-package ## Run the extension inside the minimum supported VS Code
	cd $(VSCODE_DIR) && node tests/integration/run.mjs --vscode $(VSCODE_TOOLS)

vscode-package: build-vscode ## Build the .vsix
	cd $(VSCODE_DIR) && $(VSCE) package --no-dependencies --skip-license --out dist/polyspec-template.vsix

vscode-install: vscode-package ## Install the .vsix into the local VS Code
	code --install-extension $(VSIX) --force

conformance: cargo-downloads-check build-ts build-go build-rust build-php ext ## Cross-language conformance suite (builds every implementation first)
	node tests/runner/conformance.mjs

# The conformance of TypeScript and one other language, as the language jobs of CI run it (T20.1-8).
.PHONY: conformance-ts conformance-go conformance-rust conformance-php conformance-python
conformance-ts: cargo-downloads-check build-ts ## Conformance suite of TypeScript
	node tests/runner/conformance.mjs --langs ts
conformance-go: cargo-downloads-check build-ts build-go ## Conformance suite of TypeScript and Go
	node tests/runner/conformance.mjs --langs ts,go
conformance-rust: cargo-downloads-check build-ts build-rust ## Conformance suite of TypeScript and Rust
	node tests/runner/conformance.mjs --langs ts,rust
conformance-php: cargo-downloads-check build-ts build-php ## Conformance suite of TypeScript and PHP
	node tests/runner/conformance.mjs --langs ts,php

delimiter-matrix: cargo-downloads-check build-ts build-go build-rust build-php ## Exercise every valid delimiter pair in every language
	node tests/runner/delimiter-matrix.mjs

conformance-generated-ts: build-ts ## TypeScript generated compiler conformance suite
	node tests/runner/conformance-generated-ts.mjs

conformance-generated-go: build-ts ## Go generated compiler conformance suite
	node tests/runner/conformance-generated-go.mjs

conformance-generated-rust: cargo-downloads-check build-ts ## Rust generated compiler conformance suite
	node tests/runner/conformance-generated-rust.mjs

conformance-generated-php: build-ts build-php ## PHP generated compiler conformance suite
	node tests/runner/conformance-generated-php.mjs

conformance-python: cargo-downloads-check build-ts ## Conformance suite of TypeScript and Python
	node tests/runner/conformance.mjs --langs ts,python

test-python: ## Unit tests of the Python package
	status=0; for test in packages/template-python/tests/test_api.py packages/template-python/tests/test_exports.py packages/template-python/tests/test_package_data.py packages/template-python/tests/test_object_calls.py packages/template-python/tests/test_expr_fixtures.py packages/template-python/tests/test_function_contract.py packages/template-python/tests/test_compiler_interface.py; do python3 $$test || status=1; done; exit $$status

conformance-generated-python: build-ts ## Python generated compiler conformance suite
	node tests/runner/conformance-generated-python.mjs

conformance-all-modes: conformance conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python ## AST and generated conformance in every language

conformance-cases: cargo-downloads-check build-ts build-go build-rust build-php ext ## AST and generated conformance in every language for the cases of CASES only
	node scripts/conformance-cases.mjs $(CASES)

function-inventory-check: ## Inventory the function-shaped calls of the fixture template
	node tests/runner/function-inventory.mjs

hooks: ## Set core.hooksPath to .githooks and check the pre-push hook of the push gate
	git config core.hooksPath .githooks
	node scripts/push-gate.mjs hooks-check

hooks-check: ## Fail while core.hooksPath is not .githooks or .githooks/pre-push is not executable
	node scripts/push-gate.mjs hooks-check

# The job push-gate of .github/workflows/push-gate.yml runs this target on the pushed commit (T17.1-3).
COMMIT ?= HEAD
push-gate-commit: ## Fail while COMMIT (HEAD) has a checklist task [~] or does not track an executable pre-push hook
	node scripts/push-gate.mjs commit $(COMMIT)

# The GitHub CLI of the machine, authenticated with administration access to the repository; only the targets
# github-ruleset and github-ruleset-check start it.
GH := gh
# The GitHub ruleset main and the repository settings of .github/ruleset.json (scripts/github-ruleset.mjs): main receives
# a change only through a pull request and the merge queue, after every required check passed on the merge group, and no
# target of this repository pushes main (T17.1-7). These targets reach the GitHub API, so no target of the full suite
# runs them.
github-ruleset: ## Change the repository settings and create or update the ruleset of .github/ruleset.json where they differ, then compare again
	node scripts/github-ruleset.mjs apply --gh $(GH)

github-ruleset-check: ## Fail when the live repository settings or ruleset differ from .github/ruleset.json, naming each field
	node scripts/github-ruleset.mjs check --gh $(GH)

owner-check: hooks-check ## Run the owner checks of the changed paths: PATHS, the paths since BASE, or the uncommitted changes
	node scripts/owner-check.mjs $(if $(PATHS),--paths "$(PATHS)") $(if $(BASE),--base "$(BASE)")

install-check: install-workspace-check package-installs-check ## Install immutable package artifacts in isolated install projects

.PHONY: install-workspace-check package-installs-check
install-workspace-check:
	node scripts/check-install-workspace.mjs
package-installs-check: cargo-downloads-check typed-generator
	node scripts/check-package-installs.mjs

parity: cargo-downloads-check build-ts build-go build-rust build-php ## Cross-language output comparison
	node tests/runner/parity.mjs

test-browser: build-ts ## Browser rendering test
	node tests/browser/run.mjs

# The PHP extension is a C implementation in $(EXT_DIR)/src: scripts/build-php-extension.mjs builds it with phpize,
# configure and make of the php-config of PATH in a temporary directory, with every compiler warning as an error, and
# publishes the library by rename when its bytes change; it does nothing for unchanged inputs (T21.1, T21.4).
ext: ## Build the PHP extension
	node scripts/build-php-extension.mjs $(EXT_DIR)/src $(EXT_LIBRARY)

test-ext: test-ext-conformance test-ext-unit ## Test the PHP extension

# The C extension in $(EXT_DIR)/src declares its PHP classes in polyspec_template.stub.php; gen_stub.php of the PHP
# build generates polyspec_template_arginfo.h from it, which is committed for builds from the package (T21.1).
ext-arginfo: ## Generate the arginfo header of the C extension from its stub with gen_stub.php
	node scripts/build-php-extension.mjs --arginfo $(EXT_DIR)/src

.PHONY: build-ext-php test-ext-conformance test-ext-unit
build-ext-php:
	node scripts/composer-install.mjs $(EXT_DIR)
test-ext-conformance: cargo-downloads-check ext
	node tests/runner/conformance.mjs --langs php-ext
test-ext-unit: ext build-ext-php
	node scripts/run-tests.mjs phpunit --php-extension $(EXT_LIBRARY) --cwd $(EXT_DIR)

rules-check: ## Check case.json rule identifiers against the specification
	node scripts/check-rules.mjs

editor-boundary-check: ## Check that adapters do not use the parser and the language service uses no editor, Node.js or DOM module
	node scripts/check-editor-boundaries.mjs

# The dependency gate reads only the files of the checkout: the manifests, the locks, config/dependency-policy.json and
# the review record config/dependency-review.json, so one tree gives one result at any time. make dependency-review asks
# the registries; it is a developer command and a scheduled workflow, not a step of make check or of the gating CI jobs.
dependency-policy-check: dependency-policy-state-check dependency-policy-mutation-check ## Check manifests and locks against the policy and the review record, without a network

.PHONY: dependency-policy-state-check dependency-policy-mutation-check
dependency-policy-state-check:
	node scripts/check-dependency-policy.mjs
dependency-policy-mutation-check:
	node scripts/check-dependency-policy-mutation.mjs

dependency-audit: dependency-policy-check ## The dependency gate, which also rejects a lock with an advisory at its review

dependency-review: install-tools ## Ask the registries for newer stable releases and advisories; RECORD=1 records the review, UPDATE=1 updates first
	$(ONLINE) node scripts/dependency-review.mjs $(if $(RECORD),--record) $(if $(UPDATE),--update)

doc-coverage: ## Check that public symbols carry documentation comments
	node scripts/check-doc-coverage.mjs

schema-check: schema-fixtures-check schema-mutations-check ## Validate the AST schema and fixtures

.PHONY: schema-fixtures-check schema-mutations-check
schema-fixtures-check:
	node scripts/check-schema.mjs
schema-mutations-check:
	node scripts/check-schema-mutations.mjs

docs-check: runtime-interface-diagrams-check compiler-interface-diagrams-check showcase-contract-diagrams-check documents-check schema-check doc-coverage benchmark-docs-check feature-check ## Document checks

.PHONY: runtime-interface-diagrams-check compiler-interface-diagrams-check showcase-contract-diagrams-check documents-check benchmark-docs-check feature-pages-check feature-contracts-check
runtime-interface-diagrams-check:
	node scripts/generate-runtime-interface.mjs --check
compiler-interface-diagrams-check:
	node scripts/generate-compiler-interface.mjs --check
showcase-contract-diagrams-check:
	node scripts/generate-showcase-contract.mjs --check
documents-check:
	node scripts/check-documents.mjs
benchmark-docs-check:
	node scripts/update-benchmark-docs.mjs --check

feature-check: feature-pages-check feature-contracts-check ## Validate executable feature contracts and generated status pages
feature-pages-check:
	node scripts/features/build.mjs --check
feature-contracts-check:
	node scripts/features/check.mjs

runtime-interface-generate: ## Generate the runtime prepared-execution Mermaid diagrams
	node scripts/generate-runtime-interface.mjs

runtime-interface-check: runtime-interface-diagrams-check runtime-interface-runtimes-check ## Verify the prepared render interface in every runtime

.PHONY: runtime-interface-runtimes-check
runtime-interface-runtimes-check: build-php
	node scripts/check-runtime-interface.mjs

compiler-interface-generate: ## Generate the typed compiler Mermaid diagrams
	node scripts/generate-compiler-interface.mjs

compiler-interface-check: compiler-interface-diagrams-check compiler-interface-languages-check compiler-interface-mutations-check ## Verify the typed generated module structure in every language

.PHONY: compiler-interface-languages-check compiler-interface-mutations-check
compiler-interface-languages-check: cargo-downloads-check build-php
	node scripts/check-compiler-interface.mjs
compiler-interface-mutations-check: cargo-downloads-check build-php
	node scripts/check-compiler-interface-mutations.mjs

docs: ## Build the documentation site
	$(VITEPRESS) build docs

# The copy of the first build goes into a directory of this run outside the checkout, which the recipe removes, so two
# runs never share it (T19.7).
docs-verify-idempotent: docs ## Build the documentation site twice and compare
	@first=$$(mktemp -d) || exit 1; cp -R docs/.vitepress/dist "$$first/dist" && $(VITEPRESS) build docs && diff -r "$$first/dist" docs/.vitepress/dist; status=$$?; rm -rf "$$first"; exit $$status

docs-static-check: docs ## Build the documentation site as static files
	node scripts/check-docs-static.mjs

contract-generate: ## Generate showcase declarations and Mermaid diagrams
	node scripts/generate-showcase-contract.mjs

contract-check: cargo-downloads-check build-ts build-php ## Verify generated declarations, implementations and runtime state recovery
	node scripts/check-showcase-contract.mjs

showcase: cargo-downloads-check typed-generator build-php ## Build the executable example site and its result artifacts
	node tools/showcase/build.mjs --write --langs $(SHOWCASE_LANGS)
	node scripts/check-showcase-contract.mjs
	node tools/showcase/benchmark-modes.mjs --output examples/site/data/mode-benchmark.json
	node scripts/check-benchmark-results.mjs
	node scripts/update-benchmark-docs.mjs
	node tools/showcase/build-site.mjs

bench: cargo-downloads-check typed-generator build-php ## Measure production AST and generated artifacts
	node tools/showcase/benchmark-modes.mjs --output examples/site/data/mode-benchmark.json
	node scripts/check-benchmark-results.mjs
	node scripts/update-benchmark-docs.mjs

benchmark-check: benchmark-results-check benchmark-docs-check ## Verify committed benchmark structure and equal output

.PHONY: benchmark-results-check
benchmark-results-check:
	node scripts/check-benchmark-results.mjs

benchmark-smoke: cargo-downloads-check typed-generator build-php ## Measure a fresh short equal-output sample without changing committed results
	node scripts/check-benchmark-smoke.mjs

template-function-inventory: ## Inventory function-shaped calls in an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	node scripts/inventory-template-functions.mjs --root "$(TEMPLATE_SOURCE_ROOT)"

function-contract-check: function-contract-registries-check function-contract-runtimes-check ## Check the canonical function contract against all language registries

.PHONY: function-contract-registries-check function-contract-runtimes-check
function-contract-registries-check:
	node scripts/check-function-contract.mjs
function-contract-runtimes-check:
	node tests/runner/function-contract.mjs

language-test-matrix: language-test-matrix-manifest-check language-test-matrix-mutations-check ## Verify the manifest requires equal semantic test coverage

.PHONY: language-test-matrix-manifest-check language-test-matrix-mutations-check
language-test-matrix-manifest-check:
	node scripts/check-language-test-matrix.mjs
language-test-matrix-mutations-check:
	node scripts/check-language-test-matrix-mutations.mjs

release-test-matrix: ## The full suite of make check through the same guard: every target of CHECK_TARGETS to its end
	node scripts/full-run.mjs run $(CHECK_TARGETS)

release-check: ## Install and run the release matrix in an isolated clean worktree
	node scripts/check-clean-release.mjs

showcase-check: artifact-digest-check typed-generator-compile-check showcase-build-check contract-check showcase-site-check showcase-html-check ## Verify example-site parity, repeatability and browser output

.PHONY: artifact-digest-check showcase-ast-check showcase-build-check showcase-site-check showcase-html-check
# The committed artifacts record the digest of the compiler that built them; the check reads only tracked sources, so the
# job push-gate runs it (T17.1-6).
artifact-digest-check: ## Fail when a committed compiled artifact records the digest of another compiler; names make showcase
	node scripts/check-artifact-digests.mjs
showcase-ast-check: build-ts
	node tools/showcase/compile.mjs --refresh false
showcase-build-check: cargo-downloads-check showcase-ast-check build-php
	node tools/showcase/build.mjs --check --langs $(SHOWCASE_LANGS)
showcase-site-check: build-ts
	node tools/showcase/build-site.mjs --check
showcase-html-check: build-ts
	node scripts/check-showcase-html.mjs

showcase-compile: build-ts ## Generate committed canonical AST artifacts
	node tools/showcase/compile.mjs --refresh true

generated-native-check: generated-native-calls-check generated-typed-values-check generated-arguments-check generated-bound-data-check ## Execute generated member and class calls with native, typed and bound values, and typed request argument errors, in every core language

.PHONY: generated-native-calls-check generated-typed-values-check generated-arguments-check generated-bound-data-check
generated-native-calls-check: cargo-downloads-check build-ts build-php
	node scripts/check-generated-native-calls.mjs
generated-typed-values-check: cargo-downloads-check build-ts build-php
	node scripts/check-generated-typed-values.mjs
generated-arguments-check: cargo-downloads-check build-ts build-php
	node scripts/check-generated-arguments.mjs
generated-bound-data-check: cargo-downloads-check build-ts build-php
	node scripts/check-generated-bound-data.mjs

typed-generator: showcase-compile ## Generate type-fixed host source from canonical AST
	node tools/showcase/compile-generated.mjs --refresh true

typed-generator-check: showcase-ast-check ## Verify type-fixed generated source is reproducible
	node tools/showcase/compile-generated.mjs --refresh dev --check

compiler-ir-check: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check ## Verify canonical AST coverage and type/scope rejection in the shared compiler IR

.PHONY: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check
ast-artifact-check: build-ts
	node scripts/check-ast-artifact.mjs
generated-artifact-check: build-ts
	node scripts/check-generated-artifact.mjs
compiler-ir-rules-check: build-ts
	node scripts/check-compiler-ir.mjs
conformance-type-manifest-check: build-ts
	node scripts/check-conformance-type-manifest.mjs

typed-generator-compile-check: cargo-downloads-check build-php compiler-ir-check typed-generator-check ## Compile-check all type-fixed generated sources
	node scripts/check-typed-generator.mjs

clean: ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(LANGUAGE_DIR)/dist packages/*/dist.inputs.json packages/*/dist.next-* $(LSP_DIR)/dist $(CODEMIRROR_DIR)/dist $(VSCODE_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target tools/showcase/adapters/rust/target docs/.vitepress/dist var/build var/go

