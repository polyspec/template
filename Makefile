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
CARGO = $(NODE) $(KIT_LINK) cargo $(CURDIR)
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
# The link utility of kit, through which the Makefile and the TypeScript scripts run cargo (T28.98, T28.99).
export KIT_LINK := $(KIT)/link.$(KIT_EXT)

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
	@test -f "$(KIT)/bootstrap/bootstrap.$(KIT_EXT)" || { echo "install-tools: the kit of node_modules is missing; a fresh checkout runs make bootstrap first (the steps of the kit-bootstrap action, T28.150)" >&2; exit 2; }
	$(ONLINE) $(BOOTSTRAP_NODE) $(KIT)/bootstrap/bootstrap.$(KIT_EXT)
else
	@test -f "$(KIT)/install-tools.$(KIT_EXT)" || { echo "install-tools: the kit of node_modules is missing; a fresh checkout runs make bootstrap first (the steps of the kit-bootstrap action, T28.150)" >&2; exit 2; }
	$(COMPOSER_TOOL_ENV) $(ONLINE) $(NODE) $(KIT)/install-tools.$(KIT_EXT) --no-self-update $(TOOLS)
endif

# The steps of the kit-bootstrap action of CI for a fresh checkout, as one target (T28.150): npm of devEngines installs the
# packages of package-lock.json with --prefix at the checkout (npm 11 refuses the devEngines of npm 12), then install-tools
# TOOLS=npm and install-packages run.
.PHONY: bootstrap
bootstrap: ## The kit-bootstrap steps of a fresh checkout: npm ci with the npm of devEngines, install-tools TOOLS=npm, install-packages; ONLINE
	@root="$(CURDIR)"; version="$$($(BOOTSTRAP_NODE) -p 'require("./package.json").devEngines.packageManager.version')"; \
	test -n "$$version" || { echo 'bootstrap: package.json names no devEngines npm version' >&2; exit 2; }; \
	(cd "$${RUNNER_TEMP:-$${TMPDIR:-/tmp}}" && npm_config_cache="$$root/var/bootstrap/npm-cache" $(ONLINE) npm exec --yes --package="npm@$$version" -- npm --prefix "$$root" ci --ignore-scripts)
	$(MAKE) --no-print-directory install-tools TOOLS=npm
	$(MAKE) --no-print-directory install-packages

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
# The binding crates are packages of the root workspace alone, so only the step of that workspace gets their exclusion
# (--workspace-args, kit K1195): cargo warns of an excluded package that a workspace does not hold (T28.30).
lint-rust: ## Lint the Rust: cargo clippy in each Cargo workspace, without the binding crates (lint-bindings)
	$(NODE) $(KIT)/lint-rust.$(KIT_EXT) --locked --workspace-args . $(foreach crate,$(BINDING_CRATES),--exclude $(crate))
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
# Each job of .github/workflows/ci.yml runs one recipe ci-<job>, and each job of assets.yml, which GitHub names assets / <job>,
# one recipe ci-assets-<job>, with the values of its matrix and the input release of assets.yml as make variables, so that a
# local run is the call that CI makes: make ci-<job> NAME=value. A recipe runs the installs and the setups of its job
# first, which stop at a failure, then the checks or the builds of the job with make ci-targets, each to its end, and its
# status is theirs. The other steps of a job only provision the runner (checkout, setup-php, the bootstrap action) or carry
# a result (upload-artifact).
.PHONY: ci-targets ci-passed ci-gates ci-lint ci-scripts ci-generated ci-delimiters ci-showcase ci-docs ci-typescript ci-browser \
	ci-python ci-editor ci-go ci-rust ci-php ci-php-ext ci-bindings ci-assets-platform ci-assets-php ci-assets-npm ci-release-tag ci-release-release ci-pages-pages
CI_REPORT ?= var/report/ci-targets
# VIRTUAL_DISPLAY=1 runs the targets on a virtual X server on Linux, where VS Code has no display; macOS needs none.
XVFB_RUN := $(if $(filter Linux,$(shell uname -s)),xvfb-run -a)
ci-targets: ## Run TARGETS past failures and write CI_REPORT: the log of each target, record.json and summary.md; VIRTUAL_DISPLAY=1 on a virtual X server
	$(if $(VIRTUAL_DISPLAY),$(XVFB_RUN)) $(NODE) $(KIT)/ci-targets.$(KIT_EXT) -k $(CI_REPORT) $(TARGETS)
ci-passed: ## Fail unless every job of RESULTS, the JSON of toJSON(needs), has the result success
	$(NODE) $(KIT)/ci-passed.$(KIT_EXT)

ci-gates: ## The job gates: make install, then the checks of the repository; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory ci-targets TARGETS="layout-check docs-check rules-check owner-validate rebuild-check language-check duplication-check suppression-check"
ci-lint: ## The job lint: make install, then the lint of every language and the checks of the PHP extension; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory ci-targets TARGETS="lint-ts lint-go lint-rust lint-php lint-python lint-php-ext test-php-ext"
ci-scripts: ## The job scripts: make install and the browsers, then the tests of the scripts; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory template-install-browsers
	$(MAKE) --no-print-directory ci-targets TARGETS="template-test-scripts template-install-check function-contract-check function-inventory-check benchmark-check"
ci-generated: ## The job generated: make install, then the checks of the generated code; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory ci-targets TARGETS="conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php generated-native-check typed-generator-compile-check generated-lint-check"
ci-delimiters: ## The job delimiters: make install, then the delimiter matrix; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory ci-targets TARGETS="delimiter-matrix"
ci-showcase: ## The job showcase: make install, then the checks of the showcase and the documentation site; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory ci-targets TARGETS="showcase-check contract-check benchmark-smoke template-lint-showcase-format template-lint-showcase-warnings compiler-interface-check docs-static-check docs-verify-idempotent"
ci-docs: ## The job docs: make install and make hooks, then the hooks check and the type checks; ONLINE
	$(MAKE) --no-print-directory install
	$(MAKE) --no-print-directory hooks
	$(MAKE) --no-print-directory ci-targets TARGETS="hooks-check typecheck template-test-compiler-types"
ci-typescript: ## The job typescript: the Node.js packages, then their tests and the checks of the editor layers and formatter; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="node rust"
	$(MAKE) --no-print-directory template-install-node
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory ci-targets TARGETS="test-ts conformance-ts editor-boundary-check format-check template-test-language template-test-lsp"
ci-browser: ## The job browser: the Node.js packages, the Rust toolchain and the browsers, then the browser tests and the CodeMirror tests; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="node rust"
	$(MAKE) --no-print-directory template-install-node
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory template-install-browsers
	$(MAKE) --no-print-directory ci-targets TARGETS="template-test-browser template-test-codemirror"
ci-python: ## The job python: Python, uv and the Python environment, then the Python tests; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="python uv rust"
	$(MAKE) --no-print-directory template-install-python
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory ci-targets TARGETS="test-python conformance-python conformance-generated-python"
ci-editor: ## The editor tests, run locally only: CI does not run them (T28.147); the browsers and VS Code of template-install-vscode, then the tests on a virtual display; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="node rust"
	$(MAKE) --no-print-directory template-install-node
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory template-install-browsers
	$(MAKE) --no-print-directory template-install-vscode
	$(MAKE) --no-print-directory ci-targets VIRTUAL_DISPLAY=1 TARGETS="editor-boundary-check template-test-language format-check template-test-lsp template-test-codemirror template-test-vscode template-test-vscode-integration"
