# Build, test and documentation targets. Every target is idempotent.

# make install-tools TOOLS=npm installs the npm of packageManager in package.json and mise into var/tools/bin, and make
# install-tools (the install-tools tool of @polyspec/kit) installs the tools of mise.toml, Go and Python among them, at the
# digests of mise.lock into var/tools/mise (T24.12); var/tools/bin and the shims of mise come first, so every recipe uses
# the tools of the checkout and never the npm, Go or Python of the machine (T19.2).
# GOTOOLCHAIN=local keeps go from downloading another toolchain at run time.
export PATH := $(CURDIR)/var/tools/bin:$(HOME)/.cargo/bin:$(PATH)
export GOTOOLCHAIN := local
# go builds into the build cache of the checkout, never into a cache that other checkouts and runs share (T19.14).
export GOCACHE := $(CURDIR)/var/go/cache
# GNU Make 3.81 starts a recipe line without shell syntax itself and finds its program with the PATH that make started
# with, not the exported PATH above, also when SHELL names another shell: a line `npm ci` ran the npm of the machine. A
# recipe therefore starts npm by the path of its wrapper, $(NPM), and go and gofmt only in lines that the shell runs,
# which finds them with the exported PATH (T19.2). A script that a recipe starts gets the exported PATH.
NPM := $(CURDIR)/var/tools/bin/npm
# make install-tools installs the Rust toolchain of rust-toolchain.toml (kit K151); rustup does not install it on the
# first cargo, which several processes start at once in one run and whose installs then break each other (T18.7-1). A
# missing toolchain fails with rustup's message, which names rustup toolchain install.
export RUSTUP_AUTO_INSTALL := 0
CARGO ?= $(HOME)/.cargo/bin/cargo
# Each checkout builds its Rust crates into their own target. A CARGO_TARGET_DIR inherited from the environment, such as
# the target of another checkout, would let cargo judge binaries built from other sources fresh for this one (T18.7).
unexport CARGO_TARGET_DIR
# A check makes no registry query whose result depends on time, and downloads only what a lock pins by exact version and
# integrity (AGENTS): make install downloads what the checks read, and every recipe and the scripts that it starts run
# cargo, go, npm and Composer offline, so a missing download fails at once instead of reaching a registry in one run and
# not in another (T20.1-2). The targets that resolve or download, install, install-tools, dependency-review and
# release-consumer-lock, run their commands with $(ONLINE); make release-consumer installs the archives of a release with
# its committed locks online (the release-consumer tool of @polyspec/kit).
export CARGO_NET_OFFLINE := true
export GOPROXY := off
export npm_config_offline := true
export COMPOSER_DISABLE_NETWORK := 1
ONLINE := env -u CARGO_NET_OFFLINE -u GOPROXY -u npm_config_offline -u COMPOSER_DISABLE_NETWORK

.DEFAULT_GOAL := help
# make keeps going after a failed target and fails at the end, so one run reports every failure (T19.8). A target that
# runs several checks names them as prerequisites of one command each, because make stops a recipe at its first
# failed command; a prerequisite that fails keeps the targets that depend on it from running.
MAKEFLAGS += -k

# The shared targets of kit (kit-sync, kit-check, hooks, push-gate-commit, rerun-failed, documents-check, owner-check,
# ci-targets, ci-passed, release-*, dependency-*, install-tools, install-packages, toolchain-check, layout-check,
# cargo-downloads-check, lint-*) come from the npm package @polyspec/kit: scripts/kit/kit-bootstrap.mk, a copy that make
# kit-sync writes, includes the kit.mk of the installed package and runs its tools as node $(KIT)/<tool>.$(KIT_EXT). Only
# config/*.json differ between repositories.
include scripts/kit/kit-bootstrap.mk

.PHONY: help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php test-scripts compiler-interface-generate compiler-interface-check \
	conformance delimiter-matrix test-browser ext ext-arginfo test-ext rules-check editor-boundary-check schema-check doc-coverage docs-check docs docs-verify-idempotent \
	conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-all-modes generated-native-check \
	contract-generate contract-check compiler-ir-check typed-generator typed-generator-check typed-generator-compile-check install-check showcase showcase-check showcase-compile \
	bench benchmark-check benchmark-smoke template-function-inventory function-contract-check dependency-audit release-test-matrix release-check docs-static-check clean \
	install build-language test-language build-lsp test-lsp build-codemirror test-codemirror format-check format-external-check install-cli build-vscode test-vscode test-vscode-integration vscode-package vscode-install install-vscode install-browsers uninstall-cli \
	conformance-cases function-inventory-check typecheck

