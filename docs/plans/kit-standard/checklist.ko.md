<!-- doc-id: checklist-kit-standard -->
<!-- source-sha256: 4191d137d6e32196f770e6dcea200a170a29ee302c6f4c6a45f09aef09842a57 -->
# kit 표준 체크리스트

| ID | Task | Deliverables | Verification | State |
|---|---|---|---|---|
| T26.1 | 저장소가 kit 표준 0.0.54를 따른다 | The vendored kit files, the layout, the plans and the checks of the kit standard 0.0.54 | `make kit-check` | [o] |
| T26.2 | kit task를 덮어쓰던 recipe가 각각 한 번씩 실행되고, 체크리스트는 각 하위 항목의 상위 행과 각 미완료 항목의 단위 테스트를 적는다 | The Makefile recipes `template-build-ts`, `template-build-go`, `template-build-rust`, `template-build-php`, `template-test-php`, `template-test-python` and `template-rules-check`, each a prerequisite of its kit target; the parent row T22.5 and the unit-test commands of T22.6, T22.6-12-1 and T22.6-17 in docs/plans/execution/checklist.md and its Korean twin | `make kit-check` | [o] |
