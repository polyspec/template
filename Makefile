# Build, test and documentation targets. Every target is idempotent.

export PATH := $(HOME)/.cargo/bin:$(PATH)
CARGO ?= $(HOME)/.cargo/bin/cargo

.DEFAULT_GOAL := help
.PHONY: help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php runtime-interface-generate runtime-interface-check compiler-interface-generate compiler-interface-check feature-check \
	conformance delimiter-matrix parity test-browser ext test-ext rules-check schema-check doc-coverage docs-check docs docs-verify-idempotent \
	conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-all-modes generated-native-check \
	contract-generate contract-check compiler-ir-check typed-generator typed-generator-check typed-generator-compile-check consumer-check showcase showcase-check showcase-compile \
	bench benchmark-check benchmark-smoke template-function-inventory function-contract-check dependency-policy-check dependency-audit release-test-matrix release-check docs-static-check clean

SHOWCASE_LANGS  ?= ts,go,rust,php

TS_DIR   := packages/template-ts
GO_DIR   := packages/template-go
RUST_DIR := packages/template-rust
PHP_DIR  := packages/template-php
EXT_DIR  := packages/template-php-ext

# require-dir prints "not implemented" and fails when a package directory is absent.
define require-dir
	@test -d $(1) || { echo "$(2): not implemented ($(1) is absent)"; exit 1; }
endef

help: ## List targets
	@echo "Targets:"
	@echo "  check                  docs-check, lint, unit tests of every package, conformance"
	@echo "  lint                   eslint, gofmt, cargo fmt --check, pint --test"
	@echo "  build-ts|go|rust|php   Build one package"
	@echo "  test-ts|go|rust|php    Unit tests of one package"
	@echo "  conformance            Cross-language conformance suite (tests/runner/conformance.mjs)"
	@echo "  parity                 Cross-language output comparison without expected files"
	@echo "  test-browser           Browser rendering test (Playwright)"
	@echo "  ext / test-ext         Build and test the PHP extension"
	@echo "  rules-check            Check case.json rule identifiers against docs/spec"
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
	@echo "  consumer-check         Install package artifacts and compare AST/generated output"
	@echo "  bench                  Measure equal-output AST/generated production artifacts"
	@echo "  release-test-matrix    Run every commercial release verification layer"
	@echo "  release-check          Install and test HEAD in an isolated clean worktree"
	@echo "  dependency-audit       Reject known JavaScript and PHP dependency advisories"
	@echo "  dependency-policy-check Reject unexplained or stale stable-version pins"
	@echo "  clean                  Remove build outputs"

check: docs-check rules-check runtime-interface-check compiler-interface-check feature-check contract-check function-contract-check lint test-ts test-go test-rust test-php conformance delimiter-matrix generated-native-check ## Full check

lint: build-php ## Lint every package
	$(call require-dir,$(TS_DIR),lint)
	npm run lint
	@test ! -d $(GO_DIR) || { out=$$(gofmt -l $(GO_DIR)); test -z "$$out" || { echo "$$out"; exit 1; }; }
	@test ! -d $(RUST_DIR) || $(CARGO) fmt --manifest-path $(RUST_DIR)/Cargo.toml --check
	@test ! -d $(PHP_DIR) || $(PHP_DIR)/vendor/bin/pint --test --config $(PHP_DIR)/pint.json $(PHP_DIR)

build-ts: ## Build the TypeScript package
	$(call require-dir,$(TS_DIR),build-ts)
	npm run build -w @polyspec/template

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
	npm test -w @polyspec/template -- --run
	npm run typecheck -w @polyspec/template

test-go: ## Go unit tests
	$(call require-dir,$(GO_DIR),test-go)
	cd $(GO_DIR) && go vet ./... && go test -race -count=1 -timeout=120s ./...

