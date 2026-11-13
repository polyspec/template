# Build, test and documentation targets. Every target is idempotent.

# make install-tools TOOLS=npm installs the npm of mise.toml, which devEngines of package.json names, and mise into var/tools/bin, and make
# install-tools (the install-tools utility of @polyspec/kit) installs the tools of mise.toml, Go and Python among them, at the
# digests of mise.lock into var/tools/mise (T24.12); the Makefile puts var/tools/bin and the shims of mise of the checkout
# first on PATH (below, kit K127, K858), so every recipe uses the tools of the checkout and never the npm, Go or Python of the
# machine (T19.2).
# GOTOOLCHAIN=local keeps go from downloading another toolchain at run time.
# kit 0.0.98's run-tests dropped NODE_TEST_CONTEXT, so a node --test that a recipe starts from inside a node test runs as
# its own run, not as a child of that test (kit K1094); no recipe passes it on.
unexport NODE_TEST_CONTEXT
export PATH := $(HOME)/.cargo/bin:$(PATH)
export GOTOOLCHAIN := local
# go builds into the build cache of the checkout, never into a cache that other checkouts and runs share (T19.14).
export GOCACHE := $(CURDIR)/var/go/cache
# GNU Make 3.81 starts a recipe line without shell syntax itself and finds its program with the PATH that make started
# with, not the exported PATH above, also when SHELL names another shell: a line `npm ci` ran the npm of the machine. A
# recipe therefore starts each tool of the checkout by its absolute path: node and npm by $(NODE) and $(NPM), the node and
# the npm of mise.toml in var/tools/bin (kit K171), and go by its shim, $(GO) (T19.2). A script that a recipe starts gets
# the exported PATH. The tools are those of the checkout, KIT_TOOLS (kit K858).
GO = $(KIT_TOOLS)/mise/shims/go
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
# not in another (T20.1-2). The targets that resolve or download, install and install-tools, run their commands with
# $(ONLINE).
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

# ---- The utilities of kit (T27.1-64) ----------------------------------------------------------------------------------
# The recipes of this Makefile are template's own; no makefile of kit is included. Each recipe that needs a utility of the
# installed package @polyspec/kit runs it with its arguments, as kit docs/examples shows: node $(KIT)/<utility>.$(KIT_EXT).
# A source install of kit, the link of 0.0.x development to the kit checkout (.links), holds scripts/kit/<utility>.mts; a
# packed install, the release asset that package-lock.json pins, holds dist/<utility>.mjs. KIT is the real path, so node
# strips the types of a linked source, which lies outside node_modules.
KIT_PACKAGE := $(CURDIR)/node_modules/@polyspec/kit
KIT_SOURCE := $(wildcard $(KIT_PACKAGE)/scripts/kit/land.mts)
KIT := $(realpath $(KIT_PACKAGE)/$(if $(KIT_SOURCE),scripts/kit,dist))
KIT_EXT := $(if $(KIT_SOURCE),mts,mjs)

# The tools of mise.toml (kit K127) run from the shims of mise, var/tools/mise/shims, which find the mise of the checkout through
# its environment: every recipe runs with it, and with var/tools/bin (node, npm, mise and the wrappers of the Composer projects)
# and the shims first on PATH. var/tools is the checkout's own (KIT_TOOLS, kit K858): a linked worktree installs its tools with
# its own make install. KIT_MAIN_CHECKOUT is the main checkout of a linked worktree, whose wheelhouse the worktree reads.
KIT_TOOLS := $(CURDIR)/var/tools
KIT_MAIN_CHECKOUT := $(realpath $(patsubst %/.git,%,$(filter %/.git,$(abspath $(shell git rev-parse --git-common-dir 2>/dev/null)))))
export MISE_DATA_DIR := $(KIT_TOOLS)/mise
export MISE_CACHE_DIR := $(KIT_TOOLS)/mise/cache
export MISE_STATE_DIR := $(KIT_TOOLS)/mise/state
export MISE_CONFIG_DIR := $(KIT_TOOLS)/mise/config
export MISE_GLOBAL_CONFIG_FILE := $(CURDIR)/mise.toml
# mise install records the trust of the root of the global config, the home directory unless this names the checkout (kit K397-1).
export MISE_GLOBAL_CONFIG_ROOT := $(CURDIR)
MISE_ENVIRONMENT := MISE_DATA_DIR MISE_CACHE_DIR MISE_STATE_DIR MISE_CONFIG_DIR MISE_GLOBAL_CONFIG_FILE MISE_GLOBAL_CONFIG_ROOT
export PATH := $(KIT_TOOLS)/bin:$(KIT_TOOLS)/mise/shims:$(PATH)
NODE := $(KIT_TOOLS)/bin/node
NPM := $(KIT_TOOLS)/bin/npm
ALINT := $(KIT_TOOLS)/mise/shims/alint
# The bootstrap runs before var/tools holds a node, so the node of the machine starts it (kit K174).
BOOTSTRAP_NODE := node
ONLINE ?=

# Git runs the hooks of core.hooksPath; every make invocation points it at the tracked hooks of .githooks (AGENTS).
ifneq ($(shell git config core.hooksPath),.githooks)
$(shell git config core.hooksPath .githooks)
endif

# ---- Install: the bootstrap order of kit (kit K71-2, K246-2) ------------------------------------------------------------
.PHONY: install-tools toolchain-lock install-packages install-link install-bootstrap install-symbols
# The home and the cache of the Composer that install-tools and install-symbols run, the folders of var/tools that kit 0.0.98
# set (kit K1095).
COMPOSER_TOOL_ENV = COMPOSER_HOME=$(CURDIR)/var/tools/composer/home COMPOSER_CACHE_DIR=$(CURDIR)/var/tools/composer/cache
# TOOLS=npm is the first step of a checkout, before npm ci installs the packages that the other utilities import, so it runs
# the bootstrap of kit, which imports only Node.js built-ins, with the node of the machine.
install-tools: ## Install every tool of mise.toml at the digests of mise.lock, or the tool names of TOOLS; TOOLS=npm installs mise and the node and npm of mise.toml; ONLINE
ifeq ($(TOOLS),npm)
	$(ONLINE) $(BOOTSTRAP_NODE) $(KIT)/bootstrap/bootstrap.$(KIT_EXT)
else
	$(COMPOSER_TOOL_ENV) $(ONLINE) $(NODE) $(KIT)/install-tools.$(KIT_EXT) --no-self-update $(TOOLS)
endif

# mise lock with the mise of config/toolchain.json for each platform that has the archives of the tools (kit K836). mise locks a
# pypi: tool with uv, so it locks and installs uv and python first, and names that Python as UV_PYTHON for the full lock.
TOOLCHAIN_LOCK_PLATFORMS := linux-x64,linux-arm64,macos-arm64,macos-x64,windows-x64,windows-arm64
toolchain-lock: ## Write mise.lock with mise lock for every platform of TOOLCHAIN_LOCK_PLATFORMS, after make install-tools TOOLS=npm; ONLINE
	$(ONLINE) $(KIT_TOOLS)/bin/mise lock uv python --global --platform $(TOOLCHAIN_LOCK_PLATFORMS)
	$(ONLINE) $(KIT_TOOLS)/bin/mise install --locked uv python
	UV_PYTHON="$$($(KIT_TOOLS)/bin/mise which python3)" $(ONLINE) $(KIT_TOOLS)/bin/mise lock --global --platform $(TOOLCHAIN_LOCK_PLATFORMS)

# npm ci of package-lock.json as it is, with the npm of var/tools; npm reads allow-remote from .npmrc (kit K1045).
install-packages: ## Install the packages of package-lock.json, @polyspec/kit included, with the npm of var/tools; ONLINE
	$(ONLINE) $(NPM) ci

# The links of 0.0.x development (.links of the main checkout, kit K869); CI has no .links, so it links nothing.
install-link: ## Link the packages to the checkouts of .links after every install of make install; PROJECT and RUNTIME select as for make link
	$(NODE) $(KIT)/link.$(KIT_EXT) link$(if $(PROJECT), --project $(PROJECT))$(if $(RUNTIME), --runtime $(RUNTIME))

# The PHP symbol programs of kit that lint-php and the PHP extension build read, symbolExtractors of config/toolchain.json.
EXTRACTORS ?= php
install-symbols: ## Install the symbol programs of EXTRACTORS (php, that of config/toolchain.json); their tools must be installed first; ONLINE
	$(COMPOSER_TOOL_ENV) $(ONLINE) $(NODE) $(KIT)/install-symbols.$(KIT_EXT) $(EXTRACTORS)

