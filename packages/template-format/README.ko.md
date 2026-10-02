# @polyspec/template-format

[English](README.md).

템플릿 소스 포매터다. 템플릿 태그 안의 공백을 정규화하고 HTML 요소와 템플릿 블록의 중첩에 따라 줄을 들여쓴다. 태그 밖의 다른 텍스트는 바꾸지 않는다. 소스와 결과를 `@polyspec/template`으로 파싱하고, 두 AST가 `span` 필드와 줄 들여쓰기를 제외하고 같을 때만 결과를 돌려준다. `indent: null`은 들여쓰기를 유지한다.

## 라이브러리

```ts
import { format } from '@polyspec/template-format';

const result = format('<p>{=title|upper}</p>', { name: 'page.tpl' });
if (result.ok) console.log(result.text);
else console.error(`${result.error.line}:${result.error.col}: ${result.error.code}`);
```

`templateStructure(source, options)`는 문자열 위치를 가진 파싱 오류, 또는 편집기가 진단, 짝 태그, 접기에 쓰는 블록 구성(여는 태그, 분기 태그, 닫는 태그)을 돌려준다.

`format()`의 옵션: `name`(오류에 쓰는 템플릿 이름), `delimiters`(두 문자, 기본값 `{}`), `range`(`{ start, end }` 문자열 인덱스. 범위 안에 완전히 들어가는 태그만 포맷한다).

## 명령줄

```sh
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

종료 상태 0은 성공, 1은 `--check`가 포맷되지 않은 파일을 찾았음, 2는 파싱되지 않는 파일, 다른 AST 또는 잘못된 인자가 있음을 뜻한다.

포맷 스타일, 안전 불변식, 명령줄은 [포매터와 VS Code 확장](../../docs/operations/editor-tools.ko.md)에 설명되어 있다.
