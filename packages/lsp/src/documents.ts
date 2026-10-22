// Analysis cache: one language service document per open document version.
import { fileURLToPath } from 'node:url';
import { openDocument, type TemplateDocument } from '@polyspec/template-language';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { fileHost } from './host.js';

/** The template name of a document: the file path of a `file:` URI, otherwise the URI. */
export function nameOf(uri: string): string {
  return uri.startsWith('file:') ? fileURLToPath(uri) : uri;
}

/** Keeps the analysis of the latest version of every open document. */
export class Analyses {
  private readonly entries = new Map<string, { version: number; document: TemplateDocument }>();

  /** Returns the analysis of the document version, analyzing the text when the version changed. */
  of(text: TextDocument): TemplateDocument {
    const entry = this.entries.get(text.uri);
    if (entry !== undefined && entry.version === text.version) return entry.document;
    const name = nameOf(text.uri);
    const document = openDocument(text.getText(), text.uri.startsWith('file:') ? { name, location: { path: name, host: fileHost } } : { name });
    this.entries.set(text.uri, { version: text.version, document });
    return document;
  }

  /** Removes the analysis of a closed document. */
  delete(uri: string): void {
    this.entries.delete(uri);
  }
}