SHOWCASE_LANGS  ?= ts,go,rust,php,python

TS_DIR   := packages/ts
GO_DIR   := packages/go
# The Go that the Go backend of the compiler writes as it is, one definition per file; the folder is in no module, so go
# vet checks its files as one package and resolves their imports through go.work.
GO_BACKEND_DIR := packages/compiler/backends/go
RUST_DIR := packages/rust
PHP_DIR  := packages/php
EXT_DIR  := packages/php-ext
# The builds that the checks run, published by scripts/publish-build.mts only when their bytes change: cargo links
# target/release again on every build, and macOS checks a new executable file on its first run (T19.6-1). The C PHP
# extension is built by phpize as polyspec_template.so on every platform (T21.4).
EXT_LIBRARY := var/build/polyspec_template.so
SHOWCASE_RUST := examples/showcase/adapters/rust
LANGUAGE_DIR := packages/language
LSP_DIR      := packages/lsp
VSCODE_DIR := packages/vscode
CODEMIRROR_DIR := packages/codemirror
# The VS Code build of the integration test, installed by make install-vscode (the VS Code installer of kit) after make
# install and only read by the test, which never downloads (T20.1-4). Only a run of the test needs it (T20.1-6).
VSCODE_TOOLS := $(CURDIR)/var/tools/vscode
VSIX       := $(VSCODE_DIR)/dist/polyspec-template.vsix
# The prefix of `make install-cli`: the formatter copy in $(CLI_PREFIX)/lib and the script in $(CLI_PREFIX)/bin.
CLI_PREFIX ?= $(HOME)/.local

# npm links the workspace packages of this repository into node_modules and the commands of the packages into
# node_modules/.bin (T24.2); the recipes start each tool there.
TSC        := $(CURDIR)/node_modules/.bin/tsc
VITEPRESS  := $(CURDIR)/node_modules/.bin/vitepress
VITEST     := $(CURDIR)/node_modules/.bin/vitest
PLAYWRIGHT := $(CURDIR)/node_modules/.bin/playwright

help: ## List targets
	@echo "Targets:"
	@echo "  check                  The full suite through the full-run tool of @polyspec/kit: once per tree, when no checklist task is [~]"
	@echo "  kit-sync|kit-check|hooks|hooks-check|push-gate-commit|rerun-failed|owner-check|owner-validate|documents-check|layout-check|toolchain-check|ci-targets|install-tools|install-packages|dependency-policy-check|dependency-review|lint-python|release-*   Targets of the kit.mk of @polyspec/kit"
	@echo "  conformance-cases      Conformance in all modes for the cases of CASES only"
	@echo "  lint                   The lint targets of kit (lint-ts, lint-go, lint-rust, lint-php, lint-python), gofmt, cargo fmt --check, Rust showcase warnings and pint --test"
	@echo "  lint-python            ruff check and ruff format --check of the Python package (the lint-python tool of @polyspec/kit)"
	@echo "  lint-ts                oxlint with oxlint-tsgolint and knip on the TypeScript (the lint-ts tool of @polyspec/kit)"
	@echo "  install                After make install-tools TOOLS=npm and make install-packages: the tools of mise.lock, the Rust toolchain of rust-toolchain.toml, the crates, the Composer packages and the Python build requirements"
	@echo "  build-ts|go|rust|php   Build one package"
	@echo "  test-ts|go|rust|php    Unit tests of one package"
	@echo "  test-scripts           Tests of the test runner and the conformance runners"
	@echo "  typecheck              Type check of the TypeScript infrastructure (tsconfig.json, S9)"
	@echo "  conformance            Cross-language conformance suite (tests/runner/conformance.mts)"
	@echo "  test-browser           Browser rendering test (Playwright)"
	@echo "  ext / test-ext         Build and test the PHP extension"
	@echo "  ext-arginfo            Generate the arginfo header of the C extension from its stub with gen_stub.php"
	@echo "  rules-check            Check case.json rule identifiers against docs/spec"
	@echo "  editor-boundary-check  Check the editor layer boundaries (EDT-2, EDT-3)"
	@echo "  doc-coverage           Check that public symbols carry documentation comments"
	@echo "  schema-check           Validate contracts/schema/ast.schema.json and every expected.ast.json"
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
	@echo "  dependency-audit       The dependency gate and its mutation check, which also reject a lock with an advisory at its review"
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
	@echo "  test-vscode            Extension tests and type check"
	@echo "  test-vscode-integration Run the extension inside the VS Code that make install-vscode installs into var/tools/vscode"
	@echo "  vscode-package         Build the .vsix with vsce"
	@echo "  vscode-install         Install the .vsix into the local VS Code"
	@echo "  clean                  Remove build outputs"

