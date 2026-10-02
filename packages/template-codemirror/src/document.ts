// The language service document of an editor state: one analysis per document text (EDT-4).
import { StateField, type EditorState } from '@codemirror/state';
import { openDocument, type DocumentOptions, type TemplateDocument } from '@polyspec/template-language';
import { templateOptions } from './options.js';

/** Opens a language service document for a text with the name and delimiters of the state's template options. */
export function documentOf(state: EditorState, text: string): TemplateDocument {
  const { name, delimiters } = state.facet(templateOptions);
  const options: DocumentOptions = {};
  if (name !== undefined) options.name = name;
  if (delimiters !== undefined) options.delimiters = delimiters;
  return openDocument(text, options);
}

/** The language service document of the state's text, analyzed again when the document changes. */
export const templateDocument = StateField.define<TemplateDocument>({
  create: state => documentOf(state, state.doc.toString()),
  update: (document, transaction) => (transaction.docChanged ? documentOf(transaction.state, transaction.state.doc.toString()) : document),
});
