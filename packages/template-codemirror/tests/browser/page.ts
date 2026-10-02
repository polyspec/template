// Test page: mounts an editor with the template extension and exposes it to the browser test.
import { defaultKeymap } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { template } from '../../src/index.js';

declare global {
  interface Window {
    // Mounts a new editor with a text and a light or dark theme.
    mount(doc: string, dark: boolean): void;
    // The text of the editor.
    text(): string;
    // The messages of the editor's lint diagnostics.
    diagnostics(): string[];
  }
}

let view: EditorView | null = null;

window.mount = (doc, dark) => {
  view?.destroy();
  const parent = document.querySelector('#editor') as HTMLElement;
  const extensions = [keymap.of(defaultKeymap), syntaxHighlighting(defaultHighlightStyle), template(), EditorView.theme({}, { dark })];
  view = new EditorView({ parent, state: EditorState.create({ doc, extensions }) });
  view.focus();
};

window.text = () => view?.state.doc.toString() ?? '';

window.diagnostics = () => {
  const messages: string[] = [];
  if (view !== null) forEachDiagnostic(view.state, item => messages.push(item.message));
  return messages;
};
