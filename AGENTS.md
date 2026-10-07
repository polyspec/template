# Development

## Documents

- English documents are canonical. Every document has a `.ko.md` file with the same information. Edit both in the same change.
- One authoritative document per topic. Contracts are in `docs/spec/`. Implementation, verification and deployment status are in `docs/features.md`. Current procedures are in `docs/operations/`. Actual changes and their verification results are in `CHANGELOG.md`. The execution plan is `docs/plans/execution-plan.md`, and its tasks are in the checklist `docs/plans/execution-checklist.md`. Proposals awaiting approval are in `docs/plans/`; after approval, move the content into the specification and remove the proposal.
- Documents describe current behavior. When the direction changes, change the specification first and mark parts that are not implemented.
- A behavior change, its documents, its feature status row and its changelog entry are one change.
- Record test results and deployment separately. Do not use results from earlier code as evidence for changed code.
- `make docs-check` is part of the default checks. It verifies links, translation pairs, identical code blocks and status fields. Content accuracy is verified by reading the code and the tests.

## Implementation

- Do not keep backward compatibility. Remove old paths instead of adding compatibility layers, fallbacks or migrations.
- Use the simplest implementation that fully meets the current requirements. Do not add abstractions, configuration or indirection for uncertain future needs.
- Separate concerns into modules. Split a file that has more than one responsibility.
- Decide architecture for the long term. Do not accept a temporary measure that must be replaced later.
- Do not use temporary scripts or folders. Every check is a Makefile target, a script under `scripts/`, or a committed test, and is idempotent.
- Keep code and tests in separate directories inside each package. Core tests are in the core package. Extension tests are in the extension package.
- Handle a defect by adding a failing test that reproduces it, fixing the code, and keeping the test.
- Use repository-relative paths. Require explicit paths for external inputs.
- Do not use symbolic links. npm installs every dependency, also a package of this repository, as a copy and writes no bin link (`.npmrc`); a recipe or script starts a tool with the file of its package.
- Each checkout builds its Rust crates into their own target. Do not point `CARGO_TARGET_DIR` at the target of another checkout: cargo judges freshness by modification times, so it takes binaries built from the sources of another checkout as fresh. The Makefile does not pass an inherited `CARGO_TARGET_DIR` to cargo, and a worktree removes its target when it is removed. A test reads the files of the checkout from the `CARGO_MANIFEST_DIR` that cargo sets when it runs the test, not from a path compiled into the binary.

## Idempotency

A check gives the same result for the same tree, at any time and on any machine. Each rule below covers one class of defect; a defect of a class is fixed everywhere the class occurs, and the rule gets a test.

- Toolchains: every recipe runs the tool version that a file of the checkout declares: Node.js in `.node-version`, npm in `packageManager` of `package.json`, Go in `packages/template-go/go.mod`, Rust in `rust-toolchain.toml`, the PHP minor version and Composer in `config/toolchain.json`; the C PHP extension builds with phpize and the php-config of the PHP on `PATH`, which must be the PHP that runs the tests (`scripts/build-php-extension.mjs` fails otherwise). `make install-tools` installs npm and Go into `var/tools`; nothing changes the tools of the machine. CI pins every action by its commit and the runner image by its version. `tests/scripts/toolchain-files.test.mjs` checks the versions for every change.
- Network: a check reads only the tree and the tools of the checkout, no registry, proxy or download; a review that asks a registry is a separate command whose result is committed. `make install` downloads what the checks read, such as the crates of every Cargo.lock that the checks resolve with `cargo --offline`, so no check depends on the commands that ran before it, and the Makefile runs cargo, go, npm and Composer offline (`CARGO_NET_OFFLINE`, `GOPROXY=off`, `npm_config_offline`, `COMPOSER_DISABLE_NETWORK`) in every recipe except the downloads of `install`, `install-tools` and `dependency-review`, which use `$(ONLINE)`; every target that runs cargo depends on `cargo-downloads-check`, which names `make install` for a missing crate, so no check shows cargo's advice to leave offline mode.
- Builds: a check builds what it reads with a build that does nothing for unchanged inputs; it never relies on a build of an earlier target or run. A build that others read is published only when its bytes change, through a temporary file and a rename.
- Shared state: a run writes only into directories of its own: temporary files outside the checkout under names of the run, caches inside the checkout (`var/`); a record that several runs read and write is held with a lock from reading to its last write; a run leaves no process of a group that it started.
- Nothing verified is a failure: a run in which no test ran fails; a test does not skip itself when a build or a package is missing, it builds it or fails.
- Every failure in one run: make keeps going (`MAKEFLAGS += -k`), a target of the full suite runs one command and names its other checks as prerequisites, and a check of several languages runs every language and names each that failed. `make check` and `make ci-targets` write the log of each target and a summary with the first failure lines of each failed target to `var/report`, and every CI job uploads that report, also after a failure.
- Owners: every path that a check reads is declared in `inputs` of `scripts/owner-checks.json` and has a rule that selects that check.
- Messages: a failure names what failed with the expected and the actual value, or with the command and the fix.
- Platform: a script, test or recipe reaches a stream through a file of its run or `-`, never through a device path such as `/dev/stdin`, `/dev/fd` or `/proc/self`, which Linux opens as a file and so cannot open for the socket that Node.js gives a child as its input; `tests/scripts/device-paths.test.mjs` checks every tracked source.
- Independence: a test does not depend on the wording or the layout of the output of a tool, on the user that runs it or on the time it takes beyond its own timeout; it computes what it can and asserts the result for the user and the platform that run it.

