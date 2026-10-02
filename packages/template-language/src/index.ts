// Package entry: the language service document and the formatter used by every editor adapter (EDT-1).
export { format, type FormatError, type FormatOptions, type FormatResult } from './format.js';
export {
  openDocument,
  TemplateDocument,
  type Diagnostic,
  type DocumentFormatOptions,
  type DocumentOptions,
  type FoldingRange,
  type LineIndentationOptions,
  type Range,
  type TagRange,
} from './document.js';
export type { Construct, ConstructTag } from './structure.js';
export { TOKEN_TYPES, type Token, type TokenType } from './tokens.js';
