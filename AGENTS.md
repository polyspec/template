<!-- doc-id: agents -->
# Development

## Documents

- Own: One authoritative document per topic. Contracts are in `docs/spec/`. Implementation, verification and deployment status are in `docs/features.md`. Current procedures are in `docs/operations/`. Actual changes and their verification results are in `CHANGELOG.md`. The execution plan is `docs/plans/execution/plan.md`, and its tasks are in the checklist `docs/plans/execution/checklist.md`. Proposals awaiting approval are in `docs/plans/`; after approval, move the content into the specification and remove the proposal.
  Enforced by: none, which document is authoritative is a judgement.
- Own: Record test results and deployment separately. Do not use results from earlier code as evidence for changed code.
  Enforced by: none, the separation of results is a judgement.
- Own: `make docs-check` is part of the default checks. It reads each document on its own and verifies its links, anchors, fences, the checklist and the status fields (`config/documents.json`). The English file and its Korean twin hold the same `doc-id` marker, and the Korean file holds the `source-sha256` marker, the sha256 of the English file, which `make documents-stamp` writes after the translation is reviewed; no check compares the twins (kit K809). Content accuracy is verified by reading the code and the tests.
  Enforced by: `make docs-check`

## Implementation

- Own: Request a required change to `@polyspec/kit` through a GitHub issue in `polyspec/kit`; do not edit the provider repository or installed package source, or bypass its verification with consumer-specific substitutes. Adopt a published release and update its owned copies with `make kit-sync`.
  Enforced by: none, provider ownership is a review judgement.

- Own: The shared tools come from the npm package `@polyspec/kit` of the tool repository `polyspec/kit`, a devDependency pinned to its release asset with its integrity. `make install-tools TOOLS=npm` and `make install-packages` install it; the Makefile includes `node_modules/@polyspec/kit/scripts/kit/kit-bootstrap.mk` from the installed package, which includes its `kit.mk` and selects source tools for native development links or compiled tools for release installs, and the recipes run its tools as `node $(KIT)/<tool>.$(KIT_EXT)`. The files that `kit.copies` of its `package.json` lists are held as copies, written by `make kit-sync` from the installed package and never edited here; `PRINCIPLES.md`, its twin, `.editorconfig` and `.claude/settings.json` are regular copies written by `make kit-sync`; `make kit-sync` refreshes the copies from the installed package, and `make kit-check` compares the files of `config/` with its schemas. A script of this repository imports only the tool APIs that the package exports (`@polyspec/kit/<tool>`), never a file of the package by its path. This repository differs from the other repositories that use kit only in `config/*.json` and its own product code: `owner-checks`, `release`, `toolchain`, `checklist`, `documents` and `layout.yml`.
  Enforced by: `make kit-check`
- Own: While polyspec versions are 0.0.x, development checkouts link installed polyspec packages to their source as kit `docs/plans/local-links.md` describes; links sit in `node_modules/`, a generated path that is never committed; `make link-check` lists them as a development aid.
  Enforced by: `make staged-generated-hook`
- Own: Do not use temporary scripts or folders. Every check is a Makefile target, a script under `scripts/`, or a committed test, and is idempotent.
  Enforced by: `make rules-check`
- Own: Use repository-relative paths. Require explicit paths for external inputs.
  Enforced by: none, the paths are a judgement of the code review.
- Own: Do not create symbolic links. The links that npm writes (the workspace packages in `node_modules` and the commands in `node_modules/.bin`) and those that uv writes are the behavior of those tools and are accepted; a recipe or script starts a tool from `node_modules/.bin`.
  Enforced by: none, no check reads the links.
- Own: Each checkout builds its Rust crates into their own target. Do not point `CARGO_TARGET_DIR` at the target of another checkout: cargo judges freshness by modification times, so it takes binaries built from the sources of another checkout as fresh. The Makefile does not pass an inherited `CARGO_TARGET_DIR` to cargo, and a worktree removes its target when it is removed. A test reads the files of the checkout from the `CARGO_MANIFEST_DIR` that cargo sets when it runs the test, not from a path compiled into the binary.
  Enforced by: none, no check reads the target.

## Idempotency

A check gives the same result for the same tree, at any time and on any machine. Each rule below covers one class of defect; a defect of a class is fixed everywhere the class occurs, and the rule gets a test.