ci-go: ## The job go: Go, the modules of go.work, the Rust toolchain and the crates that binding generate reads, then the Go checks; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="go rust"
	$(MAKE) --no-print-directory template-install-go
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory ci-targets TARGETS="template-lint-go-format template-lint-go-modules test-go conformance-go"
ci-rust: ## The job rust: the Rust toolchain and the crates, then the Rust checks; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="rust"
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory ci-targets TARGETS="fmt-check test-rust conformance-rust"
ci-php: ## The job php: Composer and the PHP dependency graph for the PHP on PATH, then the PHP checks; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="php composer rust"
	$(MAKE) --no-print-directory template-install-php
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(MAKE) --no-print-directory ci-targets TARGETS="template-lint-php-format test-php conformance-php"
ci-php-ext: ## The job php-ext: Composer, the PHP symbols and the PHP dependency graph, then the tests of the extension; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="php composer"
	$(MAKE) --no-print-directory install-symbols EXTRACTORS=php
	$(MAKE) --no-print-directory template-install-php
	$(MAKE) --no-print-directory ci-targets TARGETS="template-test-ext"
ci-bindings: ## The job bindings: the tools, the graphs and the release recipes, then the binding checks; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="rust go php composer python uv"
	$(MAKE) --no-print-directory template-install-bindings
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory ci-targets TARGETS="lint-bindings check-declarations test-binding-crates test-binding-php test-binding-python test-binding-node test-binding-wasm test-binding-go"

# A job whose targets run the conformance of TypeScript builds the language service, and with it the WebAssembly module of the
# core (T28.122): it installs Rust and its crates, writes the release recipes, which hold install-wasm-bindgen, and installs
# the wasm-bindgen CLI. The jobs typescript, python, go, rust and php do so.
# The jobs of assets.yml. Each writes the release recipes, and with RELEASE=true, the input release of assets.yml that the
# workflow release passes, runs the release check of binding before it builds; the builds run each to its end.
ci-assets-platform: ## The job platform of assets.yml: the Go static library, the wheel and the npm platform package of this host; RELEASE=true; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="rust go"
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory template-install-go
	$(MAKE) --no-print-directory install-tools TOOLS="uv python"
	$(MAKE) --no-print-directory release-recipes
	$(if $(filter true,$(RELEASE)),$(MAKE) --no-print-directory release-binding-check,$(MAKE) --no-print-directory bindings-check)
	$(MAKE) --no-print-directory ci-targets TARGETS="release-go-static release-wheel release-npm-platform"
# The job provisions the LLVM of config/toolchain.json before this recipe (binding GN-19i): the ubuntu-26.04 images hold it at
# /usr/lib/llvm-<major>, the default LLVM_ROOT of packages/release.mk, and on macOS install-llvm-action installs it and sets
# LLVM_PATH, which the build takes as LLVM_ROOT. The action also appends DYLD_LIBRARY_PATH and LD_LIBRARY_PATH with /usr/lib
# first, which make the PHP of the job load the system libsqlite3 and abort, so the recipe empties both.
ci-assets-php: DYLD_LIBRARY_PATH :=
ci-assets-php: LD_LIBRARY_PATH :=
ci-assets-php: ## The job php of assets.yml: the PHP extension for the PHP on PATH, whose minor is EXPECTED_PHP_MINOR; RELEASE=true; ONLINE
	@test -n "$(EXPECTED_PHP_MINOR)" || { echo 'ci-assets-php needs EXPECTED_PHP_MINOR, the PHP minor of the job, for example make ci-assets-php EXPECTED_PHP_MINOR=8.4' >&2; exit 2; }
	$(MAKE) --no-print-directory install-tools TOOLS="rust go"
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory template-install-go
	$(MAKE) --no-print-directory release-recipes
	$(if $(filter true,$(RELEASE)),$(MAKE) --no-print-directory release-binding-check,$(MAKE) --no-print-directory bindings-check)
	$(MAKE) --no-print-directory release-php-ext PHP=php EXPECTED_PHP_MINOR=$(EXPECTED_PHP_MINOR) $(if $(LLVM_PATH),LLVM_ROOT=$(LLVM_PATH))
ci-assets-npm: ## The job npm of assets.yml: the npm package with the wasm-bindgen of mise.toml; RELEASE=true; ONLINE
	$(MAKE) --no-print-directory install-tools TOOLS="rust go"
	$(MAKE) --no-print-directory template-install-rust
	$(MAKE) --no-print-directory template-install-go
	$(MAKE) --no-print-directory release-recipes
	$(MAKE) --no-print-directory install-wasm-bindgen
	$(if $(filter true,$(RELEASE)),$(MAKE) --no-print-directory release-binding-check,$(MAKE) --no-print-directory bindings-check)
	$(MAKE) --no-print-directory release-npm
	$(MAKE) --no-print-directory release-install-check

# The archive of @polyspec/template carries the render entry (T28.148): its folder render is built before release-npm packs it.
release-npm: template-build-ts-render

# ---- Release (.github/workflows/release.yml, config/release.json) -----------------------------------------------------------
# release-tag tags the commit of the successful CI run RUN with vX.Y.Z, X.Y.Z the newest section of the change log of that
# commit, and the Go module tags, and appends TAG and VERSION to GITHUB_ENV (kit K911, K924, K987).
.PHONY: release-prepare release-tools release-tools-path release-tag release-tag-output release-assets release-candidate-assets release-publish release-undraft release-coverage
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
release-tag-output: ## Give the later jobs of the release workflow TAG and VERSION, which release-tag wrote into the environment of its job, through GITHUB_OUTPUT; both are empty when the run releases nothing
	@test -n "$$GITHUB_OUTPUT" || { echo 'release-tag-output: GITHUB_OUTPUT is not set; run it in the release workflow'; exit 2; }
	printf 'tag=%s\nversion=%s\n' "$$TAG" "$$VERSION" >> "$$GITHUB_OUTPUT"
# The jobs of release.yml, each one recipe that its one run step runs (T28.61). ci-release-tag tags the commit of the CI run
# RUN and gives the later jobs the TAG and VERSION that release-tag appended to GITHUB_ENV, which a later line of the same
# step does not receive in its environment. ci-release-release builds and publishes the release of TAG: the tools of
# release-tools are on PATH for its later lines (RELEASE_PATH, in the order that release-tools-path gives them), the
# artifacts of the job assets, which the workflow downloads into var/release/downloaded before this step, join
# var/release/assets after release-assets, and the commit of the Go module carries the identity of GITHUB_ACTOR, the
# actor of the run.
RELEASE_PATH = PATH="$(KIT_TOOLS)/bin:$(KIT_TOOLS)/mise/shims:$$PATH"
RELEASE_IDENTITY = GIT_AUTHOR_NAME="$${GITHUB_ACTOR:?}" GIT_AUTHOR_EMAIL="$${GITHUB_ACTOR:?}@users.noreply.github.com" \
	GIT_COMMITTER_NAME="$${GITHUB_ACTOR:?}" GIT_COMMITTER_EMAIL="$${GITHUB_ACTOR:?}@users.noreply.github.com"
ci-release-tag: ## The job tag of release.yml: tag the commit of the CI run RUN, then write TAG and VERSION into GITHUB_OUTPUT; AUTO for workflow_run
	@test -n "$$GITHUB_ENV" || { echo 'ci-release-tag: GITHUB_ENV is not set; run it in the release workflow' >&2; exit 2; }
	$(MAKE) --no-print-directory release-tag
	$(MAKE) --no-print-directory release-tag-output TAG="$$(sed -n 's/^TAG=//p' "$$GITHUB_ENV" | tail -n 1)" VERSION="$$(sed -n 's/^VERSION=//p' "$$GITHUB_ENV" | tail -n 1)"
