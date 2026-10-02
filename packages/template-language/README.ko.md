# @polyspec/template-language

[English](README.md).

템플릿 소스 포매터다. 템플릿 태그 안의 공백을 정규화하고 HTML 요소와 템플릿 블록의 중첩에 따라 줄을 들여쓴다. 태그 밖의 다른 텍스트는 바꾸지 않는다. 소스와 결과를 `@polyspec/template`으로 파싱하고, 두 AST가 `span` 필드와 줄 들여쓰기를 제외하고 같을 때만 결과를 돌려준다. `indent: null`은 들여쓰기를 유지한다.

## 라이브러리

```ts
import { format } from '@polyspec/template-language';

const result = format('<p>{=title|upper}</p>', { name: 'page.tpl' });
if (result.ok) console.log(result.text);
else console.error(`${result.error.line}:${result.error.col}: ${result.error.code}`);
```

`openDocument(text, options)`는 텍스트를 한 번 분석하고, 모든 에디터 어댑터가 쓰는 진단, 강조 토큰, 태그 범위, 구성, 접기 범위, 강조, 짝 태그, 타이핑 들여쓰기를 돌려준다([에디터 지원](../../docs/spec/editor.ko.md)).

`format()`의 옵션: `name`(오류에 쓰는 템플릿 이름), `delimiters`(두 문자, 기본값 `{}`), `range`(`{ start, end }` 문자열 인덱스. 범위 안에 완전히 들어가는 태그만 포맷한다).

## 명령줄

```sh
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

종료 상태 0은 성공, 1은 `--check`가 포맷되지 않은 파일을 찾았음, 2는 파싱되지 않는 파일, 다른 AST 또는 잘못된 인자가 있음을 뜻한다.

포맷 스타일, 안전 불변식, 명령줄은 [포매터, 언어 서버, 에디터](../../docs/operations/editor-tools.ko.md)에 설명되어 있다.