- Refines S4: Toolchains: every recipe runs the tool version that a file of the checkout declares: Node.js in `mise.toml`, installed by mise into `var/tools` and run as `$(NODE)` (kit K171), npm in `mise.toml` as `npm:npm`, which `devEngines` of `package.json` names (kit K938), Go, Python, Composer and the lint and audit tools in `mise.toml` with their digests in `mise.lock`, Go and Python at the kit pins, which the `go` line of `packages/go/go.mod` equals, Rust in `rust-toolchain.toml`, the PHP minor version and mise in `config/toolchain.json`; the C PHP extension builds with phpize and the php-config of the PHP on `PATH`, which must be the PHP that runs the tests (kit's `make build-php-ext` fails otherwise). `make install-tools` (`$(KIT)/install-tools.$(KIT_EXT)`) installs the tools of `mise.toml` with mise into `var/tools`, after `make install-tools TOOLS=npm` installed npm and mise; nothing changes the tools of the machine. CI pins every action by its commit and the runner image by its version. `tests/scripts/toolchain-files.test.mts` checks the versions for every change.
  Enforced by: `make template-test-scripts`
- Refines P17: Network: a registry query whose result depends on time, such as a latest release, the resolution of a version range or a query for outdated packages or new releases, never runs in a check. Downloading a package that a lock pins by exact version and integrity is installation and may run in a check, as `make install` does with `npm ci` and `composer install`. `make install` downloads what the other checks read, such as the crates of every Cargo.lock that the checks resolve with `cargo --offline`, so no check depends on the commands that ran before it, and the Makefile runs cargo, go, npm and Composer offline (`CARGO_NET_OFFLINE`, `GOPROXY=off`, `npm_config_offline`, `COMPOSER_DISABLE_NETWORK`) in every recipe except the downloads of `install` and `install-tools`, which use `$(ONLINE)`; install-kit of kit fetches the crates of every Cargo.lock, and an offline cargo names a crate that is missing.
  Enforced by: `make template-test-scripts`
- Refines P17: Shared state: a run writes only into directories of its own: temporary files outside the checkout under names of the run, caches inside the checkout (`var/`); a record that several runs read and write is held with a lock from reading to its last write; a run leaves no process of a group that it started.
  Enforced by: none, the sharing of runs is a judgement.
- Own: Every failure in one run: make keeps going (`MAKEFLAGS += -k`), a target of the full suite runs one command and names its other checks as prerequisites, and a check of several languages runs every language and names each that failed. `make ci-targets` writes the log of each target and a summary with the first failure lines of each failed target to `var/report`, and every CI job uploads that report, also after a failure.
  Enforced by: `make ci-targets`
- Own: Owners: every path that a check reads is declared in `inputs` of `config/owner-checks.json` and has a rule that selects that check.
  Enforced by: `make owner-validate`
- Own: Platform: a script, test or recipe reaches a stream through a file of its run or `-`, never through a device path such as `/dev/stdin`, `/dev/fd` or `/proc/self`, which Linux opens as a file and so cannot open for the socket that Node.js gives a child as its input; `tests/scripts/device-paths.test.mts` checks every tracked source.
  Enforced by: `make template-test-scripts`
- Own: Independence: a test does not depend on the wording or the layout of the output of a tool, on the user that runs it or on the time it takes beyond its own timeout; it computes what it can and asserts the result for the user and the platform that run it.
  Enforced by: none, the independence of a test is a judgement.

## Changes and history

- Own: Documents, comments, records and commit messages describe template only. A record states a defect or a change as a fact about template: the input, the behaviour and the expected behaviour, with no reporter, no source and no product or program that uses template; a sentence that holds no such fact is deleted.
  Enforced by: none, the wording of records is a judgement.

## Required checks

- Refines P20: Development runs unit tests only: while a task is in progress, run the Red and Green unit tests that own the change. Never run a full or end-to-end check locally, neither during development nor before a commit or a push: not `make owner-check`, the conformance runners, the browser tests or the VS Code integration test. CI runs them on every push to `main` and every manual run (`.github/workflows/ci.yml`), and the report of each job (`var/report`) names every failure with its log. A new path gets its owner in `config/owner-checks.json` in the same change; the owner checks run in CI.
  Enforced by: none, a local run is not observed by a tool.
- Own: The jobs of `.github/workflows/ci.yml` run the full suite, the targets of `CHECK_TARGETS`, on every push to `main` and every manual run (`workflow_dispatch`): each job runs its targets with `make ci-targets TARGETS="..."`, and every target of `CHECK_TARGETS` runs in exactly one job (`tests/scripts/suite-parity.test.mts`).
  Enforced by: `make template-test-scripts`
- Own: Every make invocation sets `core.hooksPath` to `.githooks`, the hooks of `config/checklist.json`; `make hooks` installs and checks them, and `make hooks-check` fails while they are not installed. A push is not checked: the message rules run at commit, and CI is read at release (`docs/operations/development.md`).
  Enforced by: `make hooks-check`
- Own: Every test prints its start, its result and its elapsed time while the run goes on, and has its own timeout. Do not put a time limit on a whole run, a package or a file. A test that runs for tens of minutes, or that prints only a start and an end, is a defect.
  Enforced by: none, the output of a test is a judgement.
- Own: A long-running operation, such as a build, a type check with `tsc`, an installation, a download, the installation or launch of a program, or a whole run, prints a log line for each step and has no timeout, including no deadline for missing output. Its success or failure is judged from its exit status, its result and its errors, because a time limit fails a normal run that is slower than expected. A test case is a short verification unit and keeps its own timeout.
  Enforced by: none, the output of an operation is a judgement.

## Release

- Own: A release is the commit of a successful push or manual run of `.github/workflows/ci.yml` on `main`: the job `ci-passed` passes only when every other job of that run passed, the job `kit` with the gates of kit included. Only the maintainer starts a release, and no tag is created, moved or pushed by hand (T22.1-4).
  Enforced by: `make release-tag`, which tags only the commit of such a run; who dispatches the release is a permission of GitHub.
- Own: The version-bump commit `chore(release): Release X.Y.Z (#task)` sets the version X.Y.Z in every manifest that `config/release.json` lists in `manifests` (the root `package.json`, the npm packages, the VS Code extension, the Rust crate and the Python package (`packages/python/pyproject.toml`), with `package-lock.json` and `packages/rust/Cargo.lock`; a `composer.json` has no `version` field and takes the version from the tag) and renames `## Unreleased` of `CHANGELOG.md` and `CHANGELOG.ko.md` to `## X.Y.Z`, with a new empty `## Unreleased` above it.
  Enforced by: none, the version-bump commit is a judgement; the package managers resolve the versions.
- Own: After the CI run of the push that brought the version-bump commit to `main` succeeded, the maintainer runs `gh workflow run release.yml -f run=<id>` with the id of that run. Its `make release-tag` reads X.Y.Z from the first section `## X.Y.Z` of `CHANGELOG.md` at the commit of that run (kit K924), requires a completed successful push or manual run of `.github/workflows/ci.yml` on `main` whose commit is on `origin/main`, and creates and pushes the annotated tags `vX.Y.Z` and `packages/go/vX.Y.Z` at that commit; the workflow then builds the package archives from the tag under the names their packers give (`polyspec-template-X.Y.Z.tgz` for `@polyspec/template`), each with the GitHub label `<vendor>-<product>-<runtime>-<version>` (`polyspec-template-ts-X.Y.Z`, kit P39), and creates the GitHub Release with the section `## X.Y.Z` of `CHANGELOG.md` as its notes (`docs/operations/publication.md`).
  Enforced by: `make release-tag`

## Generated files

- Own: Generated files are never tracked in Git. This covers dependency installs (`node_modules/`, `vendor/`, virtual environments), build output (`dist/`, `target/`, `*.tsbuildinfo`), caches (`.cache/`, `__pycache__/`, `.pytest_cache/`), test run artifacts (`test-results/`, `playwright-report/`, PHPUnit caches) and tool downloads (`var/`). The only exceptions are files the repository deliberately needs, and only these are tracked: lock files (`package-lock.json`, `composer.lock`, `Cargo.lock`, uv locks, `mise.lock`), committed generated documents that this file names, and test fixtures. Each `.gitignore` covers these paths; a new generator adds its ignore entry in the same commit.
  Enforced by: `make staged-generated-hook`

## Checklist

- Refines P24: This repository has one checklist, `docs/plans/execution/checklist.md`. Split a task into sub-items or add tasks to it; do not create another checklist. Every repository keeps its own checklist.
  Enforced by: `make docs-check`
- Refines P24: The waves, their dependencies, the causes of their tasks, the exit criteria and the definition of done with its evidence are in `docs/plans/execution/plan.md`; the checklist holds the tasks only.
  Enforced by: `make docs-check`
- Own: Independent tasks may run in parallel, but finishing a task in progress comes before starting a new one: the number of `[o]` tasks grows, not the number of `[~]` tasks.
  Enforced by: none, the order of tasks is a judgement.
- Own: A received instruction is classified first: a task of the checklist, a rule of this file, a note of the agent memory, or an answer only. The agent memory holds only what the requester and the agent need between sessions; what the project must keep goes into the repository (documents, comments, commit messages). Unless the instruction states that it is urgent, record it as a task with its priority and continue the task in progress. Rules belong in this file without duplication, never in the checklist or the changelog.
  Enforced by: none, the classification is a judgement.
