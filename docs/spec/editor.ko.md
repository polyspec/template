<!-- doc-id: docs-spec-editor -->
<!-- source-sha256: 599e2c890c65a3daf923619fda98b5e7e5e6725a66aff1593c25de13fd39b310 -->
# 에디터 지원

[English](/spec/editor).

이 문서는 에디터가 템플릿을 지원하는 방식을 정한다. 하나의 언어 서비스가 모든 에디터 규칙을 갖고, 각 에디터는 얇은 어댑터로 그 서비스에 연결한다. 포맷 스타일과 들여쓰기 규칙은 [포맷](/ko/spec/formatting)에 있으며, 이 문서는 그것을 참조한다.

## 계층

편집기 규칙은 [편집기 도구 문서](/ko/operations/editor-tools)에 정의되며, 아래의 tokens와 tags 규칙만 여기에 남는다.

- **EDT-8** `tokens`는 텍스트의 템플릿 부분을 분류하며, 위치 순서로 정렬되고 겹치지 않는다. 태그 밖의 텍스트에는 토큰이 없다. 어댑터는 그 텍스트를 HTML로 강조한다.

| 종류 | 텍스트 |
| --- | --- |
| `delimiter` | 태그의 여는 구분자와 닫는 구분자. 래퍼 태그의 래퍼를 포함한다 |
| `keyword` | 시길(`=`, `?`, `:?`, `:`, `@`, `/`, `+`, `#`, `?#`, `%`), `true`, `false`, `null`, `in`, 지시문의 단어 `delimiter` |
| `variable` | 뒤에 `(`가 오지 않고 앞에 `.`이 없는 이름 |
| `property` | `.` 뒤의 이름이나 인덱스. 뒤에 `(`가 오면 제외한다 |
| `function` | 뒤에 `(`가 오는 이름과 파이프 뒤의 함수 |
| `string` | 문자열 리터럴, 따옴표로 감싼 경로, 구분자 지시문의 값 |
| `number` | 숫자 리터럴 |
| `operator` | 태그 안의 연산자와 구두점 |
| `comment` | 템플릿 주석 `{* *}` |
| `path` | 따옴표 없는 include 경로와 block 태그 본문의 따옴표 없는 단어 |

- **EDT-9** `tags`는 주석을 뺀, 받아들인 모든 태그의 범위다. 에디터는 이 범위에 태그 배경을 칠한다. 어두운 테마에서는 `#16351c`, 밝은 테마에서는 `#e3f6dd`이다.

- **EDT-10** 공개 전체 분석 연산은 `parse`와 같은 AST, 파서의 원시 태그 record, 분류된 토큰 record를 반환한다. 파싱 오류가 나면 연산을 거부한다. 원시 태그마다 네이티브 필드 표기로 `kind`, `echo`, `start`, `end`, `bodyStart`, `bodyEnd`를 기록한다. 원시 record에는 주석 태그도 포함하며 EDT-9의 에디터 변환에서 이를 제외한다. 태그 종류는 `assignment`, `block`, `close`, `comment`, `directive`, `echo`, `else`, `elseif`, `for`, `if`, `ifblock`, `include`다. 토큰마다 EDT-8의 종류로 `kind`, `start`, `end`를 기록한다. TypeScript 범위는 UTF-16 인덱스, Python 범위는 코드 포인트 인덱스이며 Go·Rust·PHP·PHP 확장은 UTF-8 바이트 인덱스를 사용한다. 모든 범위는 맨 앞 BOM 하나를 제거한 텍스트를 기준으로 하며 공개 Source context가 네이티브 인덱스를 바이트 오프셋으로 변환한다(LEX-24).

- **EDT-11** 공개 부분 분석 연산은 EDT-10 형식의 원시 `tags`와 `tokens`, 첫 파서 오류 또는 null인 `error`를 반환한다. 올바른 소스는 전체 분석과 같은 범위를 반환한다. 실패한 태그의 태그 record와 토큰은 포함하지 않으며, EOF에서 블록이 닫히지 않았을 때의 여는 태그를 포함해 앞서 받아들인 태그는 보존한다. 결과에는 `ast`가 있다. 성공하면 전체 분석과 같은 완전한 AST이며 파서 오류가 있으면 null이다. 오류는 바이트 위치가 있는 ERR-1의 네이티브 템플릿 오류이고 메시지는 자유로운 영어 텍스트다. 잘못된 UTF-8과 구분자 옵션은 부분 결과가 되지 않고 SDK 경계에서 연산을 거부한다. TypeScript는 `analyzePrefix`, Go는 `AnalyzePrefix`, Rust와 Python은 `analyze_prefix`, PHP와 PHP 확장은 `AstProgram::analyzePrefix`를 사용한다.
