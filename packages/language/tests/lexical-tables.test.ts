// The language service declares no lexical table (T23.1): the parser of @polyspec/template classifies every part of a
// tag, so a regular expression or a list of strings that restates the template syntax would be a second reading of the
// grammar that drifts from the first. Every regular expression and every list of two or more strings in the sources is
// listed here with what it reads; one that is not listed fails.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseSync } from 'oxc-parser';
import { describe, expect, it } from 'vitest';

const SOURCES = path.resolve(import.meta.dirname, '../src');

const ALLOWED: Record<string, string> = {
  // The indent option of the formatter and of the document, not template syntax.
  'format.ts /^(?: +|\\t)$/': 'indent option',
  'document.ts /^(?: +|\\t)$/': 'indent option',
  // Whitespace between the parser tokens of a tag body, and a body that spans lines.
  'body.ts /^[ \\t\\r\\n]*$/': 'whitespace between tokens',
  'body.ts /[\\r\\n]/': 'a body that spans lines',
  // HTML tags and the leading whitespace of a line for the indentation.
  'indent.ts /^<(\\/?)([A-Za-z][A-Za-z0-9-]*)/': 'HTML tag name',
  'indent.ts /^[ \\t]*$/': 'leading whitespace of a line',
  // HTML void elements and the elements whose content keeps its lines.
  'indent.ts [area, base, br, col, embed, hr, img, input, link, meta, param, source, track, wbr]': 'HTML void elements',
  'indent.ts [script, style, textarea]': 'HTML raw text elements',
  'indent.ts [pre, script, style, textarea]': 'HTML elements that keep their lines',
  // Tag kinds of the parser that open and continue a construct, not template syntax.
  'indent.ts [if, for, ifblock]': 'parser kinds that open a construct',
  'indent.ts [elseif, else]': 'parser kinds that continue a construct',
  // The indentation of lines of text that the formatter may change (format invariant).
  'invariant.ts /(^|\\n)[ \\t]+/g': 'leading whitespace of text lines',
  // The --indent option of template-fmt.
  'cli/args.ts /^[1-8]$/': 'indent width option',
  // The LSP legend of the token types of the tokens rule (the classified parts of the text).
  'tokens.ts [delimiter, keyword, variable, property, function, string, number, operator, comment, path]': 'semantic token legend',
};

function sources(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.ts')).sort();
}

/** The regular expressions and the lists of two or more strings of one source, as `<file> <form>`. */
export function lexicalTables(directory: string): string[] {
  const found: string[] = [];
  for (const file of sources(directory)) {
    const name = file.split(path.sep).join('/');
    const { program, errors } = parseSync(file, readFileSync(path.join(directory, file), 'utf8'));
    expect(errors, name).toEqual([]);
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node === null || typeof node !== 'object') return;
      const item = node as { type?: string; regex?: { pattern: string; flags: string }; callee?: { type: string; name?: string }; elements?: unknown[] };
      if (item.type === 'Literal' && item.regex !== undefined) found.push(`${name} /${item.regex.pattern}/${item.regex.flags}`);
      if ((item.type === 'NewExpression' || item.type === 'CallExpression') && item.callee?.type === 'Identifier' && item.callee.name === 'RegExp') found.push(`${name} RegExp()`);
      if (item.type === 'ArrayExpression' && item.elements !== undefined) {
        const strings = item.elements.filter((element): element is { type: 'Literal'; value: string } => element !== null && typeof element === 'object' && 'type' in element && element.type === 'Literal' && 'value' in element && typeof element.value === 'string');
        if (strings.length >= 2) found.push(`${name} [${strings.map(element => element.value).join(', ')}]`);
      }
      for (const value of Object.values(node)) visit(value);
    };
    visit(program);
  }
  return found;
}

describe('lexical tables', () => {
  it('the language service holds no regular expression or string list beyond the listed ones', () => {
    expect(lexicalTables(SOURCES).filter(entry => !(entry in ALLOWED))).toEqual([]);
  });

  it('every listed entry is still in the sources', () => {
    const found = new Set(lexicalTables(SOURCES));
    expect(Object.keys(ALLOWED).filter(entry => !found.has(entry))).toEqual([]);
  });
});
