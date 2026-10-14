// Path tokens (GRM-3) and block tag bodies (GRM-13 to GRM-15).
import type { Expr, ScopeItem } from '../ast.js';
import type { TemplateError } from '../errors.js';
import { lexStringLiteral } from '../expr/lexer.js';
import { ExpressionParser } from '../expr/parser.js';
import type { Source } from '../source.js';
import { isHorizontalSpace, skipHorizontalSpace } from './scanner.js';

const PATH_CHARS = /[A-Za-z0-9_./-]/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface PathToken {
  kind: 'path';
  value: string;
  start: number;
  end: number;
  quoted: boolean;
}

interface IdentToken {
  kind: 'ident';
  value: string;
  start: number;
  end: number;
}

export type RawToken = PathToken | IdentToken;

/** The range of one word of a raw tag body, and whether it is a quoted string. */
interface RawWord {
  start: number;
  end: number;
  quoted: boolean;
}

export interface BlockBody {
  id: string | null;
  path: string | null;
  scope: ScopeItem[];
  // The words of the body: the id, the path and each scope item with its value.
  words: RawWord[];
  end: number;
}

export class RawTagReader {
  constructor(
    private readonly source: Source,
    private readonly template: string,
    private readonly close: string,
    private readonly closeCount: number,
    private readonly fail: (code: 'E_PARSE_INVALID_PATH' | 'E_PARSE_INVALID_BLOCK_TAG' | 'E_PARSE_UNEXPECTED_TOKEN', start: number, end: number, message: string) => TemplateError,
  ) {}

  private get text(): string {
    return this.source.text;
  }

  private atClose(index: number): boolean {
    return this.text.startsWith(this.close.repeat(this.closeCount), index);
  }

  // Reads a quoted string or a run of path characters. Returns null at the close delimiter or end of input.
  private readToken(index: number): RawToken | null {
    index = skipHorizontalSpace(this.text, index);
    if (index >= this.text.length || this.atClose(index)) return null;
    const char = this.text[index] as string;
    if (char === '"' || char === "'") {
      const literal = lexStringLiteral(this.source, index, this.template);
      return { kind: 'path', value: literal.decoded, start: index, end: literal.end, quoted: true };
    }
    let end = index;
    while (end < this.text.length && PATH_CHARS.test(this.text[end] as string)) end++;
    const value = this.text.slice(index, end);
    if (value.includes('.') || value.includes('/')) return { kind: 'path', value, start: index, end, quoted: false };
    if (IDENT.test(value)) return { kind: 'ident', value, start: index, end };
    return { kind: 'ident', value: '', start: index, end: index + 1 };
  }

  // GRM-12: `+ path`.
  readIncludePath(index: number): { path: string; start: number; end: number; quoted: boolean } {
    const token = this.readToken(index);
    if (token === null || token.value === '') {
      const at = skipHorizontalSpace(this.text, index);
      throw this.fail('E_PARSE_INVALID_PATH', at, at + 1, 'include requires a path');
    }
    if (token.kind !== 'path') throw this.fail('E_PARSE_INVALID_PATH', token.start, token.end, `${JSON.stringify(token.value)} is not a path`);
    return { path: token.value, start: token.start, end: token.end, quoted: token.kind === 'path' && token.quoted };
  }

  // GRM-13 to GRM-15: `# [id] [path] {scope_item}`.
  readBlockBody(index: number): BlockBody {
    let id: string | null = null;
    let path: string | null = null;
    const scope: ScopeItem[] = [];
    const words: RawWord[] = [];
    const word = (item: RawToken, end = item.end): void => {
      words.push({ start: item.start, end, quoted: item.kind === 'path' && item.quoted });
    };
    let cursor = index;
    let token = this.readToken(cursor);
    if (token === null || token.value === '') {
      const at = skipHorizontalSpace(this.text, cursor);
      throw this.fail('E_PARSE_INVALID_BLOCK_TAG', at, at + 1, 'block tag requires an identifier or a path');
    }
    if (token.kind === 'path') {
      path = token.value;
      cursor = token.end;
      word(token);
    } else {
      id = token.value;
      cursor = token.end;
      word(token);
      token = this.readToken(cursor);
      if (token !== null && token.kind === 'path') {
        path = token.value;
        cursor = token.end;
        word(token);
      }
    }
    for (;;) {
      token = this.readToken(cursor);
      if (token === null) break;
      if (token.kind !== 'ident' || token.value === '') {
        throw this.fail('E_PARSE_INVALID_BLOCK_TAG', token.start, token.end, `unexpected ${JSON.stringify(this.text.slice(token.start, token.end))} in block tag`);
      }
      cursor = token.end;
      if (this.text[cursor] === ':') {
        const valueStart = cursor + 1;
        if (valueStart >= this.text.length || isHorizontalSpace(this.text.charCodeAt(valueStart))) {
          throw this.fail('E_PARSE_INVALID_BLOCK_TAG', cursor, cursor + 1, 'scope item requires a value after ":"');
        }
        const parser = new ExpressionParser(this.source, valueStart, { close: this.close, closeCount: this.closeCount, openIndex: null }, this.template);
        const expr: Expr = parser.parsePostfix(true);
        scope.push({ name: token.value, expr });
        cursor = parser.end;
        word(token, cursor);
      } else {
        word(token);
        scope.push({
          name: token.value,
          expr: { type: 'Var', name: token.value, span: this.source.span(token.start, token.end) },
        });
      }
    }
    return { id, path, scope, words, end: cursor };
  }
}
