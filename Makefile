# Build, test and documentation targets. Every target is idempotent.

export PATH := $(HOME)/.cargo/bin:$(PATH)
CARGO ?= $(HOME)/.cargo/bin/cargo

.DEFAULT_GOAL := help
.PHONY: help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php test-scripts runtime-interface-generate runtime-interface-check compiler-interface-generate compiler-interface-check feature-check \
	conformance delimiter-matrix parity test-browser ext test-ext rules-check editor-boundary-check schema-check doc-coverage docs-check docs docs-verify-idempotent \
	conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-all-modes generated-native-check \
	contract-generate contract-check compiler-ir-check typed-generator typed-generator-check typed-generator-compile-check install-check showcase showcase-check showcase-compile language-test-matrix \
	bench benchmark-check benchmark-smoke template-function-inventory function-contract-check dependency-policy-check dependency-audit release-test-matrix release-check docs-static-check clean \
	install lint-js build-language test-language build-lsp test-lsp build-codemirror test-codemirror format-check format-external-check install-cli build-vscode test-vscode test-vscode-integration vscode-package vscode-install clean-vscode-test vscode-test-unlock uninstall-cli rerun-failed

SHOWCASE_LANGS  ?= ts,go,rust,php

TS_DIR   := packages/template-ts
GO_DIR   := packages/template-go
RUST_DIR := packages/template-rust
PHP_DIR  := packages/template-php
EXT_DIR  := packages/template-php-ext
SHOWCASE_RUST := tools/showcase/adapters/rust
LANGUAGE_DIR := packages/template-language
LSP_DIR      := packages/template-lsp
VSCODE_DIR := packages/template-vscode
CODEMIRROR_DIR := packages/template-codemirror
# The VS Code builds of the integration test; scripts/holder-lock.mjs guards it with $(VSCODE_TEST).lock.
VSCODE_TEST := $(CURDIR)/.vscode-test
VSIX       := $(VSCODE_DIR)/dist/polyspec-template.vsix
# The prefix of `make install-cli`: the formatter copy in $(CLI_PREFIX)/lib and the script in $(CLI_PREFIX)/bin.
CLI_PREFIX ?= $(HOME)/.local

# npm installs every dependency, also every package of this repository, as a copy and writes no bin link
# (.npmrc, T18.4), so the recipes start each tool with the file of its package.
TSUP       := node $(CURDIR)/node_modules/tsup/dist/cli-default.js
TSC        := node $(CURDIR)/node_modules/typescript/bin/tsc
# The esbuild package replaces bin/esbuild with the executable of the platform when it installs.
ESBUILD    := $(CURDIR)/node_modules/esbuild/bin/esbuild
ESLINT     := node $(CURDIR)/node_modules/eslint/bin/eslint.js
VITEPRESS  := node $(CURDIR)/node_modules/vitepress/bin/vitepress.js
VITEST     := node $(CURDIR)/node_modules/vitest/vitest.mjs
PLAYWRIGHT := node $(CURDIR)/node_modules/@playwright/test/cli.js
VSCE       := node $(CURDIR)/node_modules/@vscode/vsce/vsce
TMGRAMMAR  := node $(CURDIR)/node_modules/vscode-tmgrammar-test/dist/unit.js
# $(call reinstall,<package>) installs the npm copy of a package of this repository again after its build.
reinstall = rm -rf node_modules/$(1) && npm install --no-audit --no-fund

# require-dir prints "not implemented" and fails when a package directory is absent.
define require-dir
	@test -d $(1) || { echo "$(2): not implemented ($(1) is absent)"; exit 1; }
endef

