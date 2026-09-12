# Build, test and documentation targets. Every target is idempotent.

export PATH := $(HOME)/.cargo/bin:$(PATH)
CARGO ?= $(HOME)/.cargo/bin/cargo

.DEFAULT_GOAL := help
.PHONY: help check lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php runtime-interface-check \
	conformance parity test-browser ext test-ext rules-check schema-check doc-coverage docs-check docs docs-verify-idempotent \
	contract-generate contract-check showcase showcase-check showcase-compile \
	docs-static-check clean

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
	@echo "  showcase-compile       Generate committed per-language AST artifacts"
	@echo "  showcase-check         Verify example artifacts, parity and static HTML structure"
	@echo "  clean                  Remove build outputs"

check: docs-check rules-check runtime-interface-check contract-check lint test-ts test-go test-rust test-php conformance ## Full check

lint: ## Lint every package
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

parity: ## Cross-language output comparison
	node tests/runner/parity.mjs

test-browser: build-ts ## Browser rendering test
	npx playwright test

ext: ## Build the PHP extension
	$(call require-dir,$(EXT_DIR),ext)
	$(CARGO) build --locked --release --manifest-path $(EXT_DIR)/Cargo.toml

test-ext: ext ## Test the PHP extension
	node tests/runner/conformance.mjs --langs php-ext
	cd $(EXT_DIR) && ./run-tests.sh

rules-check: ## Check case.json rule identifiers against the specification
	node scripts/check-rules.mjs

doc-coverage: ## Check that public symbols carry documentation comments
	node scripts/check-doc-coverage.mjs

schema-check: ## Validate the AST schema and fixtures
	node scripts/check-schema.mjs

docs-check: ## Document checks
	node scripts/check-documents.mjs
	@test ! -f scripts/check-schema.mjs || node scripts/check-schema.mjs
	@test ! -f scripts/check-doc-coverage.mjs || node scripts/check-doc-coverage.mjs

runtime-interface-check: ## Verify the prepared render interface in every runtime
	node scripts/check-runtime-interface.mjs

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
	test -s docs/.vitepress/dist/index.html

contract-generate: ## Generate showcase declarations and Mermaid diagrams
	node scripts/generate-showcase-contract.mjs

contract-check: build-ts ## Verify generated declarations, implementations and runtime state recovery
	node scripts/check-showcase-contract.mjs

showcase: build-ts ## Build the executable example site and its result artifacts
	node tools/showcase/compile.mjs --mode changed --langs $(SHOWCASE_LANGS)
	node tools/showcase/generate-native.mjs
	node tools/showcase/generate-direct.mjs
	node tools/showcase/build.mjs --write --langs $(SHOWCASE_LANGS)
	node scripts/check-showcase-contract.mjs
	node tools/showcase/benchmark-modes.mjs > examples/site/data/mode-benchmark.json
	node tools/showcase/build-site.mjs

showcase-check: build-ts ## Verify example-site parity, repeatability and browser output
	node tools/showcase/compile.mjs --mode off --langs $(SHOWCASE_LANGS)
	node tools/showcase/generate-native.mjs --check
	node tools/showcase/generate-direct.mjs --check
	node tools/showcase/build.mjs --check --langs $(SHOWCASE_LANGS)
	node scripts/check-showcase-contract.mjs
	node tools/showcase/build-site.mjs --check
	node scripts/check-showcase-html.mjs

showcase-compile: build-ts ## Generate committed per-language AST artifacts
	node tools/showcase/compile.mjs --mode changed --langs $(SHOWCASE_LANGS)

clean: ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target $(EXT_DIR)/target docs/.vitepress/dist docs/.vitepress/dist.first
