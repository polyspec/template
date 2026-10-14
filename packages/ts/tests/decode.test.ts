// decodeTemplate reads the canonical AST JSON into the Template of the package (AST-10).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstDecodeError, decodeTemplate, parse } from '../src/index.js';
import { AstProgram, Engine, MapLoader, decodeTemplate as renderDecodeTemplate } from '../src/render.js';
import { caseIds, casesDir } from '../../../tests/runner/case-list.mts';

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

  it.each([
    ['a missing field of the root', { type: 'Template', name: 'x', body: [] }, '', /comments/],
    ['a root of another type', { type: 'Text', name: 'x', body: [], comments: [] }, '/type', /constant/],
    ['an unknown node type', { type: 'Template', name: 'x', body: [{ type: 'Bogus', span: [0, 1] }], comments: [] }, '/body/0', /oneOf/],
    ['a field of no node', { type: 'Template', name: 'x', body: [{ type: 'Text', value: 'a', span: [0, 1], extra: 1 }], comments: [] }, '/body/0', /additional properties: extra/],
    ['a missing span of an expression', { type: 'Template', name: 'x', body: [{ type: 'Echo', expr: { type: 'Var', name: 'a' }, span: [0, 1] }], comments: [] }, '/body/0/expr', /'span'/],
    ['an invalid identifier inside an expression', { type: 'Template', name: 'x', body: [{ type: 'Echo', expr: { type: 'Binary', op: '+', left: { type: 'Var', name: '1a', span: [0, 1] }, right: { type: 'Var', name: 'b', span: [0, 1] }, span: [0, 1] }, span: [0, 1] }], comments: [] }, '/body/0/expr/left/name', /pattern/],
    ['a branch without its test', { type: 'Template', name: 'x', body: [{ type: 'If', branches: [{ body: [], span: [0, 1] }], else: null, span: [0, 1] }], comments: [] }, '/body/0/branches/0', /'test'/],
    ['a literal whose value is not of its kind', { type: 'Template', name: 'x', body: [{ type: 'Echo', expr: { type: 'Literal', kind: 'number', value: '1', span: [0, 1] }, span: [0, 1] }], comments: [] }, '/body/0/expr/value', /number/],
    ['a negative span offset', { type: 'Template', name: 'x', body: [{ type: 'Text', value: 'a', span: [-1, 1] }], comments: [] }, '/body/0/span/0', />= 0/],
  ])('fails on %s, naming its JSON path', (_name, json, path, reason) => {
    const error = failure(json);
    expect(error.path).toBe(path);
    expect(error.message).toContain(path === '' ? 'the root' : path);
    expect(error.message).toMatch(reason);
  });

  it('fails on text that is not JSON', () => {
    expect(() => decodeTemplate('{')).toThrow(SyntaxError);
  });
});
