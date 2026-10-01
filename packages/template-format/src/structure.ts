// Tag structure: the parse error of a source, or every tag range and the block constructs (GRM-18) with the ranges of their tags.
import { analyze, TemplateError } from '@polyspec/template';
import { indexOfByte } from './positions.js';

/** One tag of a construct. `start` and `end` are string indexes into the source. */
export interface ConstructTag {
  kind: 'if' | 'elseif' | 'else' | 'for' | 'ifblock' | 'close';
  start: number;
  end: number;
}

/** One tag that the parser accepted. `start` and `end` are string indexes into the source. */
export interface TemplateTag {
  kind: 'assignment' | 'block' | 'close' | 'comment' | 'directive' | 'echo' | 'else' | 'elseif' | 'for' | 'if' | 'ifblock' | 'include';
  start: number;
  end: number;
}

/** A block construct: the opening tag, its branch tags and the close tag, in source order. */
export interface Construct {
  kind: 'if' | 'for' | 'ifblock';
  /** String index of the opening tag. */
  start: number;
  /** String index after the close tag. */
  end: number;
  tags: ConstructTag[];
}

/** A parse error with string index positions. `line` and `col` are the parser's 1-based line and byte column. */
export interface StructureError {
  code: string;
  message: string;
  line: number;
  col: number;
  start: number;
  end: number;
}

/** Options of {@link templateStructure}. */
export interface StructureOptions {
  name?: string;
  delimiters?: string;
}

/** The result of {@link templateStructure}. */
export type StructureResult = { ok: true; tags: TemplateTag[]; constructs: Construct[] } | { ok: false; error: StructureError };

const BOM = '﻿';

/**
 * Parses a source with `@polyspec/template` and returns its tags in source order and its block constructs,
 * or the parse error.
 * The constructs come from the tag ranges that the parser accepted: loop, if and if-block tags open a
 * construct, else-if and else tags belong to the innermost open construct, and the close tag ends it.
 */
export function templateStructure(source: string, options: StructureOptions = {}): StructureResult {
  const shift = source.startsWith(BOM) ? BOM.length : 0;
  const text = source.slice(shift);
  let tags: ReturnType<typeof analyze>['tags'];
  try {
    tags = analyze(text, options.name ?? 'template.tpl', options.delimiters === undefined ? {} : { delimiters: options.delimiters }).tags;
  } catch (error) {
    if (!(error instanceof TemplateError)) throw error;
    const start = indexOfByte(text, error.offset);
    const end = Math.max(indexOfByte(text, error.end), start);
    return { ok: false, error: { code: error.code, message: error.message, line: error.line, col: error.col, start: start + shift, end: end + shift } };
  }
  const all: TemplateTag[] = [];
  const constructs: Construct[] = [];
  const open: Construct[] = [];
  for (const tag of tags) {
    const range = { start: tag.start + shift, end: tag.end + shift };
    all.push({ kind: tag.kind, ...range });
    switch (tag.kind) {
      case 'if':
      case 'for':
      case 'ifblock': {
        const construct: Construct = { kind: tag.kind, start: range.start, end: range.end, tags: [{ kind: tag.kind, ...range }] };
        constructs.push(construct);
        open.push(construct);
        break;
      }
      case 'elseif':
      case 'else':
        open[open.length - 1]?.tags.push({ kind: tag.kind, ...range });
        break;
      case 'close': {
        const construct = open.pop();
        if (construct === undefined) break;
        construct.tags.push({ kind: 'close', ...range });
        construct.end = range.end;
        break;
      }
      default:
        break;
    }
  }
  return { ok: true, tags: all, constructs };
}

/** Returns the construct that has a tag containing the string index, including the index after the tag. */
export function constructAt(constructs: readonly Construct[], index: number): { construct: Construct; tag: number } | null {
  for (const construct of constructs) {
    const tag = construct.tags.findIndex(item => item.start <= index && index <= item.end);
    if (tag >= 0) return { construct, tag };
  }
  return null;
}