help: ## List targets
	@echo "Targets:"
	@echo "  check                  The full suite through scripts/full-run.mjs: once per tree, when no checklist task is [~]"
	@echo "  rerun-failed           Rerun the targets of check that did not pass on the current tree"
	@echo "  lint                   eslint, gofmt, cargo fmt --check, Rust showcase warnings, pint --test"
	@echo "  lint-js                eslint on the TypeScript sources"
	@echo "  install                npm ci: every dependency as a copy, no bin links"
	@echo "  build-ts|go|rust|php   Build one package"
	@echo "  test-ts|go|rust|php    Unit tests of one package"
	@echo "  test-scripts           Tests of the test runner and the conformance runners"
	@echo "  conformance            Cross-language conformance suite (tests/runner/conformance.mjs)"
	@echo "  parity                 Cross-language output comparison without expected files"
	@echo "  test-browser           Browser rendering test (Playwright)"
	@echo "  ext / test-ext         Build and test the PHP extension"
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
	@echo "  release-test-matrix    Run every commercial release verification layer"
	@echo "  release-check          Install and test HEAD in an isolated clean worktree"
	@echo "  dependency-audit       Reject known JavaScript and PHP dependency advisories"
	@echo "  dependency-policy-check Reject unexplained or stale stable-version pins"
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
	@echo "  test-vscode-integration Run the extension inside VS Code (downloads VS Code into .vscode-test)"
	@echo "  vscode-package         Build the .vsix with vsce"
	@echo "  vscode-install         Install the .vsix into the local VS Code"
	@echo "  clean                  Remove build outputs"
	@echo "  clean-vscode-test      Remove .vscode-test while holding its lock; fails while an integration run holds it"
	@echo "  vscode-test-unlock     Remove the lock of .vscode-test whose holder process has ended"

# The targets of the full suite. `make check` runs them through the guard scripts/full-run.mjs, which refuses while a
# checklist task is [~], while tracked changes are uncommitted or when var/full-run.json records a run of the current tree,
# runs each target with `make <target>` to its end and records its result; `make rerun-failed` reruns the targets of the
# current tree that did not pass.
CHECK_TARGETS := docs-check docs-static-check test-scripts rules-check editor-boundary-check runtime-interface-check compiler-interface-check feature-check language-test-matrix contract-check function-contract-check lint test-ts test-language test-lsp test-codemirror format-check test-vscode test-vscode-integration test-go test-rust test-php conformance-all-modes delimiter-matrix generated-native-check test-ext typed-generator-compile-check install-check test-browser showcase-check

check: ## Full check through the guard: once per tree, when no checklist task is [~]
	node scripts/full-run.mjs run $(CHECK_TARGETS)

rerun-failed: ## Rerun only the targets of make check that did not pass on the current tree
	node scripts/full-run.mjs rerun-failed

lint: build-php lint-js ## Lint every package
	@test ! -d $(GO_DIR) || { out=$$(gofmt -l $(GO_DIR)); test -z "$$out" || { echo "$$out"; exit 1; }; }
	@test ! -d $(RUST_DIR) || $(CARGO) fmt --manifest-path $(RUST_DIR)/Cargo.toml --check
	@test ! -d $(EXT_DIR) || $(CARGO) fmt --manifest-path $(EXT_DIR)/Cargo.toml --check
	$(CARGO) fmt --manifest-path $(SHOWCASE_RUST)/Cargo.toml --check
	$(CARGO) rustc --locked --manifest-path $(SHOWCASE_RUST)/Cargo.toml --bin showcase-adapter-rust -- -D warnings
	@test ! -d $(PHP_DIR) || $(PHP_DIR)/vendor/bin/pint --test --config $(PHP_DIR)/pint.json $(PHP_DIR)

lint-js: ## Lint the TypeScript sources with eslint
	$(call require-dir,$(TS_DIR),lint-js)
	$(ESLINT) packages/template-ts/src packages/template-language/src packages/template-lsp/src packages/template-codemirror/src packages/template-vscode/src

install: ## Install the npm dependencies as copies without bin links (.npmrc)
	npm ci

build-ts: ## Build the TypeScript package
	$(call require-dir,$(TS_DIR),build-ts)
	cd $(TS_DIR) && $(TSUP)
	$(call reinstall,@polyspec/template)

