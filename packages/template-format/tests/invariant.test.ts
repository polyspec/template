// Safety invariant over every template of the repository, with indent null and with the default indentation: the
// formatted AST equals the source AST without spans, the text outside tags is unchanged, and formatting is idempotent.
// With indentation the comparison ignores the spaces and tabs at the start of lines, or the result is the html error.
// The environment variable TEMPLATE_SOURCE_ROOT adds an explicit external template tree to the same checks.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { analyze, parse } from '@polyspec/template';
import { describe, expect, it } from 'vitest';
import { format } from '../src/index.js';
import { sameTree, withoutLineIndentation } from '../src/invariant.js';
import { repositoryRoot, templateFiles } from './helpers.js';

const roots = ['tests/cases', 'tests/fixtures', 'examples', 'packages/template-format/tests/fixtures'].map(path => join(repositoryRoot, path));
const external = process.env.TEMPLATE_SOURCE_ROOT;
if (external !== undefined && external !== '') {
  if (!existsSync(external)) throw new Error(`TEMPLATE_SOURCE_ROOT does not exist: ${external}`);
  roots.push(external);
}

function delimitersFor(file: string): string | undefined {
  const options = join(dirname(file), 'options.json');
  if (!existsSync(options)) return undefined;
  const value = (JSON.parse(readFileSync(options, 'utf8')) as { delimiters?: string }).delimiters;
  return value;
}

// The source text outside every tag, comment and directive, in order.
function outsideTags(text: string, delimiters: string | undefined): string[] {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const { tags } = analyze(source, 'x.tpl', delimiters === undefined ? {} : { delimiters });
  const pieces: string[] = [];
  let cursor = 0;
  for (const tag of tags) {
    pieces.push(source.slice(cursor, tag.start));
    cursor = tag.end;
  }
  pieces.push(source.slice(cursor));
  return pieces;
}

// The text outside tags without the spaces and tabs at the start of each line.
function withoutIndentation(pieces: readonly string[]): string[] {
  return pieces.map(piece => piece.replace(/(^|\n)[ \t]+/g, '$1'));
}

function parses(source: string, delimiters: string | undefined): boolean {
  try {
    parse(source, 'x.tpl', delimiters === undefined ? {} : { delimiters });
    return true;
  } catch {
    return false;
  }
}

describe('safety invariant', () => {
  const files = roots.flatMap(templateFiles);
  it('finds the conformance inputs', () => {
    expect(files.filter(file => file.endsWith('/input.tpl')).length).toBeGreaterThan(200);
  });
  for (const file of files) {
    const name = relative(repositoryRoot, file);
    it(name, () => {
      const source = readFileSync(file, 'utf8');
      const delimiters = delimitersFor(file);
      const options = delimiters === undefined ? { name } : { name, delimiters };
      const kept = { ...options, indent: null };
      const result = format(source, kept);
      const indented = format(source, options);
      if (!parses(source, delimiters)) {
        for (const item of [result, indented]) {
          expect(item.ok).toBe(false);
          if (!item.ok) expect(item.error.reason).toBe('parse');
        }
        return;
      }
      if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
      const parseOptions = delimiters === undefined ? {} : { delimiters };
      expect(sameTree(parse(source, name, parseOptions), parse(result.text, name, parseOptions))).toBe(true);
      expect(outsideTags(result.text, delimiters)).toEqual(outsideTags(source, delimiters));
      expect(format(result.text, kept)).toEqual({ ok: true, text: result.text, changed: false });

      if (!indented.ok) {
        expect(indented.error.reason).toBe('html');
        return;
      }
      const before = withoutLineIndentation(parse(source, name, parseOptions));
      expect(sameTree(before, withoutLineIndentation(parse(indented.text, name, parseOptions)))).toBe(true);
      expect(withoutIndentation(outsideTags(indented.text, delimiters))).toEqual(withoutIndentation(outsideTags(source, delimiters)));
      expect(format(indented.text, options)).toEqual({ ok: true, text: indented.text, changed: false });
    });
  }
});