## Decision and acceptance rules

- Define the invariant, acceptance condition and failure condition before changing an implementation. Tests provide evidence for those conditions; they do not define a weaker substitute after implementation.
- Never weaken, skip or remove an accepted condition to make a failing implementation pass. Fix the implementation.
- When an accepted condition is internally inconsistent or demonstrably wrong, explain the defect and its effect first. Amend the specification, test and documentation together before continuing implementation.
- Existing code, history and convention are evidence to inspect, not authority. Keep them only when they satisfy the current contract and these rules.
- When inspection reveals an anomaly, reproduce it at the smallest stable boundary. Decide whether it exposes a missing general rule, add that rule when it does, then keep the regression test that turns the reproduction from red to green.
- An exception must have a narrow machine-checked boundary, a documented reason and a removal condition. Do not create an exception when the architecture can satisfy the invariant directly.
- Use the latest stable dependency release that supports the project's declared runtime range: the latest known when a dependency is chosen or updated. Do not treat a prerelease as stable. Choose and update dependencies with `make dependency-review UPDATE=1` and commit a changed manifest or lock with the review record that `make dependency-review RECORD=1` writes; the verification suite reads that record and queries no registry, so one tree gives one result at any time.
- Do not silently pin an older dependency. Record a reproducible compatibility reason and the condition that permits removing the pin, and make release checks reject stale or unexplained pins.
- A release must reject known dependency vulnerabilities at the configured severity and must pass the complete release matrix with the exact locked dependency graph. The review records the advisories of every lock, the gate rejects a lock with an advisory at its review, and the scheduled dependency review finds an advisory published later.

## Changes and history