build-go: ## Build the Go CLI
	$(call require-dir,$(GO_DIR),build-go)
	cd $(GO_DIR) && go build -o template ./cmd/template

build-rust: ## Build the Rust CLI
	$(call require-dir,$(RUST_DIR),build-rust)
	$(CARGO) build --locked --release --manifest-path $(RUST_DIR)/Cargo.toml

build-php: ## Install PHP dependencies
	$(call require-dir,$(PHP_DIR),build-php)
	cd $(PHP_DIR) && composer install --no-interaction --quiet

test-ts: build-ts ## TypeScript unit tests and type check
	node scripts/run-tests.mjs vitest --cwd $(TS_DIR)
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.json && $(TSC) --noEmit -p $(TS_DIR)/tsconfig.node.json

test-go: ## Go unit tests
	$(call require-dir,$(GO_DIR),test-go)
	cd $(GO_DIR) && go vet ./...
	node scripts/run-tests.mjs go --cwd $(GO_DIR) -- -race ./...

test-rust: ## Rust clippy and tests
	$(call require-dir,$(RUST_DIR),test-rust)
	$(CARGO) clippy --locked --release --manifest-path $(RUST_DIR)/Cargo.toml -- -D warnings
	node scripts/run-tests.mjs cargo --cwd $(RUST_DIR) -- --locked

test-php: build-php ## PHP unit tests
	node scripts/run-tests.mjs phpunit --cwd $(PHP_DIR)

test-scripts: build-ts build-language build-php ## Tests of the test runner and the conformance runners
	node scripts/run-tests.mjs node -- tests/scripts/

build-language: build-ts ## Build the formatter library and the template-fmt CLI
	cd $(LANGUAGE_DIR) && $(TSUP)
	$(call reinstall,@polyspec/template-language)

test-language: build-language ## Formatter, safety invariant and CLI tests, type check
	node scripts/run-tests.mjs vitest --cwd $(LANGUAGE_DIR)
	$(TSC) --noEmit -p $(LANGUAGE_DIR)/tsconfig.json

build-lsp: build-language ## Build the language server template-lsp
	cd $(LSP_DIR) && $(TSUP)
	$(call reinstall,@polyspec/template-lsp)

test-lsp: build-lsp ## Language server protocol tests against the editor fixtures, type check
	node scripts/run-tests.mjs vitest --cwd $(LSP_DIR)
	$(TSC) --noEmit -p $(LSP_DIR)/tsconfig.json

format-check: build-language ## Check that the formatter fixtures are formatted
	node $(LANGUAGE_DIR)/bin/template-fmt.mjs --check $(LANGUAGE_DIR)/tests/fixtures/expected

format-external-check: build-language ## Run the formatter safety invariant on an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	cd $(LANGUAGE_DIR) && TEMPLATE_SOURCE_ROOT="$(abspath $(TEMPLATE_SOURCE_ROOT))" $(VITEST) run tests/invariant.test.ts

build-codemirror: build-language ## Build the CodeMirror 6 adapter
	cd $(CODEMIRROR_DIR) && $(TSUP)
	$(call reinstall,@polyspec/template-codemirror)

test-codemirror: build-codemirror ## CodeMirror adapter tests against the editor fixtures, browser test, type check
	node scripts/run-tests.mjs vitest --cwd $(CODEMIRROR_DIR)
	cd $(CODEMIRROR_DIR) && $(PLAYWRIGHT) test
	$(TSC) --noEmit -p $(CODEMIRROR_DIR)/tsconfig.json

install-cli: build-language ## Install a copy of the formatter and the script $(CLI_PREFIX)/bin/template-fmt
	node scripts/install-cli.mjs install --prefix $(CLI_PREFIX)

uninstall-cli: ## Remove the formatter copy and the script template-fmt of $(CLI_PREFIX)
	node scripts/install-cli.mjs uninstall --prefix $(CLI_PREFIX)

