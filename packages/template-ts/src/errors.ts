// Error object and error codes as defined in docs/spec/errors.md.

// The code of a template error. Every code is listed with its condition and position in ERR-7
// to ERR-11.
export type ErrorCode =
  | 'E_LEX_INVALID_UTF8'
  | 'E_PARSE_UNTERMINATED_TAG'
  | 'E_PARSE_UNTERMINATED_COMMENT'
  | 'E_PARSE_UNTERMINATED_STRING'
  | 'E_PARSE_UNEXPECTED_TOKEN'
  | 'E_PARSE_INVALID_NUMBER'
  | 'E_PARSE_INVALID_ESCAPE'
  | 'E_PARSE_UNEXPECTED_CLOSE'
  | 'E_PARSE_UNCLOSED_BLOCK'
  | 'E_PARSE_ELSE_OUTSIDE_BLOCK'
  | 'E_PARSE_DUPLICATE_ELSE'
  | 'E_PARSE_ELSEIF_AFTER_ELSE'
  | 'E_PARSE_ELSEIF_NOT_IN_IF'
  | 'E_PARSE_RESERVED_NAME'
  | 'E_PARSE_INVALID_PATH'
  | 'E_PARSE_INVALID_BLOCK_TAG'
  | 'E_PARSE_INVALID_WRAPPER'
  | 'E_PARSE_INVALID_DIRECTIVE'
  | 'E_LOAD_NOT_FOUND'
  | 'E_LOAD_CYCLE'
  | 'E_LOAD_OUTSIDE_ROOT'
  | 'E_DATA_NUMBER_RANGE'
  | 'E_DATA_NUMBER_NOT_FINITE'
  | 'E_DATA_INVALID_UTF8'
  | 'E_DATA_UNSUPPORTED_TYPE'
  | 'E_RUNTIME_TYPE'
  | 'E_RUNTIME_COMPARE'
  | 'E_RUNTIME_DIV_ZERO'
  | 'E_RUNTIME_STRINGIFY'
  | 'E_RUNTIME_UNKNOWN_FUNCTION'
  | 'E_RUNTIME_ARITY'
  | 'E_RUNTIME_HOST_FUNCTION'
  | 'E_RUNTIME_UNKNOWN_LOOP'
  | 'E_RUNTIME_BLOCK_UNDEFINED'
  | 'E_RUNTIME_BLOCK_REDEFINED'
  | 'E_RUNTIME_DEPTH'
  | 'E_RUNTIME_LIMIT';

export type Span = readonly [number, number];

// The fields of a template error (ERR-1). Conformance compares `code`, `template`, `line` and
// `col` only.
export interface ErrorObject {
  code: ErrorCode;
  template: string;
  line: number;
  col: number;
  offset: number;
  end: number;
  message: string;
}

// Byte offsets of line starts, used to convert a byte offset into line and column.
export type LineIndex = readonly number[];

export function lineIndexOf(bytes: Uint8Array): LineIndex {
  const starts = [0];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) starts.push(i + 1);
  }
  return starts;
}

export function positionOf(lines: LineIndex, offset: number): { line: number; col: number } {
  let low = 0;
  let high = lines.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((lines[mid] as number) <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, col: offset - (lines[low] as number) + 1 };
}

// The error that parsing and rendering raise. It carries the position of the token or node it
// refers to (ERR-1, ERR-2).
export class TemplateError extends Error {
  readonly code: ErrorCode;
  readonly template: string;
  readonly line: number;
  readonly col: number;
  readonly offset: number;
  readonly end: number;

  // Creates an error from its fields.
  constructor(object: ErrorObject) {
    super(object.message);
    this.name = 'TemplateError';
    this.code = object.code;
    this.template = object.template;
    this.line = object.line;
    this.col = object.col;
    this.offset = object.offset;
    this.end = object.end;
  }

  // Returns the fields as a plain object, which is the form the command line prints.
  toObject(): ErrorObject {
    return {
      code: this.code,
      template: this.template,
      line: this.line,
      col: this.col,
      offset: this.offset,
      end: this.end,
      message: this.message,
    };
  }
}

// Creates an error located at a byte span of a template whose line index is known.
export function errorAt(
  code: ErrorCode,
  template: string,
  lines: LineIndex | null,
  span: Span,
  message: string,
): TemplateError {
  const position = lines ? positionOf(lines, span[0]) : { line: 0, col: 0 };
  return new TemplateError({
    code,
    template,
    line: position.line,
    col: position.col,
    offset: span[0],
    end: span[1],
    message,
  });
}

// Creates an error with no source position (data binding before rendering, entry template not found).
export function errorWithoutPosition(code: ErrorCode, template: string, message: string): TemplateError {
  return new TemplateError({ code, template, line: 0, col: 0, offset: 0, end: 0, message });
}