ci-release-release: ## The job release of release.yml: build, carry and publish the release of TAG with the downloaded platform assets; ONLINE
	@test -n "$(TAG)" || { echo 'ci-release-release: TAG is required, for example make ci-release-release TAG=v0.0.1' >&2; exit 2; }
	@command -v zip >/dev/null || { echo 'ci-release-release: Info-ZIP is required for Composer release archives; install the zip package on the Ubuntu runner' >&2; exit 1; }
	$(MAKE) --no-print-directory release-prepare
	$(MAKE) --no-print-directory release-tools
	$(RELEASE_PATH) $(MAKE) --no-print-directory install-tools TOOLS="rust"
	$(RELEASE_PATH) $(MAKE) --no-print-directory template-install-rust
	$(RELEASE_PATH) $(MAKE) --no-print-directory release-recipes
	$(RELEASE_PATH) $(MAKE) --no-print-directory install-wasm-bindgen
	$(RELEASE_PATH) $(MAKE) --no-print-directory release-assets
	mkdir -p var/release/assets && cp -R var/release/downloaded/. var/release/assets/
	$(RELEASE_PATH) $(MAKE) --no-print-directory install-tools TOOLS=go
	$(RELEASE_IDENTITY) $(RELEASE_PATH) $(MAKE) --no-print-directory release-go-module
	$(RELEASE_IDENTITY) $(RELEASE_PATH) $(MAKE) --no-print-directory release-go-module-push
	$(RELEASE_PATH) $(MAKE) --no-print-directory release-publish
	$(RELEASE_PATH) $(MAKE) --no-print-directory release-platform-assets
	$(RELEASE_PATH) $(MAKE) --no-print-directory release-undraft
# The job pages of pages.yml (T28.61): the Node tools, then the static site with VITEPRESS_BASE, the path /REPOSITORY/ of
# the site of the repository, and the TypeScript package, each to its end, then the example site of the CI run, which the
# workflow downloads into var/pages/example-site before this step, as docs/.vitepress/dist/examples/site.
ci-pages-pages: ## The job pages of pages.yml: build the documentation site under /REPOSITORY/ and add the downloaded example site; ONLINE
	@test -n "$(REPOSITORY)" || { echo 'ci-pages-pages: REPOSITORY is required, for example make ci-pages-pages REPOSITORY=template' >&2; exit 2; }
	$(MAKE) --no-print-directory install-tools TOOLS="node"
	VITEPRESS_BASE=/$(REPOSITORY)/ $(MAKE) --no-print-directory ci-targets TARGETS="docs-static-check build-ts"
	mkdir -p docs/.vitepress/dist/examples
	cp -R var/pages/example-site docs/.vitepress/dist/examples/site
	test -s docs/.vitepress/dist/examples/site/index.html
release-assets: ## Build the archive of every package of TAG and packages.json of its Composer packages into var/release/assets; ONLINE
	@test -n "$$TAG" || { echo "release-assets: TAG is required, for example make release-assets TAG=v0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets $(ONLINE) $(NODE) $(KIT)/release.$(KIT_EXT) assets "$$TAG"
release-candidate-assets: ## Build the archive of every package from the committed HEAD for VERSION into var/release/assets; ONLINE
	@test -n "$$VERSION" || { echo "release-candidate-assets: VERSION is required, for example make release-candidate-assets VERSION=0.0.1"; exit 1; }
	RELEASE_ASSETS=var/release/assets $(ONLINE) $(NODE) $(KIT)/release.$(KIT_EXT) candidate-assets "$$VERSION"
	$(MAKE) --no-print-directory release-packages-check
# release-rehearsal runs the preparation of a release of kit without a tag (T28.138): release-run prepare builds the candidate
# assets of the committed HEAD for the version of the first section ## X.Y.Z of CHANGELOG.md, in the environment that make
# exports, into the folder ASSETS, which lies outside the checkout. A call of the script of kit outside make has no
# environment of mise and fails on the mise.toml of the checkout.
.PHONY: release-rehearsal
release-rehearsal: build-ts template-build-language template-build-lsp template-build-compiler ## Prepare the release of the version of CHANGELOG.md from the committed HEAD without a tag, with its assets in ASSETS outside the checkout; ONLINE
	@test -n "$$ASSETS" || { echo "release-rehearsal: ASSETS is required, a folder outside the checkout, for example make release-rehearsal ASSETS=/tmp/template-candidate"; exit 1; }
	RELEASE_ASSETS="$$ASSETS" $(ONLINE) $(NODE) $(KIT)/release-run.$(KIT_EXT) prepare "$$(sed -n 's/^## \([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$$/\1/p' CHANGELOG.md | head -1)"
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
CHECK_TARGETS := layout-check docs-check rules-check owner-validate rebuild-check language-check duplication-check suppression-check lint-ts lint-go lint-rust lint-php lint-python lint-php-ext test-php-ext hooks-check typecheck template-test-compiler-types docs-static-check template-test-scripts editor-boundary-check compiler-interface-check contract-check function-contract-check function-inventory-check benchmark-check template-lint-go-format template-lint-go-modules fmt-check template-lint-showcase-format template-lint-showcase-warnings template-lint-php-format test-ts template-test-language template-test-lsp template-test-codemirror format-check test-go test-rust test-php conformance-ts conformance-go conformance-rust conformance-php conformance-python test-python conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python delimiter-matrix generated-native-check template-test-ext typed-generator-compile-check generated-lint-check template-install-check template-test-browser showcase-check benchmark-smoke docs-verify-idempotent lint-bindings check-declarations test-binding-crates test-binding-php test-binding-python test-binding-node test-binding-wasm test-binding-go

.PHONY: lint build test
lint: lint-ts lint-go lint-rust lint-php lint-python lint-php-ext template-lint-go-format template-lint-go-modules fmt-check template-lint-php-format template-lint-showcase-format template-lint-showcase-warnings ## Lint every package: the lint targets and the format checks

# The lint targets (lint-ts, lint-go, lint-rust, lint-php, lint-python) run oxlint with oxlint-tsgolint and knip,
# golangci-lint and deadcode, clippy, phpcs and PHPStan, and ruff and vulture with the configuration files of this repository
# (T24.6, kit K1050). They read the installed Composer packages and the crates, which these prerequisites provide.
lint-php: build-php typed-generator
lint-ts: typed-generator
lint-python: typed-generator
lint-rust: typed-generator
# The module packages/go holds the Go binding, whose files make bindings writes, so the lint reads the generation of
# this run and not one that an earlier run left.
lint-go: typed-generator bindings

.PHONY: template-lint-go-format template-lint-go-modules fmt-check template-lint-showcase-format template-lint-showcase-warnings template-lint-php-format
template-lint-go-format:
	@out=$$(gofmt -l $(GO_DIR) $(GO_BACKEND_DIR)) || exit 1; test -z "$$out" || { echo "gofmt -l $(GO_DIR) $(GO_BACKEND_DIR) lists files that are not formatted:"; echo "$$out"; exit 1; }
# go mod tidy ignores go.work, so each tracked go.mod requires the modules that its packages import, a module of this
# repository by its path inside the repository, and go.sum holds their sums; go mod tidy -diff names each module that differs
# (T27.1-60). The module packages/go is the Go binding, whose Go files make bindings writes and Git ignores, so the check
# tidies the generation of this run: without it no file of packages/go imports json, and tidy drops its requirement.
template-lint-go-modules: bindings
	@failed=; for module in $$(git ls-files ':(glob)**/go.mod'); do dir=$$(dirname $$module); echo "[go-modules] go mod tidy -diff in $$dir"; (cd $$dir && $(GO) mod tidy -diff) || failed="$$failed $$dir"; done; test -z "$$failed" || { echo "go mod tidy -diff fails in:$$failed"; exit 1; }
# fmt-check checks that every crate of the root workspace, the binding packages included, is in the form of rustfmt.
fmt-check:
	$(CARGO) fmt --all --check
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
	$(MAKE) template-python-environment

template-install-parity: template-install-node template-install-rust template-install-go template-install-php template-install-python ## Install every native graph in this checkout, without depending on other CI workers

template-install-vscode: ## Install the VS Code of the integration test into var/tools/vscode, after make install
	$(ONLINE) $(NODE) $(KIT)/install-vscode.$(KIT_EXT) $(VSCODE_DIR) $(VSCODE_TOOLS)

# The release steps are the release targets above (config/release.json). The archives are built from the
# built npm packages, so the targets that build them run those builds first.
# kit-check stops the release targets first when the kit of node_modules is missing (T28.150): their prerequisites would
# otherwise fail with the errors of the missing node of var/tools, and no check would name the kit.
.PHONY: kit-check
kit-check: ## Fail with the step that makes kit when node_modules holds no kit (a fresh checkout runs make bootstrap first)
	@test -f "$(KIT)/release.$(KIT_EXT)" || { echo "kit-check: the kit of node_modules is missing; a fresh checkout runs make bootstrap first (the steps of the kit-bootstrap action, T28.150)" >&2; exit 2; }
release-candidate-assets: kit-check build-ts template-build-language template-build-lsp template-build-compiler
release-assets: kit-check $(if $(findstring /,$(TAG)),,build-ts template-build-language template-build-lsp template-build-compiler)

template-install-browsers: ## Install the Chromium of Playwright and its system packages, after make install
	$(ONLINE) $(PLAYWRIGHT) install --with-deps chromium

# The validator of the template AST of legacy/packages/ts is ajv's standalone validation code of contracts/schema/ast.schema.json
# (T25.6-2): make ast-validator generates legacy/packages/ts/src/ast-validator.mjs before the build of the package, which makes the
# file when the schema or the generator is newer; the file is generated output and is not tracked. The package has no runtime
# dependency on ajv and compiles no schema at run time.
build-ts: template-build-ts ## Build the TypeScript package

# The TypeScript renderer of legacy/packages/ts is also built into packages/ts/render, which @polyspec/template exports as
# ./render beside the generated binding (runtime.md RT-80).
template-build-ts: ast-validator template-build-ts-render
	$(NODE) scripts/build-package.mts --package ts

.PHONY: template-build-ts-render
template-build-ts-render: ast-validator
	$(NODE) scripts/build-package.mts --package ts --dist packages/ts/render

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
# Two unit tests of legacy/packages/ts compile artifacts with the compiler, which parses with the WebAssembly module of the
# core (T28.140), so the unit tests build that module first.
template-test-ts-unit: build-ts checkout-wasm
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

test-rust: template-test-rust-clippy template-test-rust-unit template-test-rust-wasm ## Rust clippy and tests

.PHONY: template-test-rust-clippy template-test-rust-unit template-test-rust-wasm
template-test-rust-clippy:
	$(CARGO) clippy --locked --release --all-targets --all-features --manifest-path $(RUST_DIR)/Cargo.toml -- -D warnings
template-test-rust-unit:
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) cargo --cwd $(RUST_DIR) -- --locked --features __test_support,cli -- --test-threads=1
template-test-rust-wasm:
	$(CARGO) check --locked --target wasm32-unknown-unknown --manifest-path $(RUST_DIR)/Cargo.toml

