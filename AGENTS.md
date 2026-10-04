# Development

## Documents

- Every document has a `.ko.md` file with the same information. Edit both in the same change.
- One authoritative document per topic. Contracts are in `docs/spec/`. Implementation, verification and deployment status are in `docs/features.md`. Current procedures are in `docs/operations/`. Actual changes and their verification results are in `CHANGELOG.md`. Proposals awaiting approval are in `docs/plans/`; after approval, move the content into the specification and remove the proposal.
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

## Decision and acceptance rules

- Define the invariant, acceptance condition and failure condition before changing an implementation. Tests provide evidence for those conditions; they do not define a weaker substitute after implementation.
- Never weaken, skip or remove an accepted condition to make a failing implementation pass. Fix the implementation.
- When an accepted condition is internally inconsistent or demonstrably wrong, explain the defect and its effect first. Amend the specification, test and documentation together before continuing implementation.
- Existing code, history and convention are evidence to inspect, not authority. Keep them only when they satisfy the current contract and these rules.
- When inspection reveals an anomaly, reproduce it at the smallest stable boundary. Decide whether it exposes a missing general rule, add that rule when it does, then keep the regression test that turns the reproduction from red to green.
- An exception must have a narrow machine-checked boundary, a documented reason and a removal condition. Do not create an exception when the architecture can satisfy the invariant directly.
- Use the latest stable dependency release that supports the project's declared runtime range. Do not treat a prerelease as stable.
- Do not silently pin an older dependency. Record a reproducible compatibility reason and the condition that permits removing the pin, and make release checks reject stale or unexplained pins.
- A release must reject known dependency vulnerabilities at the configured severity and must pass the complete release matrix with the exact locked dependency graph.

## Changes and history

- Before reverting a change, check whether it is harmful. Revert a harmful change immediately. For a change that is not harmful, judge whether it is correct; remove an incorrect or unnecessary change; keep a correct change.
- Commit a correct change that is unrelated to the current task separately, with its actual reason.
- Write commit messages, comments, documents and translations in direct language: name the action (create, register, remove, return, fail), state the subject and the object, explain a cause in one sentence, and do not use figurative or colloquial wording. Provide the same information in English and Korean.
- Documents, comments, records and commit messages describe template only. A record states a defect or a change as a fact about template: the input, the behaviour and the expected behaviour, with no reporter, no source and no product or program that uses template; a sentence that holds no such fact is deleted.
- A commit message is written in English as `type(scope): Subject (#task)`, a blank line, then a body that states what changed and why, wrapped at 72 characters. The type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`. The subject has at most 50 characters, starts with a capital letter, is imperative and ends without a period.
- Work may be done on `main` directly. A branch or worktree, used for an agent or when the situation needs one, is named `{type}/{shortname}-{task id}` and `{project}-{shortname}-{task id}`, and is removed as soon as it is merged into `main`.
- Test code that cannot be merged into `main` is removed before the commit, or cherry-picked when it is worth keeping. When it cannot be removed at once, a checklist sub-item records it with its removal condition.

## Required checks

- While a task is in progress, run only the Red and Green tests that own the change. Before a commit, run those tests and `make docs-check`.
- Before marking a task `[o]` in `docs/plans/execution-checklist.md`, run the owning command of the task, the command in its Verification column, on the committed tree.
- Run `make check` once, when every active task is done. Do not run it for each fix or each task, and do not repeat it without a change.
- Every test prints its start, its result and its elapsed time while the run goes on, and has its own timeout. Do not put a time limit on a whole run, a package or a file. A test that runs for tens of minutes, or that prints only a start and an end, is a defect.

## Checklist

- This repository has one checklist, `docs/plans/execution-checklist.md`. Split a task into sub-items or add tasks to it; do not create another checklist. Every repository keeps its own checklist.
- A task has one of four states: `[ ]` waiting, `[~]` in progress, `[o]` done, `[!] cause: <cause>; retry: <condition>` bypassed. `scripts/check-documents.mjs` accepts no other state.
- The Verification column of a task names its owning command, which runs the Red and Green tests of the task, not `make check`. Tasks that are already `[o]` keep their command.
- `[!]` is used only when the next task cannot proceed without bypassing this one. When the retry condition holds, resume the task without waiting for approval. `[!]` is not done. An audit covers only the `[!]` tasks with their causes and retry conditions and does not repeat unrelated full test runs.
- A new problem gets a new task. A problem related to a task that is `[o]` gets a sub-item with the next derived ID (`T12.1-1`, `T12.1-2`) that goes through `[~]` and `[o]`; the `[o]` task keeps its state.
- Independent tasks may run in parallel, but finishing a task in progress comes before starting a new one: the number of `[o]` tasks grows, not the number of `[~]` tasks.
- Uncommitted changes never span more than one task. When a task becomes `[o]`, its changelog entry and its commit are made in the same unit of work.
- A received instruction is classified first: a task of the checklist, a rule of this file, a note of the agent memory, or an answer only. The agent memory holds only what the requester and the agent need between sessions; what the project must keep goes into the repository (documents, comments, commit messages). Unless the instruction states that it is urgent, record it as a task with its priority and continue the task in progress. Rules belong in this file without duplication, never in the checklist or the changelog.
- Korean documents write technical terms in English and only the surrounding text in Korean.