install-bootstrap: ## Install the mise, node and npm of mise.toml, the packages of package-lock.json, the tools of mise.toml and the symbol extractors, in that order, into the checkout's own var/tools; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS=npm
	$(MAKE) --no-print-directory install-packages
	$(MAKE) --no-print-directory install-tools
	$(MAKE) --no-print-directory install-symbols

# ---- Checks of the repository that utilities of kit run ---------------------------------------------------------------
.PHONY: layout-check rebuild-check language-check duplication-check suppression-check owner-check owner-validate
# Each check of layout-check is a prerequisite of one command, so a failed one keeps the others running (T19.8).
.PHONY: layout-tree-check layout-installs-check layout-tracked-check
layout-check: layout-tree-check layout-installs-check layout-tracked-check ## Check the folder layout against config/layout.yml with the alint of mise.toml, that Git ignores each install directory and that no tracked file is generated; offline
layout-tree-check:
	$(ALINT) check --config config/layout.yml --color never --compact .
layout-installs-check:
	$(NODE) $(KIT)/generated-files.$(KIT_EXT) installs var package.json=node_modules pyproject.toml=.venv composer.json=vendor
layout-tracked-check:
	$(NODE) $(KIT)/generated-files.$(KIT_EXT) tracked --binary ELF --binary Mach-O --binary PE

# The tool sources of rebuild-check, the values that kit 0.0.98 fixed (kit K1080): the scripts and generators, each glob quoted.
REBUILD_SOURCES := --source 'scripts/**/*.{mts,mjs,cjs,js,ts,py,php,sh,mk}' --source 'packages/*/{scripts,tools,bin}/**/*.{mts,mjs,cjs,js,ts,py,php,sh,mk}' --source 'packages/*/*/{scripts,tools,bin}/**/*.{mts,mjs,cjs,js,ts,py,php,sh,mk}' --source '**/*_generate.go' --source '**/*.generate.{mts,mjs,cjs,js,ts,py,php,sh,mk}' --source 'benchmarks/**/*.{mts,mjs,cjs,js,ts,py,php,sh,mk}' --source 'examples/**/*.{mts,mjs,cjs,js,ts,py,php,sh,mk}' --source 'tests/fixtures/*/generate.*'
# The files among the sources that are no tool source (kit K1080): the .d.ts declarations and the tests.
REBUILD_EXCLUDES := --exclude '**/*.d.ts' --exclude '*/**/{test,tests}/**' --exclude 'test/**' --exclude 'tests/**/{*_generate.go,*.generate.*}' --exclude '**/*.{test,spec}.{js,jsx,ts,tsx,cjs,cts,mjs,mts}' --exclude '**/{*_test.go,test_*.py,*_test.py,*Test.php}'
rebuild-check: ## Check that every tool that config/rebuild.json selects has its class (S1); offline
	$(NODE) $(KIT)/rebuild-check.$(KIT_EXT) $(REBUILD_SOURCES) $(REBUILD_EXCLUDES)

language-check: ## Fail on Hangul in a comment, an identifier, a message or a test name of the code; offline
	$(NODE) $(KIT)/language-check.$(KIT_EXT) --forbid '\p{Script=Hangul}'

duplication-check: ## Fail on a piece of code of 6 lines or more that exists twice outside the folders of config/duplication.json; offline
	$(NODE) $(KIT)/duplication-check.$(KIT_EXT)

suppression-check: ## Fail on a suppression of a lint finding that states no reason in the form of its tool (P8); offline
	$(NODE) $(KIT)/suppression-check.$(KIT_EXT)

owner-check: ## Run the checks that own the changed paths (config/owner-checks.json); PATHS="a b" or BASE=<revision> selects the paths
	$(NODE) $(KIT)/owner-check.$(KIT_EXT) --every-path $(if $(PATHS),--paths "$(PATHS)") $(if $(BASE),--base $(BASE))

owner-validate: ## Check that config/owner-checks.json owns every tracked path and names only existing checks; offline
	$(NODE) $(KIT)/owner-check.$(KIT_EXT) --every-path --validate

# The document checks of kit after the document checks of template, which are the prerequisites of docs-check below.
docs-check:
	$(NODE) $(KIT)/check-documents.$(KIT_EXT) --checklist-place --private-path /Users/ --private-path /home/ --kit-rows

# The rules of PRINCIPLES.md and AGENTS.md, after the stage check of the case.json files of template.
rules-check:
	$(NODE) $(KIT)/check-rules.$(KIT_EXT)

# ---- Lint: each tool reads the configuration files of this repository (kit K1050) ----------------------------------------
# .oxlintrc.json and knip.json, .golangci.yml, clippy.toml with the [lints] of each Cargo.toml, phpcs.xml.dist and
# phpstan.dist.neon, ruff.toml and [tool.vulture] of legacy/packages/python/pyproject.toml.
.PHONY: lint-ts lint-go lint-rust lint-php lint-python lint-php-ext build-php-ext test-php-ext
lint-ts: ## Lint the TypeScript: oxlint and knip, the type check of each tsconfig and API Extractor of each package with an api-extractor.json; offline
	$(NODE) $(KIT)/lint-ts.$(KIT_EXT)
lint-go: ## Lint the Go: golangci-lint and deadcode -test in each Go module; offline
	$(NODE) $(KIT)/lint-go.$(KIT_EXT)
lint-rust: ## Lint the Rust: cargo clippy in each Cargo workspace, without the binding crates (lint-bindings)
	$(NODE) $(KIT)/lint-rust.$(KIT_EXT) --locked $(foreach crate,$(BINDING_CRATES),--exclude $(crate))
lint-php: ## Lint the PHP: phpcs, and PHPStan on each Composer package; offline
	$(NODE) $(KIT)/lint-php.$(KIT_EXT) --memory-limit=-1
lint-python: ## Lint the Python: ruff check, ruff format --check and vulture on each package; offline
	$(NODE) $(KIT)/lint-python.$(KIT_EXT)

# The C PHP extension of legacy/packages/php-ext (S10): the build with phpize, the check of its names, its stub and its arginfo
# header, and the declaration test before its unit tests.
lint-php-ext: ## Check the names, the stub and the stub hash of the arginfo header of legacy/packages/php-ext (S10); offline
	$(NODE) $(KIT)/php-extension.$(KIT_EXT) check --extension legacy/packages/php-ext --build-dir var/php-ext --skip vendor --skip node_modules --library legacy/packages/php
build-php-ext: ## Build legacy/packages/php-ext with phpize into $(EXT_LIBRARY) after the arginfo check; ONLINE (gen_stub.php may fetch its PHP-Parser once)
	$(ONLINE) $(NODE) $(KIT)/php-extension.$(KIT_EXT) build --extension legacy/packages/php-ext --build-dir var/php-ext --skip vendor --skip node_modules --library legacy/packages/php
test-php-ext: build-php-ext ## Compare the declarations of the built extension with the PHP library, then run its unit tests; offline
	$(NODE) $(KIT)/php-extension.$(KIT_EXT) test --extension legacy/packages/php-ext --build-dir var/php-ext --skip vendor --skip node_modules --library legacy/packages/php -- --roots legacy/packages/php legacy/packages/php-ext

# ---- Git hooks and merges -------------------------------------------------------------------------------------------------
# .githooks/pre-commit and .githooks/commit-msg are template's own hooks (HOOK_DECLARATION); make hooks points
# core.hooksPath at them and declares the merge drivers of the changelogs and checklists, which run make twin-merge.
.PHONY: hooks hooks-check staged-generated-hook commit-msg-hook twin-merge
# The declaration of make hooks (kit K1099): the hooks pre-commit and commit-msg of .githooks,
# the merges of the changelogs and checklists (kit K354) and their drivers, which run twin-merge of this checkout.
TWIN_MERGE_DRIVER := make --no-print-directory twin-merge MERGE="%O %A %B %P"
HOOK_DECLARATION := --hooks-path .githooks --hook pre-commit --hook commit-msg --merge 'CHANGELOG.md=kit-changelog' --merge 'CHANGELOG.ko.md=kit-twin' \
	--merge 'docs/plans/*/checklist.md=kit-checklist' --merge 'docs/plans/*/checklist.ko.md=kit-twin' \
	--driver 'kit-twin=$(TWIN_MERGE_DRIVER)' --driver 'kit-changelog=$(TWIN_MERGE_DRIVER)' --driver 'kit-checklist=$(TWIN_MERGE_DRIVER)'