test-php: template-test-php ## PHP unit tests

template-test-php: build-php
	COMPOSER_VENDOR_DIR=$(CURDIR)/vendor $(NODE) $(KIT)/run-tests.$(KIT_EXT) phpunit --cwd $(PHP_DIR)

template-test-scripts: build-rust typed-generator compiler-interface-generate build-ts template-build-language template-build-lsp template-build-codemirror build-php python-package release-recipes ## Tests of the test runner and the conformance runners
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node -- --test-concurrency=1 tests/scripts/

# The script tests that FILES names, with the environment of the Makefile: a test that starts a tool of var/tools through
# its mise shim needs the MISE_* settings that the Makefile exports, which a node --test started by hand does not have
# (mise then refuses mise.toml as not trusted). It builds nothing: a test that reads a build names its target (HR-85).
.PHONY: template-test-script
template-test-script: ## Run the script tests FILES (tests/scripts/<name>.test.mts ...) with the environment of the Makefile; offline
	$(if $(strip $(FILES)),,$(error make template-test-script needs FILES, the test files to run))
	$(NODE) $(KIT)/run-tests.$(KIT_EXT) node -- --test-concurrency=1 $(FILES)

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

# The language service parses with the Rust core through the WebAssembly module of packages/ts (T28.122), a build output that
# Git ignores, so its build makes that module first: checkout-wasm runs make bindings, which writes the generated folders of
# every binding again, so a checkout that a consumer links runs make checkout after it.
template-build-language: build-ts checkout-wasm ## Build the formatter library and the template-fmt CLI, after the WebAssembly module of the core
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
# The compiler parses with the Rust core through the WebAssembly module of packages/ts and reads the AST with the renderer of
# packages/ts/render (T28.140): build-ts builds the renderer and checkout-wasm the module, as the language service has them.
# Every target whose recipe runs the compiler from its sources names checkout-wasm too, so make and the dry run of a job
# know that it needs the module (tests/scripts/ci-job-tools.test.mts).
template-build-compiler: build-ts checkout-wasm ## Build the compiler package @polyspec/template-compiler, after the WebAssembly module of the core
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

conformance: build-ts template-build-language python-package build-go build-rust build-php build-php-ext ## Cross-language conformance suite (builds every implementation first)
	$(NODE) tests/runner/conformance.mts

# The conformance of TypeScript and one other language, as the language jobs of CI run it (T20.1-8).
# The driver of TypeScript formats with the language service, which it builds with make template-build-language when it
# runs (tests/runner/drivers.mts); each target names that build as its prerequisite, so make and the dry run of a job know
# that the conformance needs the WebAssembly module of the core (T28.122).
.PHONY: conformance-ts conformance-go conformance-rust conformance-php conformance-python
conformance-ts: build-ts template-build-language ## Conformance suite of TypeScript
	$(NODE) tests/runner/conformance.mts --langs ts
conformance-go: build-ts template-build-language build-go ## Conformance suite of TypeScript and Go
	$(NODE) tests/runner/conformance.mts --langs ts,go
conformance-rust: build-ts template-build-language build-rust ## Conformance suite of TypeScript and Rust
	$(NODE) tests/runner/conformance.mts --langs ts,rust
conformance-php: build-ts template-build-language build-php ## Conformance suite of TypeScript and PHP
	$(NODE) tests/runner/conformance.mts --langs ts,php

delimiter-matrix: build-ts template-build-language build-go build-rust build-php ## Exercise every valid delimiter pair in every language
	$(NODE) tests/runner/delimiter-matrix.mts

conformance-generated-ts: build-ts checkout-wasm ## TypeScript generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-ts.mts

conformance-generated-go: build-ts checkout-wasm ## Go generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-go.mts

conformance-generated-rust: build-ts checkout-wasm ## Rust generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-rust.mts

conformance-generated-php: build-ts checkout-wasm build-php ## PHP generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-php.mts

conformance-python: build-ts template-build-language python-package ## Conformance suite of TypeScript and Python
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

