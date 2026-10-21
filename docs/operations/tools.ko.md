<!-- doc-id: docs-operations-tools -->
<!-- source-sha256: 83ed1bd1461cb247d4ebba74ebc1ac71522cfee497469cc853190316adbb6d15 -->
# 저장소 도구

[English](/operations/tools).

이 showcase 계약 규칙은 template 언어가 아니라 저장소의 showcase adapter와 도구에 묶여 있어서 명세에서 옮겼다.
template 언어의 모든 구현이 필요로 하는 것은 아니다.

- 공통 render request는 각 언어의 native API에 변경 없이 매핑된다. native map, object, JSON value는 adapter 표현일 뿐이므로
  request의 필드 이름, 중첩, 값 타입은 그대로 유지된다.
- adapter는 공통 JSON을 해석해 native API 값을 만들 수 있지만, 컨트롤러 데이터를 추가하거나, 필드 이름을 바꾸거나,
  필터를 적용하거나, 그 밖의 방식으로 요청을 재구성해서는 안 된다.
