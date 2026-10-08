# 개발

저장소 루트의 필수 검사가 이 패키지에 적용됩니다. 개발 중에는 단위 test만 실행합니다. 변경 진행 중에는 `python3 tests/test_api.py`로 RED 사례를 먼저 실행하고 같은 사례를 GREEN으로 확인합니다. 저장소의 conformance·parity runner는 이 패키지를 명령줄 인터페이스로 CI에서 실행합니다. commit이나 push 전 로컬 실행을 요구하는 규칙은 없습니다.

- 패키지 구성: `src/polyspec/template/`에 구현, `tests/`에 단위 test, `tests/fixtures/`에 명령줄 test가 읽는 파일이 있습니다.
- `python3 tests/test_api.py`가 패키지의 단위 test를 실행합니다. 각 test는 자신이 지키는 동작을 이름에 담습니다.
- `PYTHONPATH=src python3 -m polyspec.template.cli …`가 체크아웃에서 명령줄 인터페이스를 실행합니다.
- engine은 공유 명세에 충실하게 유지합니다. 저장소 루트의 `docs/spec/*.md`가 동작을 정의하고 `tests/cases/`의 conformance 사례가 공통 기준입니다.