build-vscode: build-lsp ## Bundle the VS Code extension
	cd $(VSCODE_DIR) && $(ESBUILD) src/extension.ts --bundle --platform=node --format=cjs --target=node24 --external:vscode --outfile=dist/extension.cjs && $(ESBUILD) @polyspec/template-lsp/server --bundle --platform=node --format=cjs --target=node24 --outfile=dist/server.cjs

test-vscode: build-vscode ## Grammar tests, extension tests and type check
	cd $(VSCODE_DIR) && $(TMGRAMMAR) --config package.json -g ../../node_modules/tm-grammars/grammars/html.json -g ../../node_modules/tm-grammars/grammars/css.json -g ../../node_modules/tm-grammars/grammars/javascript.json "tests/grammar/*.tpl"
	node scripts/run-tests.mjs node --cwd $(VSCODE_DIR) -- tests/extension.test.mjs tests/integration-step.test.mjs
	$(TSC) --noEmit -p $(VSCODE_DIR)/tsconfig.json

test-vscode-integration: vscode-package ## Run the extension inside the minimum supported VS Code
	cd $(VSCODE_DIR) && node tests/integration/run.mjs --cache $(VSCODE_TEST)

vscode-package: build-vscode ## Build the .vsix
	cd $(VSCODE_DIR) && $(VSCE) package --no-dependencies --skip-license --out dist/polyspec-template.vsix

vscode-install: vscode-package ## Install the .vsix into the local VS Code
	code --install-extension $(VSIX) --force

conformance: build-ts build-go build-rust build-php ext ## Cross-language conformance suite (builds every implementation first)
	node tests/runner/conformance.mjs

delimiter-matrix: build-ts build-go build-rust build-php ## Exercise every valid delimiter pair in every language
	node tests/runner/delimiter-matrix.mjs

conformance-generated-ts: build-ts ## TypeScript generated compiler conformance suite
	node tests/runner/conformance-generated-ts.mjs

conformance-generated-go: build-ts ## Go generated compiler conformance suite
	node tests/runner/conformance-generated-go.mjs

conformance-generated-rust: build-ts ## Rust generated compiler conformance suite
	node tests/runner/conformance-generated-rust.mjs

conformance-generated-php: build-ts ## PHP generated compiler conformance suite
	node tests/runner/conformance-generated-php.mjs

conformance-all-modes: conformance conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php ## AST and generated conformance in all four languages

install-check: typed-generator ## Install immutable package artifacts in isolated install projects
	node scripts/check-install-workspace.mjs
	node scripts/check-package-installs.mjs

parity: build-ts build-go build-rust build-php ## Cross-language output comparison
	node tests/runner/parity.mjs

test-browser: build-ts ## Browser rendering test
	node tests/browser/run.mjs

ext: ## Build the PHP extension
	$(call require-dir,$(EXT_DIR),ext)
	$(CARGO) build --locked --release --manifest-path $(EXT_DIR)/Cargo.toml

test-ext: ext ## Test the PHP extension
	$(CARGO) clippy --locked --release --manifest-path $(EXT_DIR)/Cargo.toml -- -D warnings
	cd $(EXT_DIR) && composer install --no-interaction --quiet
	node tests/runner/conformance.mjs --langs php-ext
	cd $(EXT_DIR) && ./run-tests.sh

rules-check: ## Check case.json rule identifiers against the specification
	node scripts/check-rules.mjs

editor-boundary-check: ## Check that adapters do not use the parser and the language service uses no editor, Node.js or DOM module
	node scripts/check-editor-boundaries.mjs

dependency-policy-check: build-php ## Reject unexplained or stale stable-version pins
	node scripts/check-dependency-policy.mjs
	node scripts/check-dependency-policy-mutation.mjs

