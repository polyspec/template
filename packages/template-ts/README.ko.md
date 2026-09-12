# @polyspec/template

[English](README.md).

템플릿 언어의 TypeScript 구현: 렉서, 파서, 렌더러, 내장 함수, 명령줄 인터페이스. 패키지는 Node.js와 브라우저에서 실행된다.

## 설치

```sh
npm install @polyspec/template
```

## 서버에서 렌더

```ts
import { AstProgram, Engine } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';

const program = new AstProgram({ loader: new FsLoader('templates') });
program.register('greet', ([name]) => `Hello, ${name}`);
const engine = new Engine(program);
const assign = { title: 'Home' };
const html = engine.render('layout', assign, {
  define: { layout: 'layout.tpl', content: 'pages/home.tpl' },
  env: { timezone: '+09:00', now: Math.floor(Date.now() / 1000) },
});
```

## 브라우저에서 렌더

```ts
import { AstProgram, Engine, MapLoader, parseJson } from '@polyspec/template';

const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'card.tpl': '<b>{= name}</b>' }) }));
const assign = parseJson(document.getElementById('state').textContent);
document.getElementById('card').innerHTML = engine.render('card.tpl', assign);
```

`parseJson`은 JSON 텍스트의 키 순서를 보존하고 안전 범위 밖의 정수를 거부한다. `JSON.parse`는 둘 다 하지 않는다.

## 파싱된 템플릿 렌더

`@polyspec/template/render`는 파싱된 템플릿(AST JSON)을 받는 엔진을 내보내며 렉서와 파서를 포함하지 않는다.

```ts
import { AstProgram, Engine, MapLoader } from '@polyspec/template/render';

const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'card.tpl': cardAst }) }));
```

## API

| 내보내기 | 설명 |
| --- | --- |
| `parse(source, name, { delimiters })` | 템플릿 하나를 AST로 파싱한다. `source`는 문자열 또는 UTF-8 바이트다. |
| `analyze(source, name, { delimiters })` | 한 번 파싱해 AST, 파서 태그 범위, 소비한 표현식 token 범위를 반환한다. |
| `new AstProgram({ loader, functions, limits, delimiters })` | AST program을 생성한다. `loader`의 기본값은 빈 `MapLoader`다. |
| `new Engine(program)` | AST 또는 generated program 하나에 위임하는 engine을 생성한다. |
| `engine.render(nameOrAst, assign, { define, env })` | 템플릿을 문자열로 렌더한다. `assign`은 변수를 담고 `define`은 템플릿 경로나 HTML 항목을 제공한다. |
| `astProgram.register(name, fn)` | 호스트 함수 `(args, { env }) => value`를 등록한다. |
| `MapLoader`, `FsLoader` | 메모리 로더와 파일시스템 로더. |
| `parseJson`, `parseJsonBytes` | assign 데이터용 순서 보존 JSON 파서. |
| `TemplateError` | `code`, `template`, `line`, `col`, `offset`, `end`, `message`를 가진 오류. |
| `SafeString` | echo 태그가 이스케이프 없이 쓰는 문자열. |

## 명령줄

```sh
node bin/template.mjs parse FILE [--root DIR] [--delimiters OC]
node bin/template.mjs render FILE [--data F] [--define F] [--env F] [--root DIR] [--delimiters OC]
```

`parse`는 AST JSON을 출력한다. `render`는 출력을 인쇄한다. 템플릿 오류는 stderr에 오류 JSON을 출력하고 상태 2로 종료한다.
## 개발

```sh
npm run build -w @polyspec/template
npm test -w @polyspec/template -- --run
npm run typecheck -w @polyspec/template
```

테스트는 `tests/`에 있다. 저장소의 적합성 케이스와 표현식 픽스처를 인프로세스로 실행한다.
