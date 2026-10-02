// Mark decorations of the template part of a document: token classes, tag backgrounds and matching tag highlights.
import { Prec, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { TemplateDocument } from '@polyspec/template-language';
import { templateDocument } from './document.js';

// The class of the tag background mark (EDT-9).
const TAG_CLASS = 'cm-template-tag';
// The class of the matching tag highlight mark (EDT-11).
const HIGHLIGHT_CLASS = 'cm-template-highlight';

const tagMark = Decoration.mark({ class: TAG_CLASS });
const highlightMark = Decoration.mark({ class: HIGHLIGHT_CLASS });
const tokenMarks = new Map<string, Decoration>();

function tokenMark(type: string): Decoration {
  let mark = tokenMarks.get(type);
  if (mark === undefined) {
    mark = Decoration.mark({ class: `cm-template-${type}` });
    tokenMarks.set(type, mark);
  }
  return mark;
}

function tokenSet(document: TemplateDocument): DecorationSet {
  return Decoration.set(document.tokens.map(token => tokenMark(token.type).range(token.start, token.end)));
}

function tagSet(document: TemplateDocument): DecorationSet {
  return Decoration.set(document.tags.map(tag => tagMark.range(tag.start, tag.end)));
}

function highlightSet(state: EditorState): DecorationSet {
  const ranges = state.field(templateDocument).highlights(state.selection.main.head);
  return Decoration.set(ranges.map(range => highlightMark.range(range.start, range.end)), true);
}

/**
 * The decorations of the template part. Token marks have a higher precedence than the HTML syntax highlighting, so
 * their elements are inside its elements and their colors apply; the tag background mark has the lowest precedence,
 * so its element encloses every other mark of the tag.
 */
export const templateMarks: Extension = [
  Prec.high(EditorView.decorations.compute([templateDocument], state => tokenSet(state.field(templateDocument)))),
  EditorView.decorations.compute([templateDocument, 'selection'], highlightSet),
  Prec.lowest(EditorView.decorations.compute([templateDocument], state => tagSet(state.field(templateDocument)))),
];