dependency-audit: dependency-policy-check ## Reject known advisories in locked dependencies
	npm audit --audit-level=moderate
	cd $(PHP_DIR) && composer audit --locked --no-interaction
	cd $(EXT_DIR) && composer audit --locked --no-interaction

doc-coverage: ## Check that public symbols carry documentation comments
	node scripts/check-doc-coverage.mjs

schema-check: ## Validate the AST schema and fixtures
	node scripts/check-schema.mjs
	node scripts/check-schema-mutations.mjs

docs-check: ## Document checks
	node scripts/generate-runtime-interface.mjs --check
	node scripts/generate-compiler-interface.mjs --check
	node scripts/generate-showcase-contract.mjs --check
	node scripts/check-documents.mjs
	node scripts/check-schema.mjs
	node scripts/check-schema-mutations.mjs
	@test ! -f scripts/check-doc-coverage.mjs || node scripts/check-doc-coverage.mjs
	node scripts/update-benchmark-docs.mjs --check
	node scripts/features/build.mjs --check
	node scripts/features/check.mjs

feature-check: ## Validate executable feature contracts and generated status pages
	node scripts/features/build.mjs --check
	node scripts/features/check.mjs

runtime-interface-generate: ## Generate the runtime prepared-execution Mermaid diagrams
	node scripts/generate-runtime-interface.mjs

runtime-interface-check: build-php ## Verify the prepared render interface in every runtime
	node scripts/generate-runtime-interface.mjs --check
	node scripts/check-runtime-interface.mjs

compiler-interface-generate: ## Generate the typed compiler Mermaid diagrams
	node scripts/generate-compiler-interface.mjs

compiler-interface-check: build-php ## Verify the typed generated module structure in every language
	node scripts/generate-compiler-interface.mjs --check
	node scripts/check-compiler-interface.mjs
	node scripts/check-compiler-interface-mutations.mjs

docs: ## Build the documentation site
	$(VITEPRESS) build docs

docs-verify-idempotent: ## Build the documentation site twice and compare
	$(VITEPRESS) build docs
	rm -rf docs/.vitepress/dist.first
	cp -R docs/.vitepress/dist docs/.vitepress/dist.first
	$(VITEPRESS) build docs
	diff -r docs/.vitepress/dist.first docs/.vitepress/dist
	rm -rf docs/.vitepress/dist.first

docs-static-check: ## Build the documentation site as static files
	$(VITEPRESS) build docs
	node scripts/check-docs-static.mjs

contract-generate: ## Generate showcase declarations and Mermaid diagrams
	node scripts/generate-showcase-contract.mjs

contract-check: build-ts ## Verify generated declarations, implementations and runtime state recovery
	node scripts/check-showcase-contract.mjs

showcase: typed-generator ## Build the executable example site and its result artifacts
	node tools/showcase/build.mjs --write --langs $(SHOWCASE_LANGS)
	node scripts/check-showcase-contract.mjs
	node tools/showcase/benchmark-modes.mjs > examples/site/data/mode-benchmark.json
	node scripts/check-benchmark-results.mjs
	node scripts/update-benchmark-docs.mjs
	node tools/showcase/build-site.mjs

bench: typed-generator ## Measure production AST and generated artifacts
	node tools/showcase/benchmark-modes.mjs > examples/site/data/mode-benchmark.json
	node scripts/check-benchmark-results.mjs
	node scripts/update-benchmark-docs.mjs

benchmark-check: ## Verify committed benchmark structure and equal output
	node scripts/check-benchmark-results.mjs
	node scripts/update-benchmark-docs.mjs --check

benchmark-smoke: typed-generator ## Measure a fresh short equal-output sample without changing committed results
	node scripts/check-benchmark-smoke.mjs

template-function-inventory: ## Inventory function-shaped calls in an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	node scripts/inventory-template-functions.mjs --root "$(TEMPLATE_SOURCE_ROOT)"

function-contract-check: ## Check the canonical function contract against all language registries
	node scripts/check-function-contract.mjs
	node tests/runner/function-contract.mjs