# The targets of the full suite, the one list of every runner: `make check`, `make release-test-matrix` and `make
# release-check` in a clean checkout run them through the guard of the full-run tool of @polyspec/kit, which refuses while a checklist
# task is [~], while tracked changes are uncommitted or when var/full-run.json records a run of the current tree, runs
# each target with `make <target>` to its end and records its result; `make rerun-failed` reruns the targets of the
# current tree that did not pass. The jobs of the CI workflow run each target of the list in exactly one job with `make
# ci-targets` (T17.1-10), so the list names the targets that the jobs run, such as lint-ts and conformance-ts. The list
# stays on one line: the owner-check tool of @polyspec/kit reads it.
CHECK_TARGETS := push-gate-commit kit-check layout-check typecheck lint-python docs-check docs-static-check test-scripts rules-check editor-boundary-check compiler-interface-check parity-declarations-check parity-check dependency-audit contract-check function-contract-check function-inventory-check benchmark-check lint-ts lint-go lint-rust lint-go-format lint-rust-format lint-showcase-format lint-showcase-warnings lint-php lint-php-format test-ts test-language test-lsp test-codemirror format-check test-vscode test-vscode-integration test-go test-rust test-php conformance-ts conformance-go conformance-rust conformance-php conformance-python test-python conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python delimiter-matrix generated-native-check test-ext typed-generator-compile-check generated-lint-check install-check test-browser showcase-check benchmark-smoke docs-verify-idempotent

check: ## Full check through the guard: once per tree, when no checklist task is [~]
	node $(KIT)/full-run.$(KIT_EXT) run $(CHECK_TARGETS)

lint: lint-ts lint-go lint-rust lint-php lint-python lint-go-format lint-rust-format lint-php-format lint-showcase-format lint-showcase-warnings ## Lint every package: the lint targets of kit and the format checks of template

# The lint targets of kit (lint-ts, lint-go, lint-rust, lint-php, lint-python) run oxlint with oxlint-tsgolint and knip,
# golangci-lint and deadcode, clippy, phpcs and PHPStan, and ruff and vulture with the configuration that kit copies (T24.6).
# They read the installed Composer packages and the crates, which these prerequisites provide. The format checks are
# template's.
lint-php: build-php build-ext-php
lint-rust: cargo-downloads-check

.PHONY: lint-go-format lint-rust-format lint-showcase-format lint-showcase-warnings lint-php-format
lint-go-format:
	@out=$$(gofmt -l $(GO_DIR) $(GO_BACKEND_DIR)) || exit 1; test -z "$$out" || { echo "gofmt -l $(GO_DIR) $(GO_BACKEND_DIR) lists files that are not formatted:"; echo "$$out"; exit 1; }
lint-rust-format:
	$(CARGO) fmt --manifest-path $(RUST_DIR)/Cargo.toml --check
lint-showcase-format:
	$(CARGO) fmt --manifest-path $(SHOWCASE_RUST)/Cargo.toml --check
lint-showcase-warnings: cargo-downloads-check
	$(CARGO) rustc --locked --manifest-path $(SHOWCASE_RUST)/Cargo.toml --bin showcase-adapter-rust -- -D warnings
lint-php-format: build-php
	$(PHP_DIR)/vendor/bin/pint --test --config $(PHP_DIR)/pint.json $(PHP_DIR) $(EXT_DIR)

# make install-tools TOOLS=npm installs the npm of packageManager and make install-packages installs package-lock.json with
# it, @polyspec/kit included, whose kit.mk has the other targets (T24.1); make install then installs the rest. It downloads
# the crates of every Cargo.lock into the registry of CARGO_HOME with cargo-downloads-fetch of kit: the generated checks and
# runners resolve their temporary crates with cargo --offline, which finds a crate only when an earlier cargo command
# downloaded it, so whether they passed depended on which cargo command ran first (T20.1-1).
# make install installs every tool of mise.lock with make install-tools: every Python check runs the shim
# var/tools/mise/shims/python3 of the python of mise.toml, so every job has that interpreter after make install and no job
# sets up a Python of its own (T24.12).
install: install-tools cargo-downloads-fetch ## After make install-tools TOOLS=npm and make install-packages: install the tools of mise.lock, the Rust toolchain of rust-toolchain.toml, the crates of every Cargo.lock, the Composer packages and the Python build requirements
	$(ONLINE) node scripts/composer-install.mts $(PHP_DIR)
	$(ONLINE) node scripts/composer-install.mts $(EXT_DIR)
	$(ONLINE) node scripts/python-wheelhouse.mts

