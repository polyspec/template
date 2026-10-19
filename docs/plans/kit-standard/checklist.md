<!-- doc-id: checklist-kit-standard -->
# Kit standard checklist

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| T26.1 | The repository follows the kit standard 0.0.54 | The vendored kit files, the layout, the plans and the checks of the kit standard 0.0.54 | `make kit-check` | [o] |
| T26.2 | The recipes that overrode kit tasks run once, and the checklist names the parent of each sub-item and the unit tests of each open item | The Makefile recipes `template-build-ts`, `template-build-go`, `template-build-rust`, `template-build-php`, `template-test-php`, `template-test-python` and `template-rules-check`, each a prerequisite of its kit target; the parent row T22.5 and the unit-test commands of T22.6, T22.6-12-1 and T22.6-17 in docs/plans/execution/checklist.md and its Korean twin | `make kit-check` | [o] |
