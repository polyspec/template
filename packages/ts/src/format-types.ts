// Shared formatter SDK contract; the language service publishes its implementation.

/** Callable formatter implemented by the SDK formatting entry point (FMT-16). */
export type Formatter = (source: string, options?: FormatOptions) => FormatResult;

/** Options of {@link Formatter}. */
export interface FormatOptions {
  /** Template name used in error results. The default is `template.tpl`. */
  name?: string;
  /** Engine delimiter option as two characters (LEX-22). The default is `{}`. */
  delimiters?: string;
  /** String index range; only tags that lie completely inside it and lines that start inside it are formatted. */
  range?: { start: number; end: number };
  /** Indent unit: a run of spaces or one tab. The default is two spaces. `null` keeps the indentation of every line. */
  indent?: string | null;
  /** `indent` (default): template blocks add an indentation level like HTML elements. `flat`: they add none. */
  templateBlocks?: 'indent' | 'flat';
}

/** Why {@link Formatter} returned no text. */
export interface FormatError {
  /**
   * `parse`: the source does not parse. `invariant`: the formatted text does not parse to the same AST. `html`: the
   * HTML structure is not balanced, so the lines cannot be indented.
   */
  reason: 'parse' | 'invariant' | 'html';
  /** Error code of the parser, or null for an AST difference. */
  code: string | null;
  /** 1-based line of the error position. */
  line: number;
  /** 1-based byte column of the error position, as in parser errors (ERR-1). */
  col: number;
  /** Human-readable formatting failure. */
  message: string;
}

/** The result of {@link Formatter}: the formatted text, or the reason why the source is kept. */
export type FormatResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; error: FormatError };

