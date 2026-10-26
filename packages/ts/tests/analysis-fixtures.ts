// Shared, validated expected ranges for the full and prefix public SDK tests.
import { fileURLToPath } from 'node:url';
import type { Source, SyntaxTag, SyntaxToken } from '@polyspec/template';
import { jsonDocument } from '../../../scripts/json-document.mts';

interface Range { kind: string; start: number; end: number }
interface Tag extends Range { echo: boolean; bodyStart: number; bodyEnd: number }
interface Expected { ast?: unknown; tags: Tag[]; tokens: Range[]; error?: unknown }
interface Case { id: string; name: string; source: string; delimiters?: string; expected: Expected }

export function analysisFixtures(file: string, kind: 'full' | 'prefix'): Case[] {
  return jsonDocument<{ cases: Case[] }>('analysis contexts', {
    type: 'object', required: ['cases'], $defs: {
      token: { type: 'object', required: ['kind', 'start', 'end'], properties: {
        kind: { type: 'string' }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 },
      } },
      tag: { type: 'object', required: ['kind', 'start', 'end', 'echo', 'bodyStart', 'bodyEnd'], properties: {
        kind: { type: 'string' }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 0 },
        echo: { type: 'boolean' }, bodyStart: { type: 'integer', minimum: 0 }, bodyEnd: { type: 'integer', minimum: 0 },
      } },
    }, properties: { cases: { type: 'array', minItems: 1, items: {
      type: 'object', required: ['id', 'name', 'source', 'expected'], properties: {
        id: { type: 'string' }, name: { type: 'string' }, source: { type: 'string' }, delimiters: { type: 'string' },
        expected: { type: 'object', required: [kind === 'full' ? 'ast' : 'error', 'tags', 'tokens'], properties: {
          ast: { type: 'object' }, tags: { type: 'array', items: { $ref: '#/$defs/tag' } },
          tokens: { type: 'array', items: { $ref: '#/$defs/token' } },
          error: { anyOf: [{ type: 'null' }, { type: 'object', required: ['code', 'template', 'line', 'col', 'offset', 'end'], properties: {
            code: { type: 'string' }, template: { type: 'string' }, line: { type: 'integer' }, col: { type: 'integer' },
            offset: { type: 'integer' }, end: { type: 'integer' },
          } }] },
        } },
      },
    } } },
  }).read(fileURLToPath(new URL(`../../../tests/fixtures/${file}`, import.meta.url))).cases;
}

export function projectRanges(source: Source, result: { tags: readonly SyntaxTag[]; tokens: readonly SyntaxToken[] }) {
  return {
    tags: result.tags.map(tag => ({ ...tag, start: source.byteAt(tag.start), end: source.byteAt(tag.end),
      bodyStart: source.byteAt(tag.bodyStart), bodyEnd: source.byteAt(tag.bodyEnd) })),
    tokens: result.tokens.map(token => ({ ...token, start: source.byteAt(token.start), end: source.byteAt(token.end) })),
  };
}