# The recipes run cargo offline, and cargo answers a missing crate with "retry without --offline"; this check names the
# lock and the fix, make install, and every target that runs cargo depends on it (T20.1-5).
install-vscode: ## Install the VS Code of the integration test into var/tools/vscode, after make install
	$(ONLINE) node $(KIT)/install-vscode.$(KIT_EXT) $(VSCODE_DIR) $(VSCODE_TOOLS)

# The release steps and the consumer locks are the targets of the kit.mk of @polyspec/kit (config/release.json). The archives are built
# from the built npm packages, so the targets that build or lock them run those builds first.
release-assets: $(if $(findstring /,$(TAG)),,build-ts build-language build-lsp build-codemirror)
release-consumer release-consumer-lock: build-ts build-language build-lsp build-codemirror

install-browsers: ## Install the Chromium of Playwright and its system packages, after make install
	$(ONLINE) $(PLAYWRIGHT) install --with-deps chromium

build-ts: ## Build the TypeScript package
	node scripts/build-package.mts --package ts

build-go: ## Build the Go CLI
	cd $(GO_DIR) && go build -o template ./cmd/template && cd $(CURDIR) && node scripts/publish-build.mts $(GO_DIR)/template var/build/template-go

build-rust: cargo-downloads-check ## Build the Rust CLI
	$(CARGO) build --locked --release --manifest-path $(RUST_DIR)/Cargo.toml && node scripts/publish-build.mts $(RUST_DIR)/target/release/template var/build/template-rust

build-php: ## Install PHP dependencies
	node scripts/composer-install.mts $(PHP_DIR)

test-ts: test-ts-unit test-ts-types test-ts-types-node test-ts-types-tests ## TypeScript unit tests and type check

.PHONY: test-ts-unit test-ts-types test-ts-types-node test-ts-types-tests
test-ts-unit: build-ts
	node $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(TS_DIR)
test-ts-types: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.json
test-ts-types-node: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.node.json
# The tests of the package, with the types of Node.js, the build of the package and the scripts that they import.
test-ts-types-tests: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.tests.json

test-go: test-go-vet test-go-backend-vet test-go-unit ## Go unit tests

.PHONY: test-go-vet test-go-backend-vet test-go-unit
test-go-vet:
	cd $(GO_DIR) && go vet ./...
test-go-backend-vet:
	cd $(GO_BACKEND_DIR) && go vet *.go
test-go-unit:
	node $(KIT)/run-tests.$(KIT_EXT) go --cwd $(GO_DIR) -- -race ./...

test-rust: test-rust-clippy test-rust-unit ## Rust clippy and tests

.PHONY: test-rust-clippy test-rust-unit
test-rust-clippy: cargo-downloads-check
	$(CARGO) clippy --locked --release --manifest-path $(RUST_DIR)/Cargo.toml -- -D warnings
test-rust-unit: cargo-downloads-check
	node $(KIT)/run-tests.$(KIT_EXT) cargo --cwd $(RUST_DIR) -- --locked

test-php: build-php ## PHP unit tests
	node $(KIT)/run-tests.$(KIT_EXT) phpunit --cwd $(PHP_DIR)

test-scripts: cargo-downloads-check build-ts build-language build-lsp build-codemirror build-php python-package ## Tests of the test runner and the conformance runners
	node $(KIT)/run-tests.$(KIT_EXT) node -- tests/scripts/

# The infrastructure of scripts/, tests/runner, tests/scripts, tests/browser and examples/showcase is TypeScript, which Node.js
# runs by type stripping; tsc checks it with the strict options of tsconfig.json (S9). Some of it imports the build of
# packages/ts and packages/language, whose declarations tsc reads.
typecheck: build-ts build-language ## Type check of the TypeScript infrastructure (tsconfig.json, S9)
	$(TSC) -p tsconfig.json

# The type-aware lint of kit reads the same declarations: a module that imports @polyspec/template or
# @polyspec/template-language resolves its types from the dist that package.json exports, so the lint runs after those
# builds.
lint-ts: build-ts build-language

build-language: build-ts ## Build the formatter library and the template-fmt CLI
	node scripts/build-package.mts --package language

test-language: test-language-unit test-language-types ## Formatter, safety invariant and CLI tests, type check

.PHONY: test-language-unit test-language-types
test-language-unit: build-language
	node $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(LANGUAGE_DIR)
