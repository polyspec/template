# 템플릿 함수 inventory

inventory 도구는 명시적으로 전달한 source tree의 추적된 `.tpl` 파일만 읽는다. 호출 형태를 category별로 기록하며 일반 JavaScript, CSS, comment와 raw PHP block은 제외한다.

다음 명령으로 실행한다.

```sh
make template-function-inventory TEMPLATE_APP_ROOT=/path/to/template-source
```

report는 simple call, qualified name, static method와 instance method를 구분한다. report에 있는 이름은 source에서 관찰된 형태일 뿐 허용된 template function이 아니다. 허용하려면 [functions](../spec/functions)에 설명한 function contract에 signature, return type, effect, error 동작과 support 상태를 등록해야 한다.

scanner는 read-only로 동작한다. 전달한 source tree를 compile하거나 실행하거나 수정하지 않는다.
