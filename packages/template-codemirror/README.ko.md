# @polyspec/template-codemirror

[English](README.md).

템플릿 소스를 위한 CodeMirror 6 확장이다. `@codemirror/lang-html`의 HTML 언어, 템플릿 토큰 클래스, 태그 배경, 진단, 접기, 짝 태그 강조, 타이핑 들여쓰기, 포맷 명령을 더한다. 모든 결과는 언어 서비스 `@polyspec/template-language`에서 오며, 확장은 템플릿 규칙을 갖지 않는다.

```sh
npm install @polyspec/template-codemirror @codemirror/state @codemirror/view @codemirror/language @codemirror/lint @codemirror/lang-html @codemirror/commands
```

```ts
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { goToMatchingTag, template } from '@polyspec/template-codemirror';

new EditorView({
  parent: document.querySelector('#editor') as HTMLElement,
  state: EditorState.create({
    doc: '<ul>\n  {@ item = items}\n    <li>{= item.name}</li>\n  {/}\n</ul>\n',
    extensions: [
      keymap.of([{ key: 'Mod-Alt-\\', run: goToMatchingTag }, ...defaultKeymap]),
      template({ templateBlocks: 'indent', name: 'list.tpl' }),
    ],
  }),
});
```

| export | 의미 |
| --- | --- |
| `template(options)` | 확장. 옵션은 `templateBlocks`(`indent` 또는 `flat`), `delimiters`(두 문자), `name`(진단에 쓰는 템플릿 이름)이다 |
| `formatTemplate` | 편집기의 들여쓰기 단위로 문서를 포맷한 텍스트로 바꾸는 명령. Shift+Alt+F에 연결된다 |
| `goToMatchingTag` | 주 커서를 짝 태그로 옮기는 명령. 키에 연결되지 않는다 |
| `templateDiagnostics(state)` | 상태의 진단 |
| `templateDocument` | 상태의 텍스트에 대한 언어 서비스 문서를 갖는 상태 필드 |

마크의 클래스는 토큰 종류(`delimiter`, `keyword`, `variable`, `property`, `function`, `string`, `number`, `operator`, `comment`, `path`)에 대한 `cm-template-<type>`, 태그 배경에 대한 `cm-template-tag`, 커서 아래 구성의 태그에 대한 `cm-template-highlight`이다.

옵션, 클래스, 기본 색, 명령은 [포매터와 VS Code 확장](../../docs/operations/editor-tools.ko.md#codemirror-6-어댑터)에, 계약은 [에디터 지원](../../docs/spec/editor.ko.md)에 설명되어 있다.