test-language-types: build-language
	$(TSC) --noEmit -p $(LANGUAGE_DIR)/tsconfig.json

build-lsp: build-language ## Build the language server template-lsp
	node scripts/build-package.mts --package lsp

test-lsp: test-lsp-unit test-lsp-types ## Language server protocol tests against the editor fixtures, type check

.PHONY: test-lsp-unit test-lsp-types
test-lsp-unit: build-lsp
	node $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(LSP_DIR)
test-lsp-types: build-lsp
	$(TSC) --noEmit -p $(LSP_DIR)/tsconfig.json

format-check: build-language ## Check that the formatter fixtures are formatted
	node $(LANGUAGE_DIR)/bin/template-fmt.mjs --check $(LANGUAGE_DIR)/tests/fixtures/expected

format-external-check: build-language ## Run the formatter safety invariant on an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	cd $(LANGUAGE_DIR) && TEMPLATE_SOURCE_ROOT="$(abspath $(TEMPLATE_SOURCE_ROOT))" $(VITEST) run tests/invariant.test.ts

build-codemirror: build-language ## Build the CodeMirror 6 adapter
	node scripts/build-package.mts --package codemirror

test-codemirror: test-codemirror-unit test-codemirror-browser test-codemirror-types ## CodeMirror adapter tests against the editor fixtures, browser test, type check

.PHONY: test-codemirror-unit test-codemirror-browser test-codemirror-types
test-codemirror-unit: build-codemirror
	node $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(CODEMIRROR_DIR)
test-codemirror-browser: build-codemirror
	cd $(CODEMIRROR_DIR) && $(PLAYWRIGHT) test
test-codemirror-types: build-codemirror
	$(TSC) --noEmit -p $(CODEMIRROR_DIR)/tsconfig.json

install-cli: build-language ## Install a copy of the formatter and the script $(CLI_PREFIX)/bin/template-fmt
	node scripts/install-cli.mts install --prefix $(CLI_PREFIX)

uninstall-cli: ## Remove the formatter copy and the script template-fmt of $(CLI_PREFIX)
	node scripts/install-cli.mts uninstall --prefix $(CLI_PREFIX)

build-vscode: build-lsp ## Bundle the VS Code extension
	node scripts/build-package.mts --package vscode

test-vscode: test-vscode-unit test-vscode-types ## Extension tests and type check

.PHONY: test-vscode-unit test-vscode-types
test-vscode-unit: build-vscode
	node $(KIT)/run-tests.$(KIT_EXT) node --cwd $(VSCODE_DIR) -- tests/extension.test.mjs tests/integration-step.test.mjs tests/integration-wait.test.mjs
test-vscode-types: build-vscode
	$(TSC) --noEmit -p $(VSCODE_DIR)/tsconfig.json

test-vscode-integration: vscode-package ## Run the extension inside the minimum supported VS Code
	cd $(VSCODE_DIR) && node tests/integration/run.mjs --vscode $(VSCODE_TOOLS)

vscode-package: build-vscode ## Build the .vsix
	$(NPM) run package:vsix --workspace $(VSCODE_DIR)

vscode-install: vscode-package ## Install the .vsix into the local VS Code
	code --install-extension $(VSIX) --force

conformance: cargo-downloads-check build-ts build-go build-rust build-php ext ## Cross-language conformance suite (builds every implementation first)
	node tests/runner/conformance.mts

# The conformance of TypeScript and one other language, as the language jobs of CI run it (T20.1-8).
.PHONY: conformance-ts conformance-go conformance-rust conformance-php conformance-python
conformance-ts: cargo-downloads-check build-ts ## Conformance suite of TypeScript
	node tests/runner/conformance.mts --langs ts
conformance-go: cargo-downloads-check build-ts build-go ## Conformance suite of TypeScript and Go
	node tests/runner/conformance.mts --langs ts,go
conformance-rust: cargo-downloads-check build-ts build-rust ## Conformance suite of TypeScript and Rust
	node tests/runner/conformance.mts --langs ts,rust
conformance-php: cargo-downloads-check build-ts build-php ## Conformance suite of TypeScript and PHP
	node tests/runner/conformance.mts --langs ts,php

delimiter-matrix: cargo-downloads-check build-ts build-go build-rust build-php ## Exercise every valid delimiter pair in every language
	node tests/runner/delimiter-matrix.mts

conformance-generated-ts: build-ts ## TypeScript generated compiler conformance suite
	node tests/runner/conformance-generated-ts.mts

conformance-generated-go: build-ts ## Go generated compiler conformance suite
	node tests/runner/conformance-generated-go.mts

