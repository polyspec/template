<!-- doc-id: packages-template-codemirror-readme -->
# @polyspec/template-codemirror

[한국어](README.ko.md).

CodeMirror 6 extension for template sources. It adds the HTML language of `@codemirror/lang-html`, template token classes, tag backgrounds, diagnostics, folding, matching tag highlights, the typing indentation and the format command. Every result comes from the language service `@polyspec/template-language`; the extension contains no template rule.

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

| Export | Meaning |
| --- | --- |
| `template(options)` | the extension; options `templateBlocks` (`indent` or `flat`), `delimiters` (two characters) and `name` (template name of diagnostics) |
| `formatTemplate` | command that replaces the document with the formatted text using the editor's indent unit; bound to Shift+Alt+F |
| `goToMatchingTag` | command that moves the main cursor to the matching tag; not bound to a key |
| `templateDiagnostics(state)` | the diagnostics of a state |
| `templateDocument` | state field with the language service document of the state's text |

The marks have the classes `cm-template-<type>` for the token types (`delimiter`, `keyword`, `variable`, `property`, `function`, `string`, `number`, `operator`, `comment`, `path`), `cm-template-tag` for the tag background and `cm-template-highlight` for the tags of the construct under the cursor.

Options, classes, default colors and commands are described in [Formatter, language server and editors](../../docs/operations/editor-tools.md#codemirror-6-adapter), and the contract in [Editor support](../../docs/spec/editor.md).
