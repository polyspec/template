<!-- doc-id: packages-template-python-agents -->
<!-- source-sha256: 9c0585556b5f2d47a0d44d593f0dc3cc4a2650f744169bf5f6f514579eb5082e -->
# 개발

저장소 루트의 필수 검사가 이 패키지에 적용됩니다. 개발 중에는 단위 test만 실행합니다. 변경 진행 중에는 이 디렉터리에서 `../../packages/python/.venv/bin/python -m unittest tests.test_api`로 RED 사례를 먼저 실행하고 같은 사례를 GREEN으로 확인합니다. 저장소의 conformance·parity runner는 이 패키지를 명령줄 인터페이스로 CI에서 실행합니다. commit이나 push 전 로컬 실행을 요구하는 규칙은 없습니다.

- 패키지 구성: `src/polyspec/template/`에 구현, `tests/`에 단위 test, `tests/fixtures/`에 명령줄 test가 읽는 파일이 있습니다.
- 저장소 루트의 `make python-package`가 이 패키지를 가상 환경 `packages/python/.venv`에 editable로 설치합니다. test와 명령은 import 경로를 바꾸지 않고 그 환경에서 패키지를 가져옵니다.
- 저장소 루트의 `make test-python`이 그 환경에서 패키지의 단위 test를 실행합니다. 각 test는 자신이 지키는 동작을 이름에 담습니다.
- `packages/python/.venv/bin/python -m polyspec.template.cli …`가 체크아웃에서 명령줄 인터페이스를 실행합니다.
- engine은 공유 명세에 충실하게 유지합니다. 저장소 루트의 `docs/spec/*.md`가 동작을 정의하고 `tests/cases/`의 conformance 사례가 공통 기준입니다.