conformance-generated-rust: cargo-downloads-check build-ts ## Rust generated compiler conformance suite
	node tests/runner/conformance-generated-rust.mts

conformance-generated-php: build-ts build-php ## PHP generated compiler conformance suite
	node tests/runner/conformance-generated-php.mts

conformance-python: cargo-downloads-check build-ts ## Conformance suite of TypeScript and Python
	node tests/runner/conformance.mts --langs ts,python

# The Python package is installed, editable, into the virtual environment PYTHON_VENV, the environment of the command of
# the implementation python of config/parity.json (scripts/python-venv.mts), so its tests, the conformance
# driver (tests/runner/drivers.mts) and the parity check (config/parity.json) import polyspec.template from the sources of
# the checkout with no changed import path (PRINCIPLES S3). kit's python-venv makes the environment from the
# python of mise.toml, and the uv of mise.toml installs the package into it offline, with its build requirement from
# var/python/wheelhouse (make install). The stamp is remade when the project or its build requirements change; a change of
# the sources needs no install. The tests are discovered with packages/python as the top level: the directory
# tests is a package, so a test imports the shared case listing tests/cases.py relatively, as it does when the parity check
# runs one test file by its path.
PYTHON_PACKAGE := packages/python
PYTHON_VENV := $(shell node scripts/python-venv.mts)
ifeq ($(PYTHON_VENV),)
$(error scripts/python-venv.mts read no environment of the implementation python from config/parity.json)
endif
UV := $(CURDIR)/var/tools/mise/shims/uv

.PHONY: python-package
python-package: $(PYTHON_VENV)/.installed ## Make the environment of config/parity.json with packages/python installed editable; offline

$(PYTHON_VENV)/.installed: $(PYTHON_PACKAGE)/pyproject.toml $(PYTHON_PACKAGE)/build-requirements.json
	rm -rf $(PYTHON_VENV)
	$(MAKE) python-venv DIR=$(PYTHON_VENV)
	$(UV) pip install --python $(PYTHON_VENV)/bin/python --offline --no-index --find-links var/python/wheelhouse --link-mode copy --no-deps -e $(PYTHON_PACKAGE)
	touch $@

test-python: python-package ## Unit tests of the Python package
	node $(KIT)/run-tests.$(KIT_EXT) python --venv $(PYTHON_VENV) -- discover -s $(PYTHON_PACKAGE)/tests -t $(PYTHON_PACKAGE)

conformance-generated-python: build-ts python-package ## Python generated compiler conformance suite
	node tests/runner/conformance-generated-python.mts

conformance-all-modes: conformance conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python ## AST and generated conformance in every language

conformance-cases: cargo-downloads-check build-ts build-go build-rust build-php ext ## AST and generated conformance in every language for the cases of CASES only
	node scripts/conformance-cases.mts $(CASES)

function-inventory-check: ## Inventory the function-shaped calls of the fixture template
	node tests/runner/function-inventory.mts

install-check: install-workspace-check package-installs-check ## Install immutable package artifacts in isolated install projects

.PHONY: install-workspace-check package-installs-check
install-workspace-check:
	node scripts/check-install-workspace.mts
package-installs-check: cargo-downloads-check typed-generator
	node scripts/check-package-installs.mts

# parity-check and parity-declarations-check of kit read config/parity.json (T24.7): parity-check runs the native test of each
# implementation that binds a shared suite, which reads the installed Composer packages, the PHP extension and the crates.
parity-check: cargo-downloads-check build-php build-ext-php ext python-package

test-browser: build-ts ## Browser rendering test
	node tests/browser/run.mts

# The PHP extension is a C implementation in $(EXT_DIR)/src: scripts/build-php-extension.mts builds it with phpize,
# configure and make of the php-config of PATH in a temporary directory, with every compiler warning as an error, and
# publishes the library by rename when its bytes change; it does nothing for unchanged inputs (T21.1, T21.4).
ext: ## Build the PHP extension
	node scripts/build-php-extension.mts $(EXT_DIR)/src $(EXT_LIBRARY)

test-ext: test-ext-conformance test-ext-unit ## Test the PHP extension

# The C extension in $(EXT_DIR)/src declares its PHP classes in polyspec_template.stub.php; gen_stub.php of the PHP
# build generates polyspec_template_arginfo.h from it, which is committed for builds from the package (T21.1).
ext-arginfo: ## Generate the arginfo header of the C extension from its stub with gen_stub.php
	node scripts/build-php-extension.mts --arginfo $(EXT_DIR)/src