.PHONY: python-package template-python-environment
python-package: $(PYTHON_VENV)/.installed ## Make the environment of the Python package with legacy/packages/python installed and its package folder linked to the checkout; offline

$(PYTHON_VENV)/.installed: $(PYTHON_PACKAGE)/pyproject.toml $(PYTHON_PACKAGE)/pylock.toml $(PYTHON_PACKAGE)/build-requirements.txt
	$(MAKE) template-python-environment

# The environment is made again each time the target runs: the stamp states that the environment is installed, not that the
# wheels of the lock are in the uv cache of the checkout (var/tools/mise/cache/uv), which a later install of var/tools
# empties. make template-install-python runs this target, so an install fills that cache whatever the stamp says, and
# tests/scripts/package-installs.test.mts reads the wheels from it offline (T28.44).
template-python-environment:
	rm -rf $(PYTHON_VENV)
	$(MAKE) python-venv DIR=$(PYTHON_VENV)
	$(UV) pip install --python $(PYTHON_VENV)/bin/python --link-mode copy -r $(PYTHON_PACKAGE)/pylock.toml
	$(UV) pip install --python $(PYTHON_VENV)/bin/python --offline --no-index --find-links $(WHEELHOUSE) --link-mode copy --no-deps $(PYTHON_PACKAGE)
	$(MAKE) --no-print-directory install-link
	touch $(PYTHON_VENV)/.installed

test-python: template-test-python ## Unit tests of the Python package

template-test-python: python-package
	PYTHONUNBUFFERED=1 NO_COLOR=1 PYTHON_COLORS=0 $(NODE) $(KIT)/run-tests.$(KIT_EXT) python --venv $(PYTHON_VENV) -- discover -s $(PYTHON_PACKAGE)/tests -t $(PYTHON_PACKAGE)

conformance-generated-python: build-ts checkout-wasm python-package ## Python generated compiler conformance suite
	$(NODE) tests/runner/conformance-generated-python.mts

conformance-all-modes: conformance conformance-generated-ts conformance-generated-go conformance-generated-rust conformance-generated-php conformance-generated-python ## AST and generated conformance in every language

conformance-cases: build-ts template-build-language python-package build-go build-rust build-php build-php-ext ## AST and generated conformance in every language for the cases of CASES only
	$(NODE) scripts/conformance-cases.mts $(CASES)

function-inventory-check: ## Inventory the function-shaped calls of the fixture template
	$(NODE) tests/runner/function-inventory.mts

template-install-check: template-install-workspace-check package-installs-check ## Install immutable package artifacts in isolated install projects

.PHONY: template-install-workspace-check package-installs-check
template-install-workspace-check:
	$(NODE) scripts/check-install-workspace.mts
package-installs-check: typed-generator
	$(NODE) scripts/check-package-installs.mts
# The archives of npm that a release carries install from what releases carry alone (T28.129): the archive of
# @polyspec/template that make release-npm packed into var/release/assets/npm, the archives of the language service, the
# language server and the compiler (T28.140), and the archive of @polyspec/json of its release, which the install fetches.
.PHONY: release-install-check
release-install-check: template-build-lsp template-build-compiler ## Install the npm archives of a release in an empty folder and import them, after make release-npm; ONLINE
	$(ONLINE) $(NODE) scripts/check-release-install.mts --template var/release/assets/npm/polyspec-template-$$($(NODE) -p 'require("./packages/ts/package.json").version').tgz

# The packages.json of the Composer packages of the release names the shasum of every dist (T28.149): run after the
# assets are built, before the release, so that a dist without its shasum stops the release (HR-80).
.PHONY: release-packages-check
release-packages-check: ## Check the packages.json of var/release/assets: every dist names its sha1, or is a pre-packaged php-ext whose platform zip names are those that release-php-ext makes
	$(NODE) scripts/check-release-packages.mts var/release/assets/packages.json

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

showcase-compile: build-ts checkout-wasm ## Build the canonical AST artifacts of the showcase
	$(NODE) examples/showcase/compile.mts --refresh true

generated-native-check: generated-native-calls-check generated-typed-values-check generated-typed-locals-check generated-arguments-check generated-bound-data-check ## Execute generated member and class calls with native, typed and bound values, typed locals that decode once, and typed request argument errors, in every core language

.PHONY: generated-native-calls-check generated-typed-values-check generated-typed-locals-check generated-arguments-check generated-bound-data-check
generated-native-calls-check: build-ts checkout-wasm build-php python-package
	$(NODE) scripts/check-generated-native-calls.mts
generated-typed-values-check: build-ts checkout-wasm build-php python-package
	$(NODE) scripts/check-generated-typed-values.mts
generated-typed-locals-check: build-ts checkout-wasm
	$(NODE) scripts/check-generated-typed-locals.mts
generated-arguments-check: build-ts checkout-wasm build-php python-package
	$(NODE) scripts/check-generated-arguments.mts
generated-bound-data-check: build-ts checkout-wasm build-php python-package
	$(NODE) scripts/check-generated-bound-data.mts

typed-generator: showcase-compile contract-generate ## Generate type-fixed host source from canonical AST and the contract declarations of the adapters
	$(NODE) examples/showcase/compile-generated.mts --refresh true

typed-generator-check: typed-generator ## Verify type-fixed generated source is reproducible
	$(NODE) examples/showcase/compile-generated.mts --refresh dev --check

compiler-ir-check: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check ## Verify canonical AST coverage and type/scope rejection in the shared compiler IR

.PHONY: ast-artifact-check generated-artifact-check compiler-ir-rules-check conformance-type-manifest-check
ast-artifact-check: build-ts checkout-wasm
	$(NODE) scripts/check-ast-artifact.mts
generated-artifact-check: build-ts showcase-compile
	$(NODE) scripts/check-generated-artifact.mts
compiler-ir-rules-check: build-ts
	$(NODE) scripts/check-compiler-ir.mts
conformance-type-manifest-check: build-ts checkout-wasm
	$(NODE) scripts/check-conformance-type-manifest.mts

typed-generator-compile-check: build-php python-package compiler-ir-check typed-generator-check ## Compile-check all type-fixed generated sources
	$(NODE) scripts/check-typed-generator.mts

.PHONY: generated-lint-check
generated-lint-check: build-php typed-generator ## Lint the generated Go, Rust, TypeScript and PHP programs as code of a consumer: formatter and unused code
	$(NODE) scripts/check-generated-lint.mts

clean: ## Remove build outputs
	rm -rf $(TS_DIR)/dist $(LANGUAGE_DIR)/dist packages/*/dist.inputs.json packages/*/dist.next-* legacy/packages/*/dist.inputs.json legacy/packages/*/dist.next-* $(LSP_DIR)/dist $(CODEMIRROR_DIR)/dist $(VSCODE_DIR)/dist $(GO_DIR)/template $(RUST_DIR)/target examples/showcase/adapters/rust/target docs/.vitepress/dist var/build var/go