test-rust: ## Rust clippy and tests
	$(call require-dir,$(RUST_DIR),test-rust)
	$(CARGO) clippy --locked --release --manifest-path $(RUST_DIR)/Cargo.toml -- -D warnings
	$(CARGO) test --locked --manifest-path $(RUST_DIR)/Cargo.toml

test-php: build-php ## PHP unit tests
	cd $(PHP_DIR) && vendor/bin/phpunit

conformance: ## Cross-language conformance suite
	node tests/runner/conformance.mjs

delimiter-matrix: ## Exercise every valid delimiter pair in every language
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

consumer-check: typed-generator ## Install immutable package artifacts in isolated consumers
	node scripts/check-package-consumers.mjs

parity: ## Cross-language output comparison
	node tests/runner/parity.mjs

test-browser: build-ts ## Browser rendering test
	npx playwright test

ext: ## Build the PHP extension
	$(call require-dir,$(EXT_DIR),ext)
	$(CARGO) build --locked --release --manifest-path $(EXT_DIR)/Cargo.toml

test-ext: ext ## Test the PHP extension
	cd $(EXT_DIR) && composer install --no-interaction --quiet
	node tests/runner/conformance.mjs --langs php-ext
	cd $(EXT_DIR) && ./run-tests.sh

rules-check: ## Check case.json rule identifiers against the specification
	node scripts/check-rules.mjs

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

docs-check: ## Document checks
	node scripts/generate-runtime-interface.mjs --check
	node scripts/generate-compiler-interface.mjs --check
	node scripts/generate-showcase-contract.mjs --check
	node scripts/check-documents.mjs
	@test ! -f scripts/check-schema.mjs || node scripts/check-schema.mjs
	@test ! -f scripts/check-doc-coverage.mjs || node scripts/check-doc-coverage.mjs
	node scripts/update-benchmark-docs.mjs --check
	node scripts/features/build.mjs --check
	node scripts/features/check.mjs

feature-check: ## Validate executable feature contracts and generated status pages
	node scripts/features/build.mjs --check
	node scripts/features/check.mjs

runtime-interface-generate: ## Generate the runtime prepared-execution Mermaid diagrams
	node scripts/generate-runtime-interface.mjs

runtime-interface-check: ## Verify the prepared render interface in every runtime
	node scripts/generate-runtime-interface.mjs --check
	node scripts/check-runtime-interface.mjs

compiler-interface-generate: ## Generate the typed compiler Mermaid diagrams
	node scripts/generate-compiler-interface.mjs

compiler-interface-check: ## Verify the typed generated module structure in every language
	node scripts/generate-compiler-interface.mjs --check
	node scripts/check-compiler-interface.mjs
	node scripts/check-compiler-interface-mutations.mjs

docs: ## Build the documentation site
	npx vitepress build docs

docs-verify-idempotent: ## Build the documentation site twice and compare
	npx vitepress build docs
	rm -rf docs/.vitepress/dist.first
	cp -R docs/.vitepress/dist docs/.vitepress/dist.first
	npx vitepress build docs
	diff -r docs/.vitepress/dist.first docs/.vitepress/dist
	rm -rf docs/.vitepress/dist.first

docs-static-check: ## Build the documentation site as static files
	npx vitepress build docs
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
	@test -n "$(TEMPLATE_APP_ROOT)" || { echo "TEMPLATE_APP_ROOT is required"; exit 1; }
	node scripts/inventory-template-functions.mjs --root "$(TEMPLATE_APP_ROOT)"

function-contract-check: ## Check the canonical function contract against all language registries
	node scripts/check-function-contract.mjs
	node tests/runner/function-contract.mjs

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
	@echo "[release 6/7] isolated package and browser consumers"
	$(MAKE) consumer-check test-browser
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

generated-native-check: build-ts ## Execute generated member and class calls with native values in every core language
	node scripts/check-generated-native-calls.mjs

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

clean: ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target $(EXT_DIR)/target tools/showcase/adapters/rust/target docs/.vitepress/dist docs/.vitepress/dist.first
