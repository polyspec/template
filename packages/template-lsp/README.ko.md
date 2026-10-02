# @polyspec/template-lsp

[English](README.md).

표준 입력과 출력을 쓰는 템플릿 소스용 Language Server Protocol 서버다. `@polyspec/template-language`의 `openDocument()` 결과를 프로토콜 위치로 변환하며 템플릿 규칙을 갖지 않는다.

```sh
template-lsp --stdio
```

서버는 진단 게시, 시맨틱 토큰, 접기 범위, 문서 강조, 문서와 범위 포맷, `\n`, `>`, `}` 뒤의 타이핑 들여쓰기, 요청 `polyspec-template/tagRanges`와 `polyspec-template/matchingTag`를 제공한다. 설정 `polyspec-template.format.templateBlocks`(`indent` 또는 `flat`)는 `workspace/configuration`으로 읽는다.

패키지 진입점은 클라이언트를 위해 사용자 정의 요청의 메서드 이름과 매개변수·결과 타입을 내보낸다.

```ts
import { MATCHING_TAG_METHOD, TAG_RANGES_METHOD, type MatchingTagParams } from '@polyspec/template-lsp';
```

기능과 요청 형태는 [에디터 지원](../../docs/spec/editor.ko.md)(EDT-14)에 정의되어 있고, 명령과 그 검증은 [포매터, 언어 서버, 에디터](../../docs/operations/editor-tools.ko.md)에 설명되어 있다.