# ---- Bindings: generated from packages/rust/interface.json by binding ------------------------------------------------
# The root Cargo workspace holds the core crate and the binding crates that binding scaffold writes (binding L-2). binding is
# the npm package @polyspec/binding of package.json, the asset of the GitHub Release of the tag that every dependency line on
# polyspec-binding-core names, so that the tool and the crate are one release (binding CK-20, CK-70); package-lock.json pins
# it by its integrity. binding reads the crates of Cargo.lock offline, which make template-install-rust fetches. bindings
# writes the generated folders of packages/ts, packages/ts/wasm, packages/python, packages/php-ext and packages/go, which Git
# ignores; bindings-check runs the contract check, which also compares the tracked binding packages with what binding
# scaffold writes (CK-19) and the pin of the root Cargo.lock (CK-20).
BINDING_CRATES := polyspec-template-node polyspec-template-wasm polyspec-template-python polyspec-template-php-ext polyspec-template-go
BINDING := $(CURDIR)/node_modules/.bin/binding
# The five targets of the contract, each of which has its target test-binding-<target>.
BINDING_TARGETS := php python node wasm go
.PHONY: check-declarations-node test-binding-python-venv test-binding-python-clean test-binding-python-wheel test-binding-python-install binding-node-package-wasm-bindgen-check binding-node-package-wasm-build binding-node-package-wasm-glue binding-node-package-node-build binding-node-package-clean binding-node-package-dirs binding-node-package-addon binding-node-package-platform-manifest binding-node-package-platform-pack binding-node-package-pack binding-node-package-manifest binding-node-package-deps test-binding-node-copy test-binding-wasm-copy test-binding-php-build test-binding-php-lint test-binding-go-build test-binding-go-format test-binding-go-vet-module test-binding-go-vet
.PHONY: bindings bindings-check lint-bindings test-bindings check-declarations binding-node-package test-binding-crates \
	$(foreach target,$(BINDING_TARGETS),test-binding-$(target)) template-install-bindings
bindings:
	$(NODE) $(BINDING) generate --root $(CURDIR) --cargo "$(CARGO)"
# The check compares packages/release.mk, which Git ignores, with what binding release-recipes writes (binding CK-94), so it
# writes that file first: a file that an earlier binding wrote would fail the check of the current one.
bindings-check: release-recipes
	$(NODE) $(BINDING) check $(CURDIR)/packages/rust/interface.json --cargo "$(CARGO)"
# The binding packages are the packages that a release publishes (docs/spec/runtime.md#transition), so the full suite runs
# the generated tests of each target of the contract, which hold the cases of contracts/core-cases.json that `cases` of
# packages/rust/interface.json names (binding G-5, GN-13e), on the standard runner of its language, each in its own target
# test-binding-<target>, against a build with the test features of its crate (binding GN-5): unittest against the installed
# wheel, node --test against the installed npm package and through its subpath ./wasm, PHPUnit with the extension loaded and
# go test with the static library. The job bindings of .github/workflows/ci.yml runs them; the legacy packages keep their
# own tests in the other jobs until each is removed (V-6 (5)).
test-bindings: lint-bindings check-declarations test-binding-crates $(foreach target,$(BINDING_TARGETS),test-binding-$(target))
# The build script of ext-php-rs runs bindgen, which reads the libclang and the clang of the LLVM of config/toolchain.json:
# LLVM_ROOT of packages/release.mk, an LLVM that the machine provides (binding GN-19i); without that file bindgen finds them
# itself.
BINDING_LLVM = $(if $(LLVM_ROOT),LIBCLANG_PATH=$(LLVM_ROOT)/lib CLANG_PATH=$(LLVM_ROOT)/bin/clang)
# The lint and the tests of the binding crates, after make bindings writes their generated folders.
lint-bindings: bindings
	$(BINDING_LLVM) $(CARGO) clippy --locked $(foreach crate,$(BINDING_CRATES),-p $(crate)) --all-targets -- -D warnings
test-binding-crates: bindings
	$(BINDING_LLVM) $(CARGO) test --locked $(foreach crate,$(BINDING_CRATES),-p $(crate))
# The TypeScript compiler of package-lock.json checks the generated declarations of the Node binding and of its WASM binding.
check-declarations-node: bindings
	$(NODE) node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict packages/ts/generated/index.d.ts
check-declarations: check-declarations-node
	$(NODE) node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict packages/ts/wasm/generated/index.d.ts

# The tools of the job bindings beyond those of make install-tools: maturin and the wasm-bindgen CLI of mise.toml at the
# digests of mise.lock, the crates of every Cargo.lock, the Go modules of go.work and PHPUnit of composer.lock, which runs
# the generated tests of the PHP extension.
template-install-bindings: template-install-bindings-python-deps template-install-bindings-php-deps
.PHONY: template-install-bindings-tools template-install-bindings-python-deps template-install-bindings-php-deps
template-install-bindings-tools: template-install-rust template-install-go template-install-php
	$(ONLINE) $(KIT_TOOLS)/bin/mise install --locked github:PyO3/maturin github:wasm-bindgen/wasm-bindgen http:pie
# The wheels of json of packages/python/requirements-bindings.txt, which pip downloads and checks by their sha256.
template-install-bindings-python-deps: template-install-bindings-tools
	$(ONLINE) $(KIT_TOOLS)/mise/shims/python3 -m pip download -q --require-hashes --no-deps -r packages/python/requirements-bindings.txt -d $(BINDING_VAR)/deps/python
# The PHP extension of json that packages/php-ext/composer.json requires (ext-polyspec_json, polyspec/json at its version):
# PIE resolves it in the Composer repository of that json release and downloads the prebuilt archive for the PHP of PATH
# (.php-version) into BINDING_PIE. `pie download` installs nothing into the PHP; the tests load the library with -d extension.
PIE := $(KIT_TOOLS)/mise/shims/pie
BINDING_PIE = $(BINDING_VAR)/deps/php
BINDING_JSON_PHP = $(shell $(NODE) -p 'require("./packages/php-ext/composer.json").require["polyspec/json"]')
template-install-bindings-php-deps: template-install-bindings-tools
	rm -rf $(BINDING_PIE)
	$(ONLINE) env PIE_WORKING_DIRECTORY=$(BINDING_PIE) $(PIE) repository:add composer https://github.com/polyspec/json/releases/download/v$(BINDING_JSON_PHP)/packages.json --no-interaction
	$(ONLINE) env PIE_WORKING_DIRECTORY=$(BINDING_PIE) $(PIE) download polyspec/json:$(BINDING_JSON_PHP) --no-interaction