.PHONY: build-ext-php test-ext-conformance test-ext-unit
build-ext-php:
	node scripts/composer-install.mts $(EXT_DIR)
test-ext-conformance: cargo-downloads-check ext
	node tests/runner/conformance.mts --langs php-ext
test-ext-unit: ext build-ext-php
	node $(KIT)/run-tests.$(KIT_EXT) phpunit --php-extension $(EXT_LIBRARY) --cwd $(EXT_DIR)

rules-check: ## Check case.json rule identifiers against the specification
	node scripts/check-rules.mts

# The editor boundary checker of kit reads the boundaries of config/editor-boundaries.json (EDT-2, EDT-3, T23.4).
editor-boundary-check: ## Check that adapters do not use the parser and the language service uses no editor, Node.js or DOM module
	node $(KIT)/check-editor-boundaries.$(KIT_EXT)

# The dependency gate reads only the files of the checkout: the manifests, the locks, config/dependency-policy.json and
# the review record config/dependency-review.json, so one tree gives one result at any time. make dependency-review asks
# the registries; it is a developer command and a scheduled workflow, not a step of make check or of the gating CI jobs.
dependency-audit: dependency-policy-check dependency-policy-mutation-check ## The dependency gate and its mutation check, which also reject a lock with an advisory at its review

# cargo-audit is built with the Rust toolchain of rust-toolchain.toml, which make install-tools installs first (kit
# K151).
dependency-review: install-tools

doc-coverage: ## Check that public symbols carry documentation comments
	node scripts/check-doc-coverage.mts

schema-check: schema-fixtures-check schema-mutations-check ## Validate the AST schema and fixtures

.PHONY: schema-fixtures-check schema-mutations-check
schema-fixtures-check:
	node scripts/check-schema.mts
schema-mutations-check:
	node scripts/check-schema-mutations.mts

docs-check: compiler-interface-diagrams-check showcase-contract-diagrams-check documents-check schema-check doc-coverage benchmark-docs-check ## Document checks

.PHONY: compiler-interface-diagrams-check showcase-contract-diagrams-check benchmark-docs-check
compiler-interface-diagrams-check:
	node scripts/generate-compiler-interface.mts --check
showcase-contract-diagrams-check:
	node scripts/generate-showcase-contract.mts --check
benchmark-docs-check:
	node scripts/update-benchmark-docs.mts --check

compiler-interface-generate: ## Generate the typed compiler Mermaid diagrams
	node scripts/generate-compiler-interface.mts

compiler-interface-check: compiler-interface-diagrams-check compiler-interface-languages-check compiler-interface-mutations-check ## Verify the typed generated module structure in every language

.PHONY: compiler-interface-languages-check compiler-interface-mutations-check
compiler-interface-languages-check: cargo-downloads-check build-php python-package
	node scripts/check-compiler-interface.mts
compiler-interface-mutations-check: cargo-downloads-check build-php python-package
	node scripts/check-compiler-interface-mutations.mts

docs: ## Build the documentation site
	$(VITEPRESS) build docs

# The copy of the first build goes into a directory of this run outside the checkout, which the recipe removes, so two
# runs never share it (T19.7).
docs-verify-idempotent: docs ## Build the documentation site twice and compare
	@first=$$(mktemp -d) || exit 1; cp -R docs/.vitepress/dist "$$first/dist" && $(VITEPRESS) build docs && diff -r "$$first/dist" docs/.vitepress/dist; status=$$?; rm -rf "$$first"; exit $$status

docs-static-check: docs ## Build the documentation site as static files
	node scripts/check-docs-static.mts

contract-generate: ## Generate showcase declarations and Mermaid diagrams
	node scripts/generate-showcase-contract.mts

contract-check: cargo-downloads-check build-ts build-php python-package ## Verify generated declarations, implementations and runtime state recovery
	node scripts/check-showcase-contract.mts

showcase: cargo-downloads-check typed-generator build-php python-package ## Build the executable example site and its result artifacts
	node examples/showcase/build.mts --write --langs $(SHOWCASE_LANGS)
	node scripts/check-showcase-contract.mts
	node examples/showcase/benchmark-modes.mts --output examples/site/data/mode-benchmark.json
	node scripts/check-benchmark-results.mts
	node scripts/update-benchmark-docs.mts
	node examples/showcase/build-site.mts

bench: cargo-downloads-check typed-generator build-php ## Measure production AST and generated artifacts
	node examples/showcase/benchmark-modes.mts --output examples/site/data/mode-benchmark.json
	node scripts/check-benchmark-results.mts
	node scripts/update-benchmark-docs.mts