language-test-matrix: ## Verify the manifest requires equal semantic test coverage
	node scripts/check-language-test-matrix.mjs
	node scripts/check-language-test-matrix-mutations.mjs

release-test-matrix: build-php ## Run all release layers in deterministic order
	@echo "[release 1/7] contracts, generated documentation and static analysis"
	$(MAKE) docs-check rules-check feature-check dependency-audit runtime-interface-check compiler-interface-check lint
	@echo "[release 2/7] lexer, parser, value, runtime and page-cache units"
	$(MAKE) test-ts test-go test-rust test-php
	@echo "[release 3/7] IR, generated source and host compiler checks"
	$(MAKE) typed-generator-compile-check
	@echo "[release 4/7] complete AST/generated conformance and extension support"
	$(MAKE) ext conformance-all-modes test-ext
	@echo "[release 5/7] positioned errors, recovery and mutation rejection"
	node scripts/check-compiler-interface-mutations.mjs
	node scripts/check-ast-artifact.mjs
	node scripts/check-generated-artifact.mjs
	node scripts/check-showcase-contract.mjs
	node scripts/check-benchmark-results.mjs
	@echo "[release 6/7] isolated package installs and browser output"
	$(MAKE) install-check test-browser
	@echo "[release 7/7] static presentation and fresh performance contract"
	$(MAKE) showcase-check benchmark-smoke docs-verify-idempotent

release-check: ## Install and run the release matrix in an isolated clean worktree
	node scripts/check-clean-release.mjs

showcase-check: build-ts ## Verify example-site parity, repeatability and browser output
	$(MAKE) typed-generator-compile-check
	node tools/showcase/compile.mjs --refresh false
	node tools/showcase/build.mjs --check --langs $(SHOWCASE_LANGS)
	node scripts/check-showcase-contract.mjs
	node tools/showcase/build-site.mjs --check
	node scripts/check-showcase-html.mjs

showcase-compile: build-ts ## Generate committed canonical AST artifacts
	node tools/showcase/compile.mjs --refresh true

generated-native-check: build-ts ## Execute generated member and class calls with native, typed and bound values, and typed request argument errors, in every core language
	node scripts/check-generated-native-calls.mjs
	node scripts/check-generated-typed-values.mjs
	node scripts/check-generated-arguments.mjs
	node scripts/check-generated-bound-data.mjs

typed-generator: showcase-compile ## Generate type-fixed host source from canonical AST
	node tools/showcase/compile-generated.mjs --refresh true

typed-generator-check: build-ts ## Verify type-fixed generated source is reproducible
	node tools/showcase/compile.mjs --refresh false
	node tools/showcase/compile-generated.mjs --refresh dev --check

compiler-ir-check: build-ts ## Verify canonical AST coverage and type/scope rejection in the shared compiler IR
	node scripts/check-ast-artifact.mjs
	node scripts/check-generated-artifact.mjs
	node scripts/check-compiler-ir.mjs
	node scripts/check-conformance-type-manifest.mjs

typed-generator-compile-check: build-php compiler-ir-check typed-generator-check ## Compile-check all type-fixed generated sources
	node scripts/check-typed-generator.mjs

clean: clean-vscode-test ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(LANGUAGE_DIR)/dist $(LSP_DIR)/dist $(CODEMIRROR_DIR)/dist $(VSCODE_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target $(EXT_DIR)/target tools/showcase/adapters/rust/target docs/.vitepress/dist docs/.vitepress/dist.first

clean-vscode-test: ## Remove .vscode-test while holding its lock; fails with the holder while an integration run holds it
	node scripts/holder-lock.mjs run $(VSCODE_TEST).lock -- rm -rf $(VSCODE_TEST)

vscode-test-unlock: ## Remove the lock of .vscode-test whose holder process has ended
	node scripts/holder-lock.mjs clear $(VSCODE_TEST).lock