MATURIN := $(KIT_TOOLS)/mise/shims/maturin
BINDING_WASM_BINDGEN := $(KIT_TOOLS)/mise/shims/wasm-bindgen
BINDING_GOFMT := $(KIT_TOOLS)/mise/shims/gofmt
# The PHP of PATH, whose php-config the build script of ext-php-rs reads: the PHP of .php-version that setup-php provides.
BINDING_PHP ?= php
BINDING_PHPUNIT := $(CURDIR)/vendor/bin/phpunit
BINDING_VAR := $(CURDIR)/var/bindings
BINDING_DYLIB := $(if $(filter Darwin,$(shell uname -s)),dylib,so)
# The packages of the libraries that own the value classes of the contract (json), which the generated packages require
# (binding GN-15f, GN-6x): the wheels that template-install-bindings downloads, the npm packages of json that npm ci installs
# from the release assets of package.json, and the PHP extension of json, which PHP loads before the extension of template.
# A linked checkout gives those that its provider built (docs/operations/development.md).
BINDING_PYTHON_FIND_LINKS ?= $(BINDING_VAR)/deps/python
BINDING_NODE_DEPS ?= $(CURDIR)/node_modules/@polyspec/json $(CURDIR)/node_modules/@polyspec/json-$(BINDING_PLATFORM)
BINDING_PHP_EXTENSIONS ?= $(wildcard $(BINDING_PIE)/*/vendor/polyspec/json/polyspec_json.so)
# The test features of a binding crate: every feature of its manifest (binding GN-5), joined by commas.
binding_features = $(shell sed -n '/^\[features\]/,/^\[/s/^\([a-z][a-z0-9-]*\) = .*/\1/p' $(1) | paste -sd, -)

# The wheel that maturin builds for the Python of mise.toml, installed into a virtual environment without an index, and the
# generated tests on unittest, which fails a run that ran no test.
test-binding-python-venv: bindings
	$(KIT_TOOLS)/mise/shims/python3 -m venv --clear $(BINDING_VAR)/venv
test-binding-python-clean: test-binding-python-venv
	rm -rf $(BINDING_VAR)/wheels
test-binding-python-wheel: test-binding-python-clean
	cd packages/python && $(MATURIN) build --locked --interpreter $(BINDING_VAR)/venv/bin/python --features $(call binding_features,packages/python/Cargo.toml) --out $(BINDING_VAR)/wheels
test-binding-python-install: test-binding-python-wheel
	$(BINDING_VAR)/venv/bin/python -m pip install -q --no-index --find-links $(BINDING_PYTHON_FIND_LINKS) --force-reinstall $(BINDING_VAR)/wheels/*.whl
test-binding-python: test-binding-python-install
	cd $(BINDING_VAR) && venv/bin/python -m unittest discover -s $(CURDIR)/packages/python/generated/tests -t $(CURDIR)/packages/python/generated/tests

# The npm package with the addon of this platform and the WASM module, packed and installed into var/bindings/node as a
# release packs them (binding GN-3c, GN-18, P-5): the addon is the platform package that a release names in
# optionalDependencies, and the module and its glue are what the wasm-bindgen of mise.toml writes into
# packages/ts/wasm/generated.
BINDING_PLATFORM := $(shell $(NODE) -p 'process.platform + "-" + process.arch + (process.platform === "linux" ? "-gnu" : "")' 2>/dev/null)
BINDING_ADDON := template.$(BINDING_PLATFORM).node
# The addon of the Node binding beside the entry of packages/ts/generated, which the entry loads when no platform package is
# installed (`./template.<platform>.node`), so a consumer that links this checkout with .links runs the Node binding of its
# source (T28.106): the release build of the crate, as release-npm-platform builds it, without test features. binding 0.0.16
# gives this recipe as checkout-node-addon (B2.407).
# The native module of the Python binding in python-source of packages/python (polyspec/template/_native), which the package
# imports, so a consumer that links this checkout with .links imports the Python binding of its source (T28.108), on the
# principle of checkout-node-addon: maturin develop builds it in place with --skip-install, which installs nothing into the
# interpreter, through link maturin of kit (K1266), so the crates of the checkouts that .links names are built, in the
# release profile without test features, with the Python of mise.toml in a venv of its own, which maturin develop needs.
.PHONY: checkout-python-native-venv checkout-python-native
checkout-python-native-venv: bindings
	$(KIT_TOOLS)/mise/shims/python3 -m venv --clear $(BINDING_VAR)/checkout-venv
checkout-python-native: checkout-python-native-venv
	cd packages/python && VIRTUAL_ENV=$(BINDING_VAR)/checkout-venv MATURIN=$(MATURIN) $(NODE) $(KIT_LINK) maturin $(CURDIR)/packages/python develop --skip-install --release --locked
# The WebAssembly module and its glue in packages/ts/wasm/generated, which the entries . (browser) and ./wasm of
# @polyspec/template import, for a linked checkout (T28.110), on the principle of checkout-node-addon: built through link cargo
# of kit, in the release profile without test features, with the wasm-bindgen of mise.toml at the release of
# packages/ts/wasm/Cargo.toml.
.PHONY: checkout-wasm-bindgen-check checkout-wasm-build checkout-wasm
checkout-wasm-bindgen-check: bindings
	test "$$($(BINDING_WASM_BINDGEN) --version)" = "wasm-bindgen $(BINDING_WASM_BINDGEN_RELEASE)"
checkout-wasm-build: checkout-wasm-bindgen-check
	$(CARGO) build --locked --release -p polyspec-template-wasm --target wasm32-unknown-unknown
checkout-wasm: checkout-wasm-build
	$(BINDING_WASM_BINDGEN) --target web --out-dir packages/ts/wasm/generated --out-name template_wasm target/wasm32-unknown-unknown/release/polyspec_template_wasm.wasm
# Every entry that package.json of packages/ts exports and the Python package, for a consumer that links this checkout, in one
# run: each artifact lies in a folder that make bindings writes again, so separate runs of the targets one after the other
# leave only the last artifact, and one make run makes bindings once, before all (T28.108); the renderer of ./render and
# ./decode is built into packages/ts/render (T28.110).
.PHONY: checkout checkout-packages checkout-php-ext
checkout: checkout-node-addon checkout-wasm template-build-ts-render checkout-python-native checkout-packages checkout-php-ext
# The PHP extension of the binding, target/release/libpolyspec_template.$(BINDING_DYLIB), for a consumer that links this
# checkout (T28.114): make link of the consumer links vendor/polyspec/template to packages/php-ext, the Composer side of the
# PIE package polyspec/template, and the consumer loads this library with php -d extension= after the extension of json, in
# place of the binary of the PIE package. Built through link cargo of kit, in the release profile without test features.
checkout-php-ext: bindings
	$(BINDING_LLVM) $(CARGO) build --locked --release -p polyspec-template-php-ext
# The built output of the other npm packages that link providers of kit lists for this checkout (T28.111): build-ts builds
# legacy/packages/ts, the compiler, codemirror and vscode targets build their packages and, through their prerequisites,
# language and lsp.
checkout-packages: template-build-compiler template-build-codemirror template-build-vscode
# Every file that an npm provider of this checkout names in its exports, main or bin exists after make checkout, and each
# JavaScript entry of its exports loads (T28.111).
.PHONY: checkout-check
checkout-check: checkout
	$(NODE) scripts/check-checkout-exports.mts $(KIT)/link.$(KIT_EXT)
BINDING_WASM_BINDGEN_RELEASE := $(shell sed -n 's/^wasm-bindgen = "=\(.*\)"$$/\1/p' packages/ts/wasm/Cargo.toml)
binding-node-package-wasm-bindgen-check: bindings template-build-ts
	test "$$($(BINDING_WASM_BINDGEN) --version)" = "wasm-bindgen $(BINDING_WASM_BINDGEN_RELEASE)"
binding-node-package-wasm-build: binding-node-package-wasm-bindgen-check
	$(CARGO) build --locked -p polyspec-template-wasm --target wasm32-unknown-unknown --features $(call binding_features,packages/ts/wasm/Cargo.toml)
binding-node-package-wasm-glue: binding-node-package-wasm-build
	$(BINDING_WASM_BINDGEN) --target web --out-dir packages/ts/wasm/generated --out-name template_wasm target/wasm32-unknown-unknown/debug/polyspec_template_wasm.wasm
binding-node-package-node-build: binding-node-package-wasm-glue
	$(CARGO) build --locked -p polyspec-template-node --features $(call binding_features,packages/ts/Cargo.toml)
binding-node-package-clean: binding-node-package-node-build
	rm -rf $(BINDING_VAR)/node $(BINDING_VAR)/node-platform
binding-node-package-dirs: binding-node-package-clean
	mkdir -p $(BINDING_VAR)/node $(BINDING_VAR)/node-platform
binding-node-package-addon: binding-node-package-dirs
	cp target/debug/libpolyspec_template_node.$(BINDING_DYLIB) $(BINDING_VAR)/node-platform/$(BINDING_ADDON)
binding-node-package-platform-manifest: binding-node-package-addon
	$(NODE) -e 'const p = require("./packages/ts/package.json"); require("fs").writeFileSync("$(BINDING_VAR)/node-platform/package.json", JSON.stringify({ name: p.name + "-$(BINDING_PLATFORM)", version: p.version, os: [process.platform], cpu: [process.arch], main: "$(BINDING_ADDON)", files: ["$(BINDING_ADDON)"] }, null, 2) + "\n")'
binding-node-package-platform-pack: binding-node-package-platform-manifest
	cd $(BINDING_VAR)/node-platform && $(NPM) pack --pack-destination $(BINDING_VAR)/node
binding-node-package-pack: binding-node-package-platform-pack
	cd packages/ts && $(NPM) pack --pack-destination $(BINDING_VAR)/node
binding-node-package-manifest: binding-node-package-pack
	echo '{ "private": true }' > $(BINDING_VAR)/node/package.json
binding-node-package-deps: binding-node-package-manifest
	cd $(BINDING_VAR)/node && $(NPM) pack $(BINDING_NODE_DEPS)
binding-node-package: binding-node-package-deps
	cd $(BINDING_VAR)/node && $(NPM) install --offline --no-audit --no-fund --omit=optional ./*.tgz

# The generated tests of the Node binding on node --test, against the installed package.
test-binding-node-copy: binding-node-package
	cp packages/ts/generated/tests/generated.test.mjs $(BINDING_VAR)/node/generated.test.mjs
test-binding-node: test-binding-node-copy
	cd $(BINDING_VAR)/node && $(NODE) --test generated.test.mjs

# The generated tests of the WASM binding through the subpath ./wasm of the installed package (binding P-5); --expose-gc
# serves the generated tests that collect instances (binding GN-18a).
test-binding-wasm-copy: binding-node-package
	cp packages/ts/wasm/generated/tests/generated.test.mjs $(BINDING_VAR)/node/generated.wasm.test.mjs
test-binding-wasm: test-binding-wasm-copy
	cd $(BINDING_VAR)/node && $(NODE) --expose-gc --test generated.wasm.test.mjs

# The extension built with the test features against the PHP of PATH, its stub linted, and the generated tests on PHPUnit
# with the extension loaded; a run without a test or with a skipped test fails.
test-binding-php-build: bindings
	$(BINDING_LLVM) $(CARGO) build --locked -p polyspec-template-php-ext --features $(call binding_features,packages/php-ext/Cargo.toml)
test-binding-php-lint: test-binding-php-build
	$(BINDING_PHP) -l packages/php-ext/generated/polyspec_template.stub.php
test-binding-php: test-binding-php-lint
	$(BINDING_PHP) $(foreach extension,$(BINDING_PHP_EXTENSIONS),-d extension=$(extension)) -d extension=$(CURDIR)/target/debug/libpolyspec_template.$(BINDING_DYLIB) $(BINDING_PHPUNIT) --fail-on-empty-test-suite --fail-on-skipped packages/php-ext/generated/tests

# The static library with the test features, which Go links through CGO_LDFLAGS, then gofmt, go vet and the generated tests
# on go test with the build tags of those features, polyspec_<feature> with _ for - (binding GN-5). The module is a module of
# go.work, whose go.work.sum holds the sums of the Go module of json, and GOTOOLCHAIN=local is exported above.
BINDING_GO_FEATURES = $(call binding_features,packages/go/internal/ffi/Cargo.toml)
BINDING_GO_ENV = CGO_LDFLAGS=-L$(CURDIR)/target/debug GOFLAGS=-tags=$(subst -,_,$(shell echo '$(BINDING_GO_FEATURES)' | sed 's/\([^,]*\)/polyspec_template_\1/g'))
test-binding-go-build: bindings
	$(CARGO) build --locked -p polyspec-template-go --features $(BINDING_GO_FEATURES)
test-binding-go-format: test-binding-go-build
	test -z "$$(cd packages/go && $(BINDING_GOFMT) -l .)"
# The module packages/go is released on its own, so test-binding-go-vet-module vets it outside the workspace of go.work, with the
# requirements and sums of its own go.mod and go.sum only (GOWORK=off, -mod=readonly): in the workspace go.work.sum and the
# other modules answer for them, and a go.sum that misses a sum passes. Each target runs one command.
test-binding-go-vet-module: test-binding-go-format
	cd packages/go && GOWORK=off $(BINDING_GO_ENV) $(GO) vet -mod=readonly ./...
test-binding-go-vet: test-binding-go-vet-module
	cd packages/go && $(BINDING_GO_ENV) $(GO) vet ./...
test-binding-go: test-binding-go-vet
	cd packages/go && $(BINDING_GO_ENV) $(GO) test -count=1 ./...

# ---- Release recipes of the bindings: packages/release.mk, which binding release-recipes writes (binding GN-19h) -----------
# The recipes of the platform assets (release-go-static, release-wheel, release-php-ext, release-npm-platform, release-npm,
# release-go-module, release-binding-check, release-platform-assets and install-wasm-bindgen) are the file that
# binding release-recipes writes for the contract; Git ignores it, and make release-recipes writes it again before a release
# runs a recipe, because no recipe of these targets is written by hand (CK-94). The file reads BINDING_RUN, NODE, NPM and UV,
# which this Makefile defines before the include; a checkout that has not written the file yet reads none of its targets.
BINDING_RUN := $(NODE) $(BINDING)
.PHONY: release-recipes
release-recipes:
	$(BINDING_RUN) release-recipes --root $(CURDIR)
-include packages/release.mk

# The consumer check of the stub (T28.141): the PHP extension archive of release-candidate-assets (VERSION) carries the stub
# that binding generates; PHPStan of a consumer reads the classes of the extension from it with scanFiles. The probe must fail
# without the stub and pass with it. CONSUMER_PHP is the PHP 8.4 of the checkout (.php-version); composer installs phpstan.
CONSUMER_PHP ?= php
CONSUMER_DIR := var/consumer-phpstan
.PHONY: consumer-phpstan-check
consumer-phpstan-check: ## Check that PHPStan of a consumer resolves the classes of the PHP extension from the stub in its release archive (T28.141); needs VERSION and release-candidate-assets; offline
	@test -n "$(VERSION)" || { echo 'consumer-phpstan-check: VERSION is required, for example make consumer-phpstan-check VERSION=0.0.31' >&2; exit 2; }
	@zip=var/release/assets/polyspec-template-php-ext-$(VERSION).zip; test -f "$$zip" || { echo "consumer-phpstan-check: $$zip is missing; run make release-candidate-assets VERSION=$(VERSION) first" >&2; exit 2; }
	rm -rf $(CONSUMER_DIR)
	mkdir -p $(CONSUMER_DIR)/stub $(CONSUMER_DIR)/src
	unzip -q "var/release/assets/polyspec-template-php-ext-$(VERSION).zip" generated/polyspec_template.stub.php -d $(CONSUMER_DIR)/unpacked
	mv $(CONSUMER_DIR)/unpacked/generated/polyspec_template.stub.php $(CONSUMER_DIR)/stub/polyspec_template.stub.php
	cp tests/fixtures/consumer-phpstan/probe.php $(CONSUMER_DIR)/src/probe.php
	cp tests/fixtures/consumer-phpstan/phpstan-with-stub.neon tests/fixtures/consumer-phpstan/phpstan-without-stub.neon $(CONSUMER_DIR)/
	@cd $(CONSUMER_DIR) && if $(CONSUMER_PHP) $(CURDIR)/vendor/bin/phpstan analyse -c phpstan-without-stub.neon --no-progress >without-stub.log 2>&1; then echo 'consumer-phpstan-check: the probe passed without the stub; it must fail' >&2; exit 1; fi
	@cd $(CONSUMER_DIR) && $(CONSUMER_PHP) $(CURDIR)/vendor/bin/phpstan analyse -c phpstan-with-stub.neon --no-progress
	@echo "consumer-phpstan-check: the probe fails without the stub and passes with the stub of $(VERSION)"