hooks: ## Point core.hooksPath at .githooks, make the hooks of HOOK_DECLARATION executable and declare the merge drivers, then check them
	$(NODE) $(KIT)/git-hooks.$(KIT_EXT) install $(HOOK_DECLARATION)
hooks-check: ## Fail while core.hooksPath is not .githooks, a hook of HOOK_DECLARATION is missing or not executable, or a merge driver is not declared
	$(NODE) $(KIT)/git-hooks.$(KIT_EXT) check $(HOOK_DECLARATION)
staged-generated-hook: ## The check of .githooks/pre-commit: fail while a staged path has a generated segment that config/generated.json does not declare
	$(NODE) $(KIT)/generated-files.$(KIT_EXT) staged --binary ELF --binary Mach-O --binary PE
commit-msg-hook: ## The check of .githooks/commit-msg: the message rules of make commit on the message MESSAGE
	$(NODE) $(KIT)/check-commits.$(KIT_EXT) --message $(MESSAGE) --rules commit-ai-footer,commit-ai-identity
twin-merge: ## The merge drivers that make hooks declares; git runs it with MERGE="<base> <ours> <theirs> <path>"; offline
	@$(NODE) $(KIT)/twin-merge.$(KIT_EXT) $(MERGE)

# ---- Checklist rows, commits and documents (plan.mts of kit) -------------------------------------------------------------
# The texts of a row reach the utility unexpanded (kit K457): each text that is set is passed in single quotes as its raw value.
.PHONY: plan-new plan-split item-new item-edit item-state item-test commit documents-stamp text-absent
raw_text = $(foreach v,$(1),$(if $(filter undefined,$(origin $(v))),,$(v)='$(subst ','\'',$(value $(v)))'))
plan-new: ## Write the plan NAME=<slug> into docs/plans/<slug>/ with TITLE and TITLE_KO; offline
	NAME_PATTERN='^[a-z][a-z0-9-]*$$' $(NODE) $(KIT)/plan.$(KIT_EXT) plan-new
plan-split: ## Move the items IDS="<id> <id>" from the checklist of the plan FROM to the plan TO; offline
	$(NODE) $(KIT)/plan.$(KIT_EXT) plan-split
item-new: ## Add the item ID to the checklist of PLAN and its Korean twin with TASK, TASK_KO, DELIVERABLES and VERIFICATION; offline
	$(call raw_text,TASK TASK_KO DELIVERABLES VERIFICATION) $(NODE) $(KIT)/plan.$(KIT_EXT) item-new
item-edit: ## Replace the cells of the item ID with VERIFICATION, DELIVERABLES, TASK and TASK_KO, or its CAUSE, RETRY, CAUSE_KO and RETRY_KO; offline
	$(call raw_text,TASK TASK_KO DELIVERABLES VERIFICATION CAUSE RETRY CAUSE_KO RETRY_KO) DONE_STAYS=1 $(NODE) $(KIT)/plan.$(KIT_EXT) item-edit
item-state: ## Move the item ID to STATE in both languages; offline
	$(NODE) $(KIT)/plan.$(KIT_EXT) item-state
item-test: ## Run the commands of the Verification cell of the item ID in order; offline
	$(NODE) $(KIT)/plan.$(KIT_EXT) item-test
commit: ## Commit the index for the item ID as TYPE(SCOPE): SUBJECT (#ID) with the body of BODY_FILE; offline
	$(NODE) $(KIT)/plan.$(KIT_EXT) commit
documents-stamp: ## Write the source-sha256 of each English document into the Korean twins of PATHS, or of every twin whose source moved; offline
	$(NODE) $(KIT)/documents-stamp.$(KIT_EXT) $(PATHS)
# FILE and TEXT reach the utility through its environment, unexpanded (kit K431).
unexport TEXT
text-absent: export KIT_TEXT_ABSENT_FILE = $(value FILE)
text-absent: export KIT_TEXT_ABSENT_TEXT = $(value TEXT)
text-absent: ## Fail while the tracked file FILE holds the stale text TEXT, the Red of a row whose whole change is text; offline
	$(NODE) $(KIT)/text-absent.$(KIT_EXT)

# ---- Links and worktrees of 0.0.x development (kit docs/operations/local-links.md) ----------------------------------------
.PHONY: link unlink link-check worktree-setup land
link: ## Connect the provider checkouts of .links through the native package managers; PROJECT and RUNTIME select; offline
	$(NODE) $(KIT)/link.$(KIT_EXT) link$(if $(PROJECT), --project $(PROJECT))$(if $(RUNTIME), --runtime $(RUNTIME))
unlink: ## Remove the links and the go.work files that link wrote; make install restores the locked installs; offline
	$(NODE) $(KIT)/link.$(KIT_EXT) unlink$(if $(PROJECT), --project $(PROJECT))$(if $(RUNTIME), --runtime $(RUNTIME))
link-check: ## List each declared folder of .links that is not a link to its provider; offline
	$(NODE) $(KIT)/link-check.$(KIT_EXT)$(if $(PROJECT), --project $(PROJECT))
# The worktree of a row (kit K1107), as kit 0.0.98 made it: ../<main checkout>-<NAME>-<ID> on <TYPE or fix>/<NAME>-<ID> from main;
# a worktree without node_modules first gets npm ci of the npm of var/tools, then make install and make link-check run in it. The
# worktree runs its own tools in a make of its own (kit K858): the recipe drops the flags of this make and this var/tools from PATH.
WORKTREE_MAIN = $(patsubst %/.git,%,$(shell git rev-parse --path-format=absolute --git-common-dir))
WORKTREE_DECLARATION = --folder $(WORKTREE_MAIN)-$(NAME)-$(ID) --branch $(or $(TYPE),fix)/$(NAME)-$(ID) --base main --prepare 'test -d node_modules || PATH="$(KIT_TOOLS)/bin:$$PATH" $(NPM) ci --ignore-scripts' --make install --make link-check
WORKTREE_ENVIRONMENT = env -u MAKEFLAGS -u MFLAGS -u MAKELEVEL PATH="$$(printf '%s' "$$PATH" | awk -v RS=: -v ORS=: -v tools='$(KIT_TOOLS)' 'index($$0, tools) != 1' | sed 's/:$$//')"
worktree-setup: ## Create or reuse the worktree of the row NAME and ID from main, run make install in it, then make link-check; ONLINE
	$(ONLINE) $(WORKTREE_ENVIRONMENT) $(NODE) $(KIT)/worktree-setup.$(KIT_EXT) $(WORKTREE_DECLARATION)
land: ## Land the branch BRANCH on main fast-forward from its worktree, then remove the worktree and the branch; offline
	$(NODE) $(KIT)/land.$(KIT_EXT) $(BRANCH) main

# ---- CI (.github/workflows/ci.yml) --------------------------------------------------------------------------------------------
.PHONY: ci-targets ci-passed
CI_REPORT ?= var/report/ci-targets
ci-targets: ## Run TARGETS past failures and write CI_REPORT: the log of each target, record.json and summary.md
	$(NODE) $(KIT)/ci-targets.$(KIT_EXT) -k $(CI_REPORT) $(TARGETS)
ci-passed: ## Fail unless every job of RESULTS, the JSON of toJSON(needs), has the result success
	$(NODE) $(KIT)/ci-passed.$(KIT_EXT)

# ---- Release (.github/workflows/release.yml, config/release.json) -----------------------------------------------------------
# release-tag tags the commit of the successful CI run RUN with vX.Y.Z, X.Y.Z the newest section of the change log of that
# commit, and the Go module tags, and appends TAG and VERSION to GITHUB_ENV (kit K911, K924, K987).
.PHONY: release-prepare release-tools release-tools-path release-tag release-assets release-candidate-assets release-publish release-undraft release-coverage
release-prepare: ## Prepare what the release needs before release-tools; template needs nothing
	@:
release-tools: ## Install the tools that config/release.json needs for the release; ONLINE
	$(ONLINE) $(NODE) $(KIT)/release-tools.$(KIT_EXT)
release-tools-path: ## Append var/tools/bin and the shims of mise to GITHUB_PATH and the environment of mise to GITHUB_ENV, after release-tools
	@test -n "$$GITHUB_PATH" || { echo 'release-tools-path: GITHUB_PATH is not set; run it in the release workflow between steps'; exit 1; }
	@test -n "$$GITHUB_ENV" || { echo 'release-tools-path: GITHUB_ENV is not set; run it in the release workflow between steps'; exit 1; }
	@echo "$(KIT_TOOLS)/mise/shims" >> "$$GITHUB_PATH"
	@echo "$(KIT_TOOLS)/bin" >> "$$GITHUB_PATH"
	@for name in $(MISE_ENVIRONMENT); do echo "$$name=$$(printenv $$name)"; done >> "$$GITHUB_ENV"
release-tag: ## Tag the commit of the successful CI run RUN of ci.yml on main with vX.Y.Z and the tags of the Go modules; AUTO releases only the version commit; reads the run with gh
	@test -n "$$RUN" || { echo "release-tag: RUN is required, for example make release-tag RUN=123"; exit 1; }
	RELEASE_MAIN=origin/main $(NODE) $(KIT)/release-run.$(KIT_EXT) tag "$$RUN"$(if $(AUTO), --auto)
release-assets: ## Build the archive of every package of TAG and packages.json of its Composer packages into var/release/assets; ONLINE
	@test -n "$$TAG" || { echo "release-assets: TAG is required, for example make release-assets TAG=v0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets $(ONLINE) $(NODE) $(KIT)/release.$(KIT_EXT) assets "$$TAG"
release-candidate-assets: ## Build the archive of every package from the committed HEAD for VERSION into var/release/assets; ONLINE
	@test -n "$$VERSION" || { echo "release-candidate-assets: VERSION is required, for example make release-candidate-assets VERSION=0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets $(ONLINE) $(NODE) $(KIT)/release.$(KIT_EXT) candidate-assets "$$VERSION"
release-publish: ## Create the GitHub Release of TAG as a draft with the notes and the files of release-assets
	@test -n "$$TAG" || { echo "release-publish: TAG is required, for example make release-publish TAG=v0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets RELEASE_RECORDS=var/release $(NODE) $(KIT)/release.$(KIT_EXT) publish "$$TAG"
release-undraft: ## Make the draft release of TAG public
	@test -n "$$TAG" || { echo "release-undraft: TAG is required, for example make release-undraft TAG=v0.0.1"; exit 1; }
	RELEASE_RECORDS=var/release $(NODE) $(KIT)/release.$(KIT_EXT) undraft "$$TAG"
release-coverage: ## Require every package file of the checkout to be classified in config/release.json; offline
	$(NODE) $(KIT)/release.$(KIT_EXT) coverage
# The release builds the released versions (kit K343), so its Go runs without the go.work files that link writes; the archive
# builds build the tree with the go.work that the repository tracks (kit K774).
release-prepare release-tools release-tag release-publish release-undraft release-coverage: export GOWORK := off
release-assets release-candidate-assets: export GOWORK := $(CURDIR)/go.work

# ---- Python environments ---------------------------------------------------------------------------------------------------
.PHONY: python-venv
python-venv: ## Make the virtual environment DIR from the python3 of mise.toml with its uv venv; offline
	@test -n "$(DIR)" || { echo "python-venv: DIR is required, for example make python-venv DIR=pkg/.venv"; exit 1; }
	$(NODE) $(KIT)/python-venv.$(KIT_EXT) $(DIR)

.PHONY: help lint build-ts build-go build-rust build-php test-ts test-go test-rust test-php template-build-ts template-build-go template-build-rust template-build-php template-test-php template-test-python template-rules-check template-test-scripts compiler-interface-generate compiler-interface-check \
	conformance delimiter-matrix template-test-browser template-test-ext rules-check editor-boundary-check schema-check doc-coverage docs-check docs docs-verify-idempotent \
	conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-all-modes generated-native-check \
	contract-generate contract-check compiler-ir-check typed-generator typed-generator-check typed-generator-compile-check template-install-check showcase showcase-check showcase-compile \
	bench benchmark-check benchmark-smoke template-function-inventory function-contract-check docs-static-check clean \
	install template-install template-build-language template-test-language template-build-lsp template-test-lsp template-build-codemirror template-test-codemirror template-build-compiler template-test-compiler-types format-check format-external-check template-install-cli template-build-vscode template-test-vscode template-test-vscode-integration vscode-package vscode-install template-install-vscode template-install-browsers uninstall-cli \
	conformance-cases function-inventory-check typecheck

SHOWCASE_LANGS  ?= ts,go,rust,php,php-ext,python

TS_DIR   := legacy/packages/ts
GO_DIR   := legacy/packages/go
# The Go that the Go backend of the compiler writes as it is, one definition per file; the folder is in no module, so go
# vet checks its files as one package and resolves their imports through go.work.
GO_BACKEND_DIR := packages/compiler/backends/go
RUST_DIR := packages/rust
PHP_DIR  := legacy/packages/php
EXT_DIR  := legacy/packages/php-ext
# The builds that the checks run, published by scripts/publish-build.mts only when their bytes change: cargo links
# target/release again on every build, and macOS checks a new executable file on its first run (T19.6-1). The C PHP
# extension is built by phpize as polyspec_template.so on every platform (T21.4); kit's `make build-php-ext` builds it (S10).
EXT_LIBRARY := var/php-ext/polyspec_template.so
SHOWCASE_RUST := examples/showcase/adapters/rust
LANGUAGE_DIR := packages/language
LSP_DIR      := packages/lsp
COMPILER_DIR := packages/compiler
VSCODE_DIR := packages/vscode
CODEMIRROR_DIR := packages/codemirror
# The VS Code build of the integration test, installed by make template-install-vscode (the VS Code installer of kit) after make
# install and only read by the test, which never downloads (T20.1-4). Only a run of the test needs it (T20.1-6).
VSCODE_TOOLS := $(KIT_TOOLS)/vscode
VSIX       := $(VSCODE_DIR)/dist/polyspec-template.vsix
# The prefix of `make template-install-cli`: the formatter copy in $(CLI_PREFIX)/lib and the script in $(CLI_PREFIX)/bin.
CLI_PREFIX ?= $(HOME)/.local

# npm links the workspace packages of this repository into node_modules and the commands of the packages into
# node_modules/.bin (T24.2); the recipes start each tool there.
TSC        := $(CURDIR)/node_modules/.bin/tsc
VITEPRESS  := $(CURDIR)/node_modules/.bin/vitepress
VITEST     := $(CURDIR)/node_modules/.bin/vitest
PLAYWRIGHT := $(CURDIR)/node_modules/.bin/playwright

help: ## List targets
	@echo "Targets:"
	@echo "  install-tools|install-packages|layout-check|owner-check|owner-validate|hooks|hooks-check|item-*|commit|land|link|ci-targets|release-*   Targets that run the utilities of @polyspec/kit"
	@echo "  conformance-cases      Conformance in all modes for the cases of CASES only"
	@echo "  lint                   The lint targets (lint-ts, lint-go, lint-rust, lint-php, lint-python, lint-php-ext), gofmt, cargo fmt --check, Rust showcase warnings and pint --test"
	@echo "  lint-python            ruff check and ruff format --check of the Python package (the lint-python tool of @polyspec/kit)"
	@echo "  lint-ts                oxlint with oxlint-tsgolint and knip on the TypeScript (the lint-ts tool of @polyspec/kit)"
	@echo "  install                After make install-tools TOOLS=npm and make install-packages: the tools of mise.lock, the Rust toolchain of rust-toolchain.toml, the crates, the Composer packages and the Python build requirements"
	@echo "  build-<language>       Build one package: build-ts, build-go, build-rust or build-php"
	@echo "  test-<language>        Unit tests of one package: test-ts, test-go, test-rust or test-php"
	@echo "  template-test-scripts           Tests of the test runner and the conformance runners"
	@echo "  typecheck              Type check of the TypeScript infrastructure (tsconfig.json, S9)"
	@echo "  conformance            Cross-language conformance suite (tests/runner/conformance.mts)"
	@echo "  template-test-browser           Browser rendering test (Playwright)"
	@echo "  template-test-ext      Test the PHP extension"
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
	@echo "  showcase-compile       Build the canonical AST artifacts of the showcase"
	@echo "  showcase-check         Verify example artifacts, parity and static HTML structure"
	@echo "  template-install-check         Install package artifacts and compare AST/generated output"
	@echo "  bench                  Measure equal-output AST/generated production artifacts"
	@echo "  template-build-language           Build the formatter library and the template-fmt CLI"
	@echo "  template-test-language            Formatter, safety invariant and CLI tests, type check"
	@echo "  template-build-lsp              Build the language server template-lsp"
	@echo "  template-test-lsp               Language server protocol tests against the editor fixtures, type check"
	@echo "  format-check           Run template-fmt --check on the formatter fixtures"
	@echo "  format-external-check  Run the safety invariant on TEMPLATE_SOURCE_ROOT"
	@echo "  template-install-cli            Install a copy of the formatter and the script template-fmt under CLI_PREFIX (~/.local)"
	@echo "  uninstall-cli          Remove them"
	@echo "  template-build-codemirror       Build the CodeMirror 6 adapter"
	@echo "  template-build-compiler         Build the compiler package @polyspec/template-compiler"
	@echo "  template-test-compiler-types    Build the compiler package and type check its sources"
	@echo "  template-test-codemirror        CodeMirror adapter tests against the editor fixtures, browser test, type check"
	@echo "  template-build-vscode           Bundle the VS Code extension"
	@echo "  template-test-vscode            Extension tests and type check"
	@echo "  template-test-vscode-integration Run the extension inside the VS Code that make template-install-vscode installs into var/tools/vscode"
	@echo "  vscode-package         Build the .vsix with vsce"
	@echo "  vscode-install         Install the .vsix into the local VS Code"
	@echo "  clean                  Remove build outputs"

# The targets of the full suite. The jobs of the CI workflow run each target of the list in exactly one job with `make
# ci-targets` (T17.1-10), so the list names the targets that the jobs run, such as the checks of the job gates, lint-ts
# and conformance-ts. The list stays on one line: the owner-check utility of @polyspec/kit reads it.
CHECK_TARGETS := layout-check docs-check rules-check owner-validate rebuild-check language-check duplication-check suppression-check lint-ts lint-go lint-rust lint-php lint-python lint-php-ext test-php-ext hooks-check typecheck template-test-compiler-types docs-static-check template-test-scripts editor-boundary-check compiler-interface-check contract-check function-contract-check function-inventory-check benchmark-check template-lint-go-format template-lint-go-modules template-lint-rust-format template-lint-showcase-format template-lint-showcase-warnings template-lint-php-format test-ts template-test-language template-test-lsp template-test-codemirror format-check template-test-vscode template-test-vscode-integration test-go test-rust test-php conformance-ts conformance-go conformance-rust conformance-php conformance-python test-python conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python delimiter-matrix generated-native-check template-test-ext typed-generator-compile-check generated-lint-check template-install-check template-test-browser showcase-check benchmark-smoke docs-verify-idempotent

.PHONY: lint build test
lint: lint-ts lint-go lint-rust lint-php lint-python lint-php-ext template-lint-go-format template-lint-go-modules template-lint-rust-format template-lint-php-format template-lint-showcase-format template-lint-showcase-warnings ## Lint every package: the lint targets and the format checks

# The lint targets (lint-ts, lint-go, lint-rust, lint-php, lint-python) run oxlint with oxlint-tsgolint and knip,
# golangci-lint and deadcode, clippy, phpcs and PHPStan, and ruff and vulture with the configuration files of this repository
# (T24.6, kit K1050). They read the installed Composer packages and the crates, which these prerequisites provide.
lint-php: build-php typed-generator
lint-ts: typed-generator
lint-python: typed-generator
lint-rust: typed-generator
lint-go: typed-generator

.PHONY: template-lint-go-format template-lint-go-modules template-lint-rust-format template-lint-showcase-format template-lint-showcase-warnings template-lint-php-format
template-lint-go-format:
	@out=$$(gofmt -l $(GO_DIR) $(GO_BACKEND_DIR)) || exit 1; test -z "$$out" || { echo "gofmt -l $(GO_DIR) $(GO_BACKEND_DIR) lists files that are not formatted:"; echo "$$out"; exit 1; }
# go mod tidy ignores go.work, so each tracked go.mod requires the modules that its packages import, a module of this
# repository by its path inside the repository, and go.sum holds their sums; go mod tidy -diff names each module that differs
# (T27.1-60).
template-lint-go-modules:
	@failed=; for module in $$(git ls-files ':(glob)**/go.mod'); do dir=$$(dirname $$module); echo "[go-modules] go mod tidy -diff in $$dir"; (cd $$dir && $(GO) mod tidy -diff) || failed="$$failed $$dir"; done; test -z "$$failed" || { echo "go mod tidy -diff fails in:$$failed"; exit 1; }
template-lint-rust-format:
	$(CARGO) fmt -p polyspec-template --check
template-lint-showcase-format: typed-generator
	$(CARGO) fmt --manifest-path $(SHOWCASE_RUST)/Cargo.toml --check
template-lint-showcase-warnings: typed-generator
	$(CARGO) rustc --locked --manifest-path $(SHOWCASE_RUST)/Cargo.toml --bin showcase-adapter-rust -- -D warnings
template-lint-php-format: build-php
	vendor/bin/pint --test --config $(PHP_DIR)/pint.json $(PHP_DIR) $(EXT_DIR)

# make install-tools TOOLS=npm installs the npm of mise.toml and make install-packages installs package-lock.json with
# it, @polyspec/kit included, whose utilities the other targets run (T24.1); make install then installs the rest. It downloads
# the crates of every tracked Cargo.lock into the registry of CARGO_HOME with cargo fetch --locked (template-install-rust):
# the generated checks and runners resolve their temporary crates with cargo --offline, which finds a crate only when an
# earlier cargo command downloaded it, so whether they passed depended on which cargo command ran first (T20.1-1).
# make install installs every tool of mise.lock with make install-tools: every Python check runs the shim
# var/tools/mise/shims/python3 of the python of mise.toml, so every job has that interpreter after make install and no job
# sets up a Python of its own (T24.12).
# The Go modules that the modules of go.work require go into the module cache with go mod download, since every check
# runs go with GOPROXY=off (T25.6-1).
# install runs the bootstrap first (install-bootstrap), then the install steps of this repository, then the links of
# 0.0.x development (install-link, kit K246-2, K360-2).
.PHONY: install
install: template-install ## Install the tools and packages in the bootstrap order, then the steps of the repository, then the links; ONLINE
	$(MAKE) --no-print-directory install-link
# Language dependency installs are reusable by independent CI workers after the locked tool bootstrap.
.PHONY: template-install-node template-install-go template-install-rust template-install-php template-install-python template-install-parity
template-install: install-bootstrap
	$(MAKE) template-install-parity

template-install-node: ## npm workspaces were installed by install-packages; no native dependency graph
	@echo "[install-node] locked npm workspaces are installed by make install-packages"

template-install-go: ## Download only the modules of go.work
	$(ONLINE) $(GO) mod download

CARGO_LOCKS := $(shell git ls-files -- '*Cargo.lock')
define newline


endef
template-install-rust: ## Download the crates of every tracked Cargo.lock, which the offline Rust checks resolve
	$(foreach lock,$(CARGO_LOCKS),$(ONLINE) $(CARGO) fetch --locked --manifest-path $(lock:.lock=.toml)$(newline))

template-install-php: ## Install the locked PHP dependency graph of the development root, which requires the library and the command line by their paths
	$(ONLINE) $(NODE) scripts/composer-install.mts .

template-install-python: ## Download the hashed wheel build requirements and install the locked Python environment
	$(ONLINE) $(KIT_TOOLS)/mise/shims/python3 -m pip download --require-hashes --no-deps --only-binary=:all: --dest $(WHEELHOUSE) -r $(PYTHON_PACKAGE)/build-requirements.txt
	$(MAKE) python-package

template-install-parity: template-install-node template-install-rust template-install-go template-install-php template-install-python ## Install every native graph in this checkout, without depending on other CI workers

template-install-vscode: ## Install the VS Code of the integration test into var/tools/vscode, after make install
	$(ONLINE) $(NODE) $(KIT)/install-vscode.$(KIT_EXT) $(VSCODE_DIR) $(VSCODE_TOOLS)

# The release steps are the release targets above (config/release.json). The archives are built from the
# built npm packages, so the targets that build them run those builds first.
release-candidate-assets: build-ts template-build-language template-build-lsp template-build-codemirror template-build-compiler
release-assets: $(if $(findstring /,$(TAG)),,build-ts template-build-language template-build-lsp template-build-codemirror template-build-compiler)

template-install-browsers: ## Install the Chromium of Playwright and its system packages, after make install
	$(ONLINE) $(PLAYWRIGHT) install --with-deps chromium

# The validator of the template AST of legacy/packages/ts is ajv's standalone validation code of contracts/schema/ast.schema.json
# (T25.6-2): make ast-validator generates legacy/packages/ts/src/ast-validator.mjs before the build of the package, which makes the
# file when the schema or the generator is newer; the file is generated output and is not tracked. The package has no runtime
# dependency on ajv and compiles no schema at run time.
build-ts: template-build-ts ## Build the TypeScript package

template-build-ts: ast-validator
	$(NODE) scripts/build-package.mts --package ts

.PHONY: ast-validator
ast-validator: legacy/packages/ts/src/ast-validator.mjs ## Generate the AST validator of legacy/packages/ts from contracts/schema/ast.schema.json
legacy/packages/ts/src/ast-validator.mjs: contracts/schema/ast.schema.json scripts/generate-ast-validator.mts
	$(NODE) scripts/generate-ast-validator.mts

# build-go builds every module of go.work, the showcase adapter among them, which imports the generated programs that
# typed-generator writes (T27.1-40).
build-go: template-build-go typed-generator ## Build the Go CLI and every module of go.work
	$(NODE) $(KIT)/runtime-targets.$(KIT_EXT) build --roots legacy/packages/go examples/showcase/adapters/go -- go build ./...

template-build-go:
	cd $(GO_DIR) && $(GO) build -o template ./cmd/template && cd $(CURDIR) && $(NODE) scripts/publish-build.mts $(GO_DIR)/template var/build/template-go

build-rust: template-build-rust typed-generator ## Build the Rust CLI

template-build-rust:
	$(CARGO) build --locked --release --features cli --manifest-path $(RUST_DIR)/Cargo.toml && $(NODE) scripts/publish-build.mts target/release/template var/build/template-rust

build-php: template-build-php ## Install the Composer packages of the development root composer.json into vendor/

template-build-php:
	$(NODE) scripts/composer-install.mts .

test-ts: template-test-ts-unit template-test-ts-types template-test-ts-types-node template-test-ts-types-tests ## TypeScript unit tests and type check

.PHONY: template-test-ts-unit template-test-ts-types template-test-ts-types-node template-test-ts-types-tests
template-test-ts-unit: build-ts
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(TS_DIR)
template-test-ts-types: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.json
template-test-ts-types-node: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.node.json
# The tests of the package, with the types of Node.js, the build of the package and the scripts that they import.
template-test-ts-types-tests: build-ts
	$(TSC) --noEmit -p $(TS_DIR)/tsconfig.tests.json

# test-go tests every module of go.work from the root, and the showcase adapter imports the generated programs that
# typed-generator writes (T27.1-40).
test-go: typed-generator template-test-go-vet template-test-go-backend-vet template-test-go-unit ## Go unit tests of every module of go.work

.PHONY: template-test-go-vet template-test-go-backend-vet template-test-go-unit
template-test-go-vet:
	cd $(GO_DIR) && $(GO) vet ./...
template-test-go-backend-vet:
	cd $(GO_BACKEND_DIR) && $(GO) vet *.go
template-test-go-unit: typed-generator
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) go -- -count=1 -timeout=0 -race ./$(GO_DIR)/... ./examples/showcase/adapters/go/...

test-rust: template-test-rust-clippy template-test-rust-unit ## Rust clippy and tests

.PHONY: template-test-rust-clippy template-test-rust-unit
template-test-rust-clippy:
	$(CARGO) clippy --locked --release --all-targets --all-features --manifest-path $(RUST_DIR)/Cargo.toml -- -D warnings
template-test-rust-unit:
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) cargo --cwd $(RUST_DIR) -- --locked --features __test_support,cli,fault-test -- --test-threads=1

test-php: template-test-php ## PHP unit tests

template-test-php: build-php
	COMPOSER_VENDOR_DIR=$(CURDIR)/vendor $(NODE) $(KIT)/run-tests.$(KIT_EXT) phpunit --cwd $(PHP_DIR)

template-test-scripts: build-rust typed-generator compiler-interface-generate build-ts template-build-language template-build-lsp template-build-codemirror build-php python-package ## Tests of the test runner and the conformance runners
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node -- --test-concurrency=1 tests/scripts/

# The infrastructure of scripts/, tests/runner, tests/scripts, tests/browser and examples/showcase is TypeScript, which Node.js
# runs by type stripping; tsc checks it with the strict options of tsconfig.json (S9). Some of it imports the build of
# legacy/packages/ts and packages/language, whose declarations tsc reads.
# Each project is a prerequisite of one command, so a failed one keeps the others running (T19.8).
typecheck: typecheck-infrastructure typecheck-docs typecheck-scenarios ## Type check of the TypeScript infrastructure (tsconfig.json, S9)
.PHONY: typecheck-infrastructure typecheck-docs typecheck-scenarios
typecheck-infrastructure: build-ts template-build-language
	$(TSC) -p tsconfig.json
typecheck-docs: build-ts template-build-language
	$(TSC) -p docs/.vitepress/tsconfig.json
typecheck-scenarios: build-ts template-build-language
	$(TSC) -p examples/site/scenarios/tsconfig.json

# The type-aware lint of kit reads the same declarations: a module that imports @polyspec/template-legacy,
# @polyspec/template-language or @polyspec/template-lsp (the VS Code extension) resolves its types from the dist that
# package.json exports, so the lint runs after those builds; without the dist of the server each of its values is an
# error type to oxlint-tsgolint.
lint-ts: build-ts template-build-language template-build-lsp

build: build-ts build-go build-rust build-php build-php-ext template-build-language template-build-lsp template-build-codemirror template-build-compiler template-build-vscode ## Build every package

test: test-ts test-go test-rust test-php test-python test-php-ext ## Unit tests of every package

template-build-language: build-ts ## Build the formatter library and the template-fmt CLI
	$(NODE) scripts/build-package.mts --package language

template-test-language: template-test-language-unit template-test-language-types ## Formatter, safety invariant and CLI tests, type check

.PHONY: template-test-language-unit template-test-language-types
template-test-language-unit: template-build-language
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(LANGUAGE_DIR)
template-test-language-types: template-build-language
	$(TSC) --noEmit -p $(LANGUAGE_DIR)/tsconfig.json

template-build-lsp: template-build-language ## Build the language server template-lsp
	$(NODE) scripts/build-package.mts --package lsp

template-test-lsp: template-test-lsp-unit template-test-lsp-types ## Language server protocol tests against the editor fixtures, type check

.PHONY: template-test-lsp-unit template-test-lsp-types
template-test-lsp-unit: template-build-lsp
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(LSP_DIR)
template-test-lsp-types: template-build-lsp
	$(TSC) --noEmit -p $(LSP_DIR)/tsconfig.json

format-check: template-build-language ## Check that the formatter fixtures are formatted
	$(NODE) $(LANGUAGE_DIR)/bin/template-fmt.mjs --check $(LANGUAGE_DIR)/tests/fixtures/expected

format-external-check: template-build-language ## Run the formatter safety invariant on an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	cd $(LANGUAGE_DIR) && TEMPLATE_SOURCE_ROOT="$(abspath $(TEMPLATE_SOURCE_ROOT))" $(VITEST) run tests/invariant.test.ts

# The repository runs the TypeScript of packages/compiler/src by type stripping; the published package ships the build of
# dist/ that tsup bundles from it, with the declarations of tsc (S9).
template-build-compiler: build-ts ## Build the compiler package @polyspec/template-compiler
	$(NODE) scripts/build-package.mts --package compiler

template-test-compiler-types: template-build-compiler ## Build the compiler package and type check its sources
	$(TSC) --noEmit -p $(COMPILER_DIR)/tsconfig.json

template-build-codemirror: template-build-language ## Build the CodeMirror 6 adapter
	$(NODE) scripts/build-package.mts --package codemirror

template-test-codemirror: template-test-codemirror-unit template-test-codemirror-browser template-test-codemirror-types ## CodeMirror adapter tests against the editor fixtures, browser test, type check

.PHONY: template-test-codemirror-unit template-test-codemirror-browser template-test-codemirror-types
template-test-codemirror-unit: template-build-codemirror
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) vitest --cwd $(CODEMIRROR_DIR)
template-test-codemirror-browser: template-build-codemirror
	cd $(CODEMIRROR_DIR) && $(PLAYWRIGHT) test
template-test-codemirror-types: template-build-codemirror
	$(TSC) --noEmit -p $(CODEMIRROR_DIR)/tsconfig.json

template-install-cli: template-build-language ## Install a copy of the formatter and the script $(CLI_PREFIX)/bin/template-fmt
	$(NODE) scripts/install-cli.mts install --prefix $(CLI_PREFIX)

uninstall-cli: ## Remove the formatter copy and the script template-fmt of $(CLI_PREFIX)
	$(NODE) scripts/install-cli.mts uninstall --prefix $(CLI_PREFIX)

template-build-vscode: template-build-lsp ## Bundle the VS Code extension
	$(NODE) scripts/build-package.mts --package vscode

template-test-vscode: template-test-vscode-unit template-test-vscode-types ## Extension tests and type check

.PHONY: template-test-vscode-unit template-test-vscode-types
template-test-vscode-unit: template-build-vscode
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node --cwd $(VSCODE_DIR) -- --test-concurrency=1 tests/extension.test.mjs tests/integration-step.test.mjs tests/integration-wait.test.mjs
template-test-vscode-types: template-build-vscode
	$(TSC) --noEmit -p $(VSCODE_DIR)/tsconfig.json

template-test-vscode-integration: vscode-package ## Run the extension inside the minimum supported VS Code
	cd $(VSCODE_DIR) && $(NODE) tests/integration/run.mjs --vscode $(VSCODE_TOOLS)

vscode-package: template-build-vscode ## Build the .vsix
	$(NPM) run package:vsix --workspace $(VSCODE_DIR)

vscode-install: vscode-package ## Install the .vsix into the local VS Code
	code --install-extension $(VSIX) --force

conformance: build-ts build-go build-rust build-php build-php-ext ## Cross-language conformance suite (builds every implementation first)
	$(NODE) tests/runner/conformance.mts

# The conformance of TypeScript and one other language, as the language jobs of CI run it (T20.1-8).
.PHONY: conformance-ts conformance-go conformance-rust conformance-php conformance-python
conformance-ts: build-ts ## Conformance suite of TypeScript
	$(NODE) tests/runner/conformance.mts --langs ts
conformance-go: build-ts build-go ## Conformance suite of TypeScript and Go
	$(NODE) tests/runner/conformance.mts --langs ts,go
conformance-rust: build-ts build-rust ## Conformance suite of TypeScript and Rust
	$(NODE) tests/runner/conformance.mts --langs ts,rust
conformance-php: build-ts build-php ## Conformance suite of TypeScript and PHP
	$(NODE) tests/runner/conformance.mts --langs ts,php

delimiter-matrix: build-ts build-go build-rust build-php ## Exercise every valid delimiter pair in every language
	$(NODE) tests/runner/delimiter-matrix.mts

conformance-generated-ts: build-ts ## TypeScript generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-ts.mts

conformance-generated-go: build-ts ## Go generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-go.mts

conformance-generated-rust: build-ts ## Rust generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-rust.mts

conformance-generated-php: build-ts build-php ## PHP generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-php.mts

conformance-python: build-ts ## Conformance suite of TypeScript and Python
	$(NODE) tests/runner/conformance.mts --langs ts,python

# The Python package is installed, non-editable, into the virtual environment PYTHON_VENV (scripts/python-venv.mts). The link
# of kit then makes its installed package folder a link to legacy/packages/python/src/polyspec/template (kit K765), so its
# tests and the conformance driver (tests/runner/drivers.mts) import
# polyspec.template from the sources of the checkout with no changed import path (PRINCIPLES S3). kit's python-venv makes the environment from the
# python of mise.toml, and the uv of mise.toml installs into it the dependencies that legacy/packages/python/pylock.toml pins by
# version and digest, then the package offline, with its build requirement from the wheelhouse that make install of the
# main checkout fills: a linked worktree downloads nothing and reads it as it runs the tools of the main checkout (kit K519).
# make install makes the environment, so the locked dependencies are downloaded there (AGENTS, Idempotency: Network). The
# stamp is remade when the project, its lock or its build requirements change; a change of the sources needs no install,
# since the installed package folder is a link to them. The tests are discovered with legacy/packages/python as the top level: the directory
# tests is a package, so a test imports the shared case listing tests/cases.py relatively, as it does when a run
# names one test file by its path.
PYTHON_PACKAGE := legacy/packages/python
# make reads the environment when it parses the Makefile, before make install-tools TOOLS=npm has installed the node of
# the checkout, so the node of the machine that starts the bootstrap reads it (kit K171).
PYTHON_BOOTSTRAP_NODE := $(if $(wildcard $(KIT_TOOLS)/bin/node),$(KIT_TOOLS)/bin/node,node)
PYTHON_VENV := $(shell $(PYTHON_BOOTSTRAP_NODE) scripts/python-venv.mts)
ifeq ($(PYTHON_VENV),)
$(error scripts/python-venv.mts printed no environment of the Python package)
endif
UV := $(KIT_TOOLS)/mise/shims/uv
WHEELHOUSE := $(or $(KIT_MAIN_CHECKOUT),$(CURDIR))/var/python/wheelhouse

.PHONY: python-package
python-package: $(PYTHON_VENV)/.installed ## Make the environment of the Python package with legacy/packages/python installed and its package folder linked to the checkout; offline

$(PYTHON_VENV)/.installed: $(PYTHON_PACKAGE)/pyproject.toml $(PYTHON_PACKAGE)/pylock.toml $(PYTHON_PACKAGE)/build-requirements.txt
	rm -rf $(PYTHON_VENV)
	$(MAKE) python-venv DIR=$(PYTHON_VENV)
	$(UV) pip install --python $(PYTHON_VENV)/bin/python --link-mode copy -r $(PYTHON_PACKAGE)/pylock.toml
	$(UV) pip install --python $(PYTHON_VENV)/bin/python --offline --no-index --find-links $(WHEELHOUSE) --link-mode copy --no-deps $(PYTHON_PACKAGE)
	$(MAKE) --no-print-directory install-link
	touch $@

test-python: template-test-python ## Unit tests of the Python package

template-test-python: python-package
	PYTHONUNBUFFERED=1 NO_COLOR=1 PYTHON_COLORS=0 $(NODE) $(KIT)/run-tests.$(KIT_EXT) python --venv $(PYTHON_VENV) -- discover -s $(PYTHON_PACKAGE)/tests -t $(PYTHON_PACKAGE)

conformance-generated-python: build-ts python-package ## Python generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-python.mts

conformance-all-modes: conformance conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python ## AST and generated conformance in every language

conformance-cases: build-ts build-go build-rust build-php build-php-ext ## AST and generated conformance in every language for the cases of CASES only
	$(NODE) scripts/conformance-cases.mts $(CASES)

function-inventory-check: ## Inventory the function-shaped calls of the fixture template
	$(NODE) tests/runner/function-inventory.mts

template-install-check: template-install-workspace-check package-installs-check ## Install immutable package artifacts in isolated install projects

.PHONY: template-install-workspace-check package-installs-check
template-install-workspace-check:
	$(NODE) scripts/check-install-workspace.mts
package-installs-check: typed-generator
	$(NODE) scripts/check-package-installs.mts

# scripts/generate-error-codes.mts writes the error-code list of each implementation from the code tables of
# docs/spec/errors.md (T22.6-15); error-codes-check checks that every list is current.
.PHONY: error-codes error-codes-check
error-codes: ## Generate the error-code list of each implementation from docs/spec/errors.md
	$(NODE) scripts/generate-error-codes.mts
error-codes-check: ## Check that the error-code list of each implementation matches docs/spec/errors.md
	$(NODE) scripts/generate-error-codes.mts --check

template-test-browser: build-ts ## Browser rendering test
	$(NODE) tests/browser/run.mts

template-test-ext: template-test-ext-conformance ## Test the PHP extension

.PHONY: template-test-ext-conformance
template-test-ext-conformance: build-php-ext build-php
	$(NODE) tests/runner/conformance.mts --langs php-ext

rules-check: template-rules-check ## Check the stage of every case.json

template-rules-check:
	$(NODE) scripts/check-rules.mts

# scripts/check-editor-boundaries.mts reads the boundaries of config/editor-boundaries.json (EDT-2, EDT-3, T23.4, T27.1-37).
editor-boundary-check: ## Check that adapters do not use the parser and the language service uses no editor, Node.js or DOM module
	$(NODE) scripts/check-editor-boundaries.mts

doc-coverage: ## Check that public symbols carry documentation comments
	$(NODE) scripts/check-doc-coverage.mts

schema-check: schema-fixtures-check schema-mutations-check ## Validate the AST schema and fixtures

.PHONY: schema-fixtures-check schema-mutations-check
schema-fixtures-check:
	$(NODE) scripts/check-schema.mts
schema-mutations-check:
	$(NODE) scripts/check-schema-mutations.mts

docs-check: compiler-interface-generate schema-check doc-coverage benchmark-docs-check docs-markup-check ## Document checks

.PHONY: docs-markup-check
docs-markup-check:
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node -- --test-concurrency=1 tests/scripts/docs-markup.test.mts

.PHONY: benchmark-docs-check
benchmark-docs-check:
	$(NODE) scripts/update-benchmark-docs.mts --check

compiler-interface-generate: ## Generate the typed compiler Mermaid diagrams
	$(NODE) scripts/generate-compiler-interface.mts

compiler-interface-check: compiler-interface-generate compiler-interface-languages-check compiler-interface-mutations-check ## Verify the typed generated module structure in every language

.PHONY: compiler-interface-languages-check compiler-interface-mutations-check
compiler-interface-languages-check: build-php python-package
	$(NODE) scripts/check-compiler-interface.mts
compiler-interface-mutations-check: build-php python-package
	$(NODE) scripts/check-compiler-interface-mutations.mts

docs: compiler-interface-generate ## Build the documentation site
	$(VITEPRESS) build docs

# The copy of the first build goes into a directory of this run outside the checkout, which the recipe removes, so two
# runs never share it (T19.7).
docs-verify-idempotent: docs ## Build the documentation site twice and compare
	@first=$$(mktemp -d) || exit 1; cp -R docs/.vitepress/dist "$$first/dist" && $(VITEPRESS) build docs && diff -r "$$first/dist" docs/.vitepress/dist; status=$$?; rm -rf "$$first"; exit $$status

docs-static-check: docs ## Build the documentation site as static files
	$(NODE) scripts/check-docs-static.mts

contract-generate: ## Generate the declarations and Mermaid diagrams of the showcase adapters (not tracked)
	$(NODE) scripts/generate-showcase-contract.mts

contract-check: build-ts build-php python-package typed-generator ## Verify generated declarations, implementations and runtime state recovery
	$(NODE) scripts/check-showcase-contract.mts

# showcase measures the modes into var/showcase and checks that measurement; the committed benchmark and its documents change
# only through make bench, so a showcase build leaves the tracked tree as it was (T26.7-87).
showcase: typed-generator build-php python-package ## Build the executable example site and its result artifacts
	$(NODE) examples/showcase/build.mts --write --langs $(SHOWCASE_LANGS)
	$(NODE) scripts/check-showcase-contract.mts
	$(NODE) examples/showcase/benchmark-modes.mts --output var/showcase/mode-benchmark.json
	$(NODE) scripts/check-benchmark-results.mts var/showcase/mode-benchmark.json
	$(NODE) examples/showcase/build-site.mts

bench: typed-generator build-php python-package ## Measure production AST and generated artifacts
	$(NODE) examples/showcase/benchmark-modes.mts --output examples/site/data/mode-benchmark.json
	$(NODE) scripts/check-benchmark-results.mts
	$(NODE) scripts/update-benchmark-docs.mts

benchmark-check: benchmark-results-check benchmark-docs-check ## Verify committed benchmark structure and equal output

.PHONY: benchmark-results-check
benchmark-results-check:
	$(NODE) scripts/check-benchmark-results.mts

benchmark-smoke: typed-generator build-php ## Measure a fresh short equal-output sample without changing committed results
	$(NODE) scripts/check-benchmark-smoke.mts

template-function-inventory: ## Inventory function-shaped calls in an explicit external template tree
	@test -n "$(TEMPLATE_SOURCE_ROOT)" || { echo "TEMPLATE_SOURCE_ROOT is required"; exit 1; }
	$(NODE) scripts/inventory-template-functions.mts --root "$(TEMPLATE_SOURCE_ROOT)"

function-contract-check: function-contract-registries-check function-contract-runtimes-check ## Check the canonical function contract against all language registries

.PHONY: function-contract-registries-check function-contract-runtimes-check
function-contract-registries-check:
	$(NODE) scripts/check-function-contract.mts
function-contract-runtimes-check:
	$(NODE) tests/runner/function-contract.mts


showcase-check: typed-generator-compile-check showcase-build-check contract-check showcase-site-check showcase-html-check ## Verify example-site parity, repeatability and browser output

.PHONY: showcase-build-check showcase-site-check showcase-html-check
# The compiled AST artifacts and the generated programs are built by showcase-compile and typed-generator and are not tracked
# (RT-57): each manifest records the digests of its source, types, contract and compiler, and the build reuses an artifact
# whose digests match.
showcase-build-check: typed-generator build-php
	$(NODE) examples/showcase/build.mts --check --langs $(SHOWCASE_LANGS)
showcase-site-check: showcase-build-check
	$(NODE) examples/showcase/build-site.mts
showcase-html-check: showcase-site-check
	$(NODE) scripts/check-showcase-html.mts

showcase-compile: build-ts ## Build the canonical AST artifacts of the showcase
	$(NODE) examples/showcase/compile.mts --refresh true

generated-native-check: generated-native-calls-check generated-typed-values-check generated-typed-locals-check generated-arguments-check generated-bound-data-check ## Execute generated member and class calls with native, typed and bound values, typed locals that decode once, and typed request argument errors, in every core language

.PHONY: generated-native-calls-check generated-typed-values-check generated-typed-locals-check generated-arguments-check generated-bound-data-check
generated-native-calls-check: build-ts build-php python-package
	$(NODE) scripts/check-generated-native-calls.mts
generated-typed-values-check: build-ts build-php python-package
	$(NODE) scripts/check-generated-typed-values.mts
generated-typed-locals-check: build-ts
	$(NODE) scripts/check-generated-typed-locals.mts
generated-arguments-check: build-ts build-php python-package
	$(NODE) scripts/check-generated-arguments.mts
generated-bound-data-check: build-ts build-php python-package
	$(NODE) scripts/check-generated-bound-data.mts

typed-generator: showcase-compile contract-generate ## Generate type-fixed host source from canonical AST and the contract declarations of the adapters
	$(NODE) examples/showcase/compile-generated.mts --refresh true

typed-generator-check: typed-generator ## Verify type-fixed generated source is reproducible
	$(NODE) examples/showcase/compile-generated.mts --refresh dev --check

compiler-ir-check: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check ## Verify canonical AST coverage and type/scope rejection in the shared compiler IR

.PHONY: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check
ast-artifact-check: build-ts
	$(NODE) scripts/check-ast-artifact.mts
generated-artifact-check: build-ts showcase-compile
	$(NODE) scripts/check-generated-artifact.mts
compiler-ir-rules-check: build-ts
	$(NODE) scripts/check-compiler-ir.mts
conformance-type-manifest-check: build-ts
	$(NODE) scripts/check-conformance-type-manifest.mts

typed-generator-compile-check: build-php python-package compiler-ir-check typed-generator-check ## Compile-check all type-fixed generated sources
	$(NODE) scripts/check-typed-generator.mts

.PHONY: generated-lint-check
generated-lint-check: build-php typed-generator ## Lint the generated Go, Rust, TypeScript and PHP programs as code of a consumer: formatter and unused code
	$(NODE) scripts/check-generated-lint.mts

clean: ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(LANGUAGE_DIR)/dist packages/*/dist.inputs.json packages/*/dist.next-* legacy/packages/*/dist.inputs.json legacy/packages/*/dist.next-* $(LSP_DIR)/dist $(CODEMIRROR_DIR)/dist $(VSCODE_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target examples/showcase/adapters/rust/target docs/.vitepress/dist var/build var/go

# ---- Bindings: generated from packages/rust/interface.json by binding ------------------------------------------------
# The root Cargo workspace holds the core crate and the binding crates that binding scaffold writes (binding L-2). binding
# is not yet a package that package-lock.json pins; until it is, BINDING names the cli (packages/ts/src/cli.ts) of a
# binding checkout, and the targets refuse to run without it. bindings writes the generated folders of packages/ts,
# packages/ts/wasm, packages/python, packages/php-ext and packages/go, which Git ignores; bindings-check runs the contract check, which also compares the
# tracked binding packages with what binding scaffold writes (CK-19) and the pin of the root Cargo.lock (CK-20).
BINDING_CRATES := polyspec-template-node polyspec-template-wasm polyspec-template-python polyspec-template-php-ext polyspec-template-go
BINDING ?=
.PHONY: bindings bindings-check lint-bindings test-bindings
bindings:
	@test -n "$(BINDING)" || { echo "bindings: set BINDING to the cli of binding"; exit 1; }
	$(NODE) $(BINDING) generate --root $(CURDIR)
bindings-check:
	@test -n "$(BINDING)" || { echo "bindings-check: set BINDING to the cli of binding"; exit 1; }
	$(NODE) $(BINDING) check $(CURDIR)/packages/rust/interface.json
# The lint and the tests of the binding crates, after make bindings writes their generated folders.
lint-bindings: bindings
	$(CARGO) clippy --locked $(foreach crate,$(BINDING_CRATES),-p $(crate)) --all-targets -- -D warnings
test-bindings: bindings
	$(CARGO) test --locked $(foreach crate,$(BINDING_CRATES),-p $(crate))