benchmark-check: benchmark-results-check benchmark-docs-check ## Verify committed benchmark structure and equal output

.PHONY: benchmark-results-check
benchmark-results-check:
	node scripts/check-benchmark-results.mts

benchmark-smoke: cargo-downloads-check typed-generator build-php ## Measure a fresh short equal-output sample without changing committed results
	node scripts/check-benchmark-smoke.mts

template-function-inventory: ## Inventory function-shaped calls in an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	node scripts/inventory-template-functions.mts --root "$(TEMPLATE_SOURCE_ROOT)"

function-contract-check: function-contract-registries-check function-contract-runtimes-check ## Check the canonical function contract against all language registries

.PHONY: function-contract-registries-check function-contract-runtimes-check
function-contract-registries-check:
	node scripts/check-function-contract.mts
function-contract-runtimes-check:
	node tests/runner/function-contract.mts

release-test-matrix: ## The full suite of make check through the same guard: every target of CHECK_TARGETS to its end
	node $(KIT)/full-run.$(KIT_EXT) run $(CHECK_TARGETS)

release-check: ## Install and run the release matrix in an isolated clean worktree
	node scripts/check-clean-release.mts

showcase-check: artifact-digest-check typed-generator-compile-check showcase-build-check contract-check showcase-site-check showcase-html-check ## Verify example-site parity, repeatability and browser output

.PHONY: artifact-digest-check showcase-ast-check showcase-build-check showcase-site-check showcase-html-check
# The committed artifacts record the digest of the compiler that built them; the check reads only tracked sources, so the
# job push-gate runs it (T17.1-6).
artifact-digest-check: ## Fail when a committed compiled artifact records the digest of another compiler; names make showcase
	node scripts/check-artifact-digests.mts
showcase-ast-check: build-ts
	node examples/showcase/compile.mts --refresh false
showcase-build-check: cargo-downloads-check showcase-ast-check build-php
	node examples/showcase/build.mts --check --langs $(SHOWCASE_LANGS)
showcase-site-check: build-ts
	node examples/showcase/build-site.mts --check
showcase-html-check: build-ts
	node scripts/check-showcase-html.mts

showcase-compile: build-ts ## Generate committed canonical AST artifacts
	node examples/showcase/compile.mts --refresh true

generated-native-check: generated-native-calls-check generated-typed-values-check generated-arguments-check generated-bound-data-check ## Execute generated member and class calls with native, typed and bound values, and typed request argument errors, in every core language

.PHONY: generated-native-calls-check generated-typed-values-check generated-arguments-check generated-bound-data-check
generated-native-calls-check: cargo-downloads-check build-ts build-php python-package
	node scripts/check-generated-native-calls.mts
generated-typed-values-check: cargo-downloads-check build-ts build-php python-package
	node scripts/check-generated-typed-values.mts
generated-arguments-check: cargo-downloads-check build-ts build-php python-package
	node scripts/check-generated-arguments.mts
generated-bound-data-check: cargo-downloads-check build-ts build-php python-package
	node scripts/check-generated-bound-data.mts

typed-generator: showcase-compile ## Generate type-fixed host source from canonical AST
	node examples/showcase/compile-generated.mts --refresh true

typed-generator-check: showcase-ast-check ## Verify type-fixed generated source is reproducible
	node examples/showcase/compile-generated.mts --refresh dev --check

compiler-ir-check: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check ## Verify canonical AST coverage and type/scope rejection in the shared compiler IR

.PHONY: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check
ast-artifact-check: build-ts
	node scripts/check-ast-artifact.mts
generated-artifact-check: build-ts
	node scripts/check-generated-artifact.mts
compiler-ir-rules-check: build-ts
	node scripts/check-compiler-ir.mts
conformance-type-manifest-check: build-ts
	node scripts/check-conformance-type-manifest.mts

typed-generator-compile-check: cargo-downloads-check build-php python-package compiler-ir-check typed-generator-check ## Compile-check all type-fixed generated sources
	node scripts/check-typed-generator.mts

.PHONY: generated-lint-check
generated-lint-check: cargo-downloads-check build-php ## Lint the generated Go, Rust, TypeScript and PHP programs as code of a consumer: formatter and unused code
	node scripts/check-generated-lint.mts

clean: ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(LANGUAGE_DIR)/dist packages/*/dist.inputs.json packages/*/dist.next-* $(LSP_DIR)/dist $(CODEMIRROR_DIR)/dist $(VSCODE_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target examples/showcase/adapters/rust/target docs/.vitepress/dist var/build var/go
