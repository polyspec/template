// Commands of the template extension: formatting (EDT-12) and moving to the matching tag (EDT-11).
import { EditorSelection, type StateCommand } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { templateDocument } from './document.js';
import { templateOptions } from './options.js';

/**
 * Replaces the document with the formatted text, using the editor's indent unit and the `templateBlocks` option.
 * Returns false and changes nothing when the formatter returns an error.
 */
export const formatTemplate: StateCommand = ({ state, dispatch }) => {
  const result = state.field(templateDocument).format({
    indent: state.facet(indentUnit),
    templateBlocks: state.facet(templateOptions).templateBlocks ?? 'indent',
  });
  if (!result.ok) return false;
  if (result.changed) dispatch(state.update({ changes: { from: 0, to: state.doc.length, insert: result.text }, userEvent: 'format' }));
  return true;
};

/** Moves the main cursor to the matching tag of the main cursor position. Returns false when there is none. */
export const goToMatchingTag: StateCommand = ({ state, dispatch }) => {
  const target = state.field(templateDocument).matchingTag(state.selection.main.head);
  if (target === null) return false;
  dispatch(state.update({ selection: EditorSelection.cursor(target), scrollIntoView: true, userEvent: 'select' }));
  return true;
};

/**
 * Binds Shift+Alt+F to {@link formatTemplate} by the physical key (`KeyboardEvent.code` `KeyF`). A keymap binding
 * `Shift-Alt-f` matches the typed character, and on macOS Option+Shift+F types a different character, so the binding
 * would never run there.
 */
export const templateFormatKey = EditorView.domEventHandlers({
  keydown(event, view) {
    if (event.code !== 'KeyF' || !event.shiftKey || !event.altKey || event.ctrlKey || event.metaKey) return false;
    if (!formatTemplate(view)) return false;
    event.preventDefault();
    return true;
  },
});
