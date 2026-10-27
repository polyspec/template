// decodeTemplate reads the canonical AST JSON into the Template of the package (AST-10).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstDecodeError, decodeTemplate, parse } from '../src/index.js';
import { AstProgram, Engine, MapLoader, decodeTemplate as renderDecodeTemplate } from '../src/render.js';
import { caseIds, casesDir } from '../../../tests/runner/case-list.mts';
import { repoRoot } from './helpers.js';

// The invalid ASTs that every runtime fails with the same JSON Pointer (AST-10).
function invalidCases(): { name: string; ast: unknown; path: string }[] {
  const fixture: unknown = JSON.parse(readFileSync(join(repoRoot, 'tests/fixtures/ast-decode/invalid.json'), 'utf8'));
  const cases: unknown = typeof fixture === 'object' && fixture !== null && 'cases' in fixture ? fixture.cases : undefined;
  if (!Array.isArray(cases)) throw new Error('tests/fixtures/ast-decode/invalid.json has no cases array');
  return cases.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('name' in entry) || !('ast' in entry) || !('path' in entry)) throw new Error(`invalid.json: ${JSON.stringify(entry)} is no case`);
    const { name, ast, path } = entry;
    if (typeof name !== 'string' || typeof path !== 'string') throw new Error(`invalid.json: ${JSON.stringify(entry)} has no string name and path`);
    return { name, ast, path };
  });
}

const echo = '{"type":"Template","name":"x.tpl","body":[{"type":"Echo","expr":{"type":"Binary","op":"+","left":{"type":"Var","name":"a","span":[3,4]},"right":{"type":"Literal","kind":"number","value":1,"span":[7,8]},"span":[3,8]},"span":[0,9]}],"comments":[]}';

function failure(json: unknown): AstDecodeError {
  try {
    decodeTemplate(json);
  } catch (error) {
    if (error instanceof AstDecodeError) return error;
    throw error;
  }
  throw new Error('the JSON decoded');
}

describe('decodeTemplate', () => {
  it('constructs native schema errors with a pointer and reason (AST-10)', () => {
    for (const path of ['', '/body/0/expr/value~1key']) {
      const error = new AstDecodeError(path, 'expected scalar');
      expect(error).toBeInstanceOf(Error);
      expect(error.path).toBe(path);
      expect(error.message).toContain(path === '' ? 'the root' : path);
      expect(error.message).toContain('expected scalar');
    }
  });

  it('reads the expected.ast.json of every conformance case as the AST that parse returns', () => {
    const files = caseIds().map(id => join(casesDir, id, 'expected.ast.json')).filter(existsSync);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(decodeTemplate(text), file).toEqual(JSON.parse(text));
    }
  });

  it('renders a decoded template without its source through the render-only entry (RT-41)', () => {
    const ast = renderDecodeTemplate(echo);
    expect(ast).toEqual(parse('{= a + 1}', 'x.tpl'));
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'x.tpl': ast }) }));
    expect(engine.render('x.tpl', { a: 2 })).toBe('3');
  });

  it('decodes a parsed JSON value as its text', () => {
    expect(decodeTemplate(JSON.parse(echo))).toEqual(decodeTemplate(echo));
  });

  it('fails on every invalid AST of the shared fixture with the JSON Pointer of its invalid node', () => {
    const cases = invalidCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const { name, ast, path } of cases) {
      const error = failure(ast);
      expect(error.path, name).toBe(path);
      expect(error.message, name).toContain(path === '' ? 'the root' : path);
    }
  });

  it('fails on text that is not JSON', () => {
    expect(() => decodeTemplate('{')).toThrow(SyntaxError);
  });
});

it('preserves class-call AST fields through the public decoder (AST-10)', () => {
  const text = readFileSync(join(repoRoot, 'tests/fixtures/ast-decode/class-call.json'), 'utf8');
  expect(decodeTemplate(text)).toEqual(JSON.parse(text));
});

// AST-4, AST-10: every operator and loop metadata literal retains its canonical value.
it('preserves canonical enum literals through the public decoder (AST-10)', () => {
  const text = readFileSync(join(repoRoot, 'tests/fixtures/ast-decode/enum-literals.json'), 'utf8');
  expect(decodeTemplate(text)).toEqual(JSON.parse(text));
});
