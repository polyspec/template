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

## Changes and history

- Before reverting a change, check whether it is harmful. Revert a harmful change immediately. For a change that is not harmful, judge whether it is correct; remove an incorrect or unnecessary change; keep a correct change.
- Commit a correct change that is unrelated to the current task separately, with its actual reason.
- Write commit messages, comments, documents and translations in direct language: name the action (create, register, remove, return, fail), state the subject and the object, explain a cause in one sentence, and do not use figurative or colloquial wording. Provide the same information in English and Korean.
- Documents, comments and commit messages describe this project only. Do not mention other projects or sources unless a requester asked for it.

## Required checks

- Run the tests of every changed package and `make docs-check` before a commit.
- Run `make check` before marking a task done in `docs/plans/execution-checklist.md`.