- Before reverting a change, check whether it is harmful. Revert a harmful change immediately. For a change that is not harmful, judge whether it is correct; remove an incorrect or unnecessary change; keep a correct change.
- Commit a correct change that is unrelated to the current task separately, with its actual reason.
- Write commit messages, comments, documents and translations in direct language: name the action (create, register, remove, return, fail), state the subject and the object, explain a cause in one sentence, and do not use figurative or colloquial wording. Provide the same information in English and Korean.
- Documents, comments, records and commit messages describe template only. A record states a defect or a change as a fact about template: the input, the behaviour and the expected behaviour, with no reporter, no source and no product or program that uses template; a sentence that holds no such fact is deleted.
- A commit message is written in English as `type(scope): Subject (#task)`, a blank line, then a body that states what changed and why, wrapped at 72 characters. The type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`. The subject has at most 50 characters, starts with a capital letter, is imperative and ends without a period.
- Work may be done on `main` directly. A branch or worktree, used for an agent or when the situation needs one, is named `{type}/{shortname}-{task id}` and `{project}-{shortname}-{task id}`, and is removed as soon as it is merged into `main`.
- Test code that cannot be merged into `main` is removed before the commit, or cherry-picked when it is worth keeping. When it cannot be removed at once, a checklist sub-item records it with its removal condition.

## Required checks

- Development runs unit tests only: while a task is in progress, run the Red and Green unit tests that own the change. Never run a full or end-to-end check locally, neither during development nor before a commit or a push: not `make check`, `make rerun-failed`, `make owner-check`, the conformance runners, the browser tests or the VS Code integration test. CI runs them on every pull request and every merge group of the merge queue (`.github/workflows/ci.yml`), and the report of each job (`var/report`) names every failure with its log. A new path gets its owner in `scripts/owner-checks.json` in the same change; the owner checks run in CI.
- A task becomes `[o]` in `docs/plans/execution-checklist.md` when its unit tests pass on the committed tree and CI passed the merge group that brought it to `main`; an owning command of the Verification column that is a full or end-to-end check runs in CI, not locally.
- `make check` runs the full suite in the release job of CI, once per tree, on every pull request, every merge group and every manual run (`workflow_dispatch`). The guard `scripts/full-run.mjs` enforces this before any step: `make check` is refused while a task is `[~]`, while tracked changes are uncommitted, and when `var/full-run.json` records a full run of the current tree; `make rerun-failed` reruns only the targets of the current tree that did not pass (`docs/operations/development.md`).
- A push happens only when no task is `[~]`, neither in a pushed commit nor in the working tree. The pre-push hook `.githooks/pre-push` runs the push gate `scripts/push-gate.mjs`, which refuses such a push and names each task. Every make invocation sets `core.hooksPath` to `.githooks`; `make hooks` installs and checks the hook, `make hooks-check` fails while it is not installed and runs before `make owner-check`, and the guard refuses `make check` without it. The job `push-gate` of `.github/workflows/push-gate.yml` runs the same gate, the document, checklist, feature and rule checks and the compiler digests of the committed artifacts through `make ci-targets TARGETS="push-gate-commit documents-check feature-check rules-check artifact-digest-check"` on every push to a branch outside the merge queue, every pull request and every merge group and fails with the same tasks or with the line that breaks a document rule (`docs/operations/development.md`).
- Every change reaches `main` through a pull request and the merge queue, the owner's and every agent's alike; no command of this repository pushes `main` (T17.1-7). Publish a branch with the standard commands of GitHub, or with the GitHub UI:

~~~sh
git push origin HEAD:refs/heads/<branch>
gh pr create --base main --head <branch> --fill
gh pr merge <branch> --auto --rebase
~~~

  The GitHub ruleset `main`, declared in `.github/ruleset.json`, requires a pull request (no approval), the merge queue with the merge method `REBASE`, a linear history and exactly the checks of GitHub Actions `push-gate` and `ci-passed`, the last job of `.github/workflows/ci.yml`, which passes only when every other job of that workflow passed (T22.1-3), refuses a force-push and a deletion of `main` and has no bypass actor, so GitHub refuses a direct push to `main`, from an administrator too. The merge queue rebases each queued pull request onto `main` as a merge group, runs the required checks on that commit and moves `main` to it when they pass; a failed check removes the pull request from the queue. The rebase gives the merged commits new hashes, so `git pull --rebase` drops the local commits that the queue merged. `make github-ruleset` applies the ruleset and the declared repository settings (`allow_rebase_merge`, `allow_auto_merge`, `delete_branch_on_merge`), and `make github-ruleset-check` fails when they differ from the declaration (`docs/operations/development.md`).
- Every test prints its start, its result and its elapsed time while the run goes on, and has its own timeout. Do not put a time limit on a whole run, a package or a file. A test that runs for tens of minutes, or that prints only a start and an end, is a defect.
- A long-running operation, such as a build, a type check with `tsc`, an installation, a download, the installation or launch of a program, or a whole run, prints a log line for each step and has no timeout, including no deadline for missing output. Its success or failure is judged from its exit status, its result and its errors, because a time limit fails a normal run that is slower than expected. A test case is a short verification unit and keeps its own timeout.

## Checklist

- This repository has one checklist, `docs/plans/execution-checklist.md`. Split a task into sub-items or add tasks to it; do not create another checklist. Every repository keeps its own checklist.
- A task has one of four states: `[ ]` waiting, `[~]` in progress, `[o]` done, `[!] cause: <cause>; retry: <condition>` bypassed. `scripts/check-documents.mjs` accepts no other state.
- A task is a row of a task table. Its first cell is its ID, `T<wave>.<number>` or `T<wave>.<track>.<number>`, with derived sub-items such as `T12.1-1`; its other cells name its deliverables and tests and its owning command; its last cell is its state. A state marker, and a task list marker `[x]` or `[X]`, stands in a checklist file only at the start of the last cell of a task row. A legend, prose, the text of a task, another table cell or inline code names a state in words, so that a tool that reads the checklist can trust every marker.
- The checklist holds only tasks: its title, wave and section headings, and task tables made of a header row that starts with `| ID |`, its separator row and the task rows. The plan of the waves, their dependencies, the causes of their tasks, the exit criteria and the definition of done with its evidence are in `docs/plans/execution-plan.md`. `scripts/check-documents.mjs` fails on any other line and any other marker of the checklist with its file, line and column.
- The Verification column of a task names its owning command, which runs the Red and Green tests of the task, not `make check`; locally only its unit tests run, and CI runs the rest. Tasks that are already `[o]` keep their command.
- `[!]` is used only when the next task cannot proceed without bypassing this one. When the retry condition holds, resume the task without waiting for approval. `[!]` is not done. An audit covers only the `[!]` tasks with their causes and retry conditions and does not repeat unrelated full test runs.
- A new problem gets a new task. A problem related to a task that is `[o]` gets a sub-item with the next derived ID (`T12.1-1`, `T12.1-2`) that goes through `[~]` and `[o]`; the `[o]` task keeps its state.
- Independent tasks may run in parallel, but finishing a task in progress comes before starting a new one: the number of `[o]` tasks grows, not the number of `[~]` tasks.
- Uncommitted changes never span more than one task. When a task becomes `[o]`, its changelog entry and its commit are made in the same unit of work.
- A received instruction is classified first: a task of the checklist, a rule of this file, a note of the agent memory, or an answer only. The agent memory holds only what the requester and the agent need between sessions; what the project must keep goes into the repository (documents, comments, commit messages). Unless the instruction states that it is urgent, record it as a task with its priority and continue the task in progress. Rules belong in this file without duplication, never in the checklist or the changelog.
- Korean documents write technical terms in English and only the surrounding text in Korean.
