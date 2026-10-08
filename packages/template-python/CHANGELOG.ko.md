# 변경 기록

[English](CHANGELOG.md)

## Unreleased

- `RuntimeServices`는 package의 class이고 `RuntimeEnvironment`가 이를 구현합니다. `packages/template-compiler/interface.json`이 이렇게 선언합니다.
- 인터프리터가 정의하지 않은 class의 인스턴스는 native object로 바인딩됩니다(VAL-23). 따라서 host 함수가 `pick(order)`처럼 할당된 객체를 반환할 수 있습니다. 이전에는 `E_DATA_UNSUPPORTED_TYPE`로 실패했습니다.
- 인자 상한이 없는 built-in을 인자가 모자라게 호출하면 `E_RUNTIME_ARITY`가 발생합니다. 이전에는 메시지를 만들다 `OverflowError`가 발생했습니다.
