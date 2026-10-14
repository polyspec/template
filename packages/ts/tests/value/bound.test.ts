// Bound data (VAL-22, ERR-14, RT-61) with the shared fixture of tests/fixtures/bound-data/cases.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstProgram, MapLoader, TemplateError, bind, merge, type BoundMap, type RenderOptions } from '../../src/index.js';
import * as renderEntry from '../../src/render.js';
import { boundEntries } from '../../src/value/bound.js';
import { repoRoot } from '../helpers.js';

const fixtureDir = join(repoRoot, 'tests', 'fixtures', 'bound-data');
const cases = JSON.parse(readFileSync(join(fixtureDir, 'cases.json'), 'utf8')) as {
  assign: Record<string, unknown>;
  second: Record<string, unknown>;
  mergedKeys: string[];
  definitionData: Record<string, unknown>;
  outputs: Record<'page' | 'merged' | 'define' | 'empty', string>;
  rejections: Record<string, { template: string; line: number; col: number }>;
};

const templates = Object.fromEntries(
  ['page.tpl', 'define.tpl', 'part.tpl', 'empty.tpl', 'result.tpl'].map(name => [name, readFileSync(join(fixtureDir, name), 'utf8')]),
);

function program(result: unknown = null): AstProgram {
  const engine = new AstProgram({ loader: new MapLoader(templates) });
  engine.register('pick', () => result);
  return engine;
}

// A fresh copy of a fixture value, so that no test shares host data with another.
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function definition(data: unknown): RenderOptions {
  return { define: { part: { template: 'part.tpl', data } } };
}

function failure(operation: () => unknown): TemplateError {
  try {
    operation();
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error('the operation did not fail');
}

function expectBindFailure(error: TemplateError, code: string): void {
  expect(error.toObject()).toMatchObject({ code, template: '', line: 0, col: 0, offset: 0, end: 0 });
}

describe('bound data (VAL-22)', () => {
  it('renders a bound map with the same bytes as the host map (RT-61)', () => {
    const bound = bind(copy(cases.assign));
    expect(program().render('page.tpl', bound)).toBe(cases.outputs.page);
    expect(program().render('page.tpl', copy(cases.assign))).toBe(cases.outputs.page);
  });

  it('renders a prepared bound map more than once with the same bytes (RT-62)', () => {
    const prepared = program().prepare('page.tpl', bind(copy(cases.assign)));
    expect(prepared.render()).toBe(cases.outputs.page);
    expect(prepared.render()).toBe(cases.outputs.page);
  });

  it('keeps the values that bind checked when the host changes its value later', () => {
    const assign = copy(cases.assign) as { list: unknown[]; m: Record<string, unknown> };
    const bound = bind(assign);
    assign.list.push(3);
    assign.m.k = 'changed';
    expect(program().render('page.tpl', bound)).toBe(cases.outputs.page);
  });

  it('merges by the precedence of RT-26 and keeps the position of the first map', () => {
    const merged = merge(bind(copy(cases.assign)), bind(copy(cases.second)));
    expect([...boundEntries(merged)!.keys()]).toEqual(cases.mergedKeys);
    expect(program().render('page.tpl', merged)).toBe(cases.outputs.merged);
    const host = { ...copy(cases.assign), ...copy(cases.second) };
    expect(program().render('page.tpl', host)).toBe(cases.outputs.merged);
  });

  it('accepts a bound map as definition data (RT-24)', () => {
    expect(program().render('define.tpl', copy(cases.assign), definition(bind(copy(cases.definitionData))))).toBe(cases.outputs.define);
    expect(program().render('define.tpl', copy(cases.assign), definition(copy(cases.definitionData)))).toBe(cases.outputs.define);
  });

  it('binds null and undefined to the empty bound map (RT-4)', () => {
    expect(program().render('empty.tpl', bind(null))).toBe(cases.outputs.empty);
    expect(program().render('empty.tpl', bind(undefined))).toBe(cases.outputs.empty);
    expect([...boundEntries(bind(null))!.keys()]).toEqual([]);
  });

  it('returns a bound map given to bind unchanged', () => {
    const bound = bind(copy(cases.assign));
    expect(bind(bound)).toBe(bound);
  });

  it('provides bind and merge in the browser entry with the same bound map type', () => {
    const bound = renderEntry.bind(copy(cases.assign));
    expect(program().render('page.tpl', bound)).toBe(cases.outputs.page);
    expect(renderEntry.merge(bind(copy(cases.assign)), renderEntry.bind(copy(cases.second)))).toBeDefined();
  });

  describe('rejected positions', () => {
    const rejected = (name: string): TemplateError => {
      const bound = bind({ k: 'v' });
      switch (name) {
        case 'list':
          return failure(() => program().render('page.tpl', { ...copy(cases.assign), items: [bound] }));
        case 'map':
          return failure(() => program().render('page.tpl', { ...copy(cases.assign), inner: { k: bound } }));
        case 'bind':
          return failure(() => bind({ k: bound }));
        case 'definitionData':
          return failure(() => program().render('define.tpl', copy(cases.assign), definition({ k: bound })));
        case 'result':
          return failure(() => program(bound).render('result.tpl', {}));
        default:
          throw new Error(`unknown rejection ${name}`);
      }
    };
    for (const [name, position] of Object.entries(cases.rejections)) {
      it(`rejects a bound map at the position ${name}`, () => {
        expect(rejected(name).toObject()).toMatchObject({ code: 'E_DATA_UNSUPPORTED_TYPE', ...position });
      });
    }
  });

  describe('errors of bind and merge (ERR-14)', () => {
    it('fails on a value that binding does not turn into a map', () => {
      expectBindFailure(failure(() => bind(5)), 'E_DATA_UNSUPPORTED_TYPE');
      expectBindFailure(failure(() => bind([1])), 'E_DATA_UNSUPPORTED_TYPE');
      expectBindFailure(failure(() => bind('{"a":1}')), 'E_DATA_UNSUPPORTED_TYPE');
    });

    it('fails with the code of the failed check', () => {
      expectBindFailure(failure(() => bind({ n: Number.NaN })), 'E_DATA_NUMBER_NOT_FINITE');
      expectBindFailure(failure(() => bind({ n: 2 ** 53 })), 'E_DATA_NUMBER_RANGE');
      expectBindFailure(failure(() => bind({ s: '\ud800' })), 'E_DATA_INVALID_UTF8');
      let deep: unknown = 1;
      for (let level = 0; level < 65; level++) deep = [deep];
      expectBindFailure(failure(() => bind({ deep })), 'E_DATA_DEPTH');
    });

    it('fails when an argument of merge is not a bound map', () => {
      const bound = bind({ a: 1 });
      expectBindFailure(failure(() => merge(bound, { b: 2 })), 'E_DATA_UNSUPPORTED_TYPE');
      expectBindFailure(failure(() => merge({ b: 2 }, bound)), 'E_DATA_UNSUPPORTED_TYPE');
    });

    it('reports a language runtime error as E_INTERNAL (ERR-13)', () => {
      const value = {
        get broken(): unknown {
          throw new TypeError('defect');
        },
      };
      expectBindFailure(failure(() => bind(value)), 'E_INTERNAL');
    });

    it('passes another exception unchanged (ERR-13)', () => {
      const thrown = new Error('host failure');
      const value = {
        get broken(): unknown {
          throw thrown;
        },
      };
      expect(() => bind(value)).toThrow(thrown);
    });
  });

  describe('the bound map type', () => {
    const type = Object.getPrototypeOf(bind({})).constructor as new (...args: unknown[]) => BoundMap;

    it('cannot be created with new', () => {
      expect(() => new type()).toThrow(TypeError);
      expect(() => new type(Symbol('token'), new Map())).toThrow(TypeError);
    });

    it('cannot be subclassed', () => {
      class Derived extends type {}
      expect(() => new Derived()).toThrow(TypeError);
    });

    it('treats an object that only inherits its prototype as a class instance (VAL-19)', () => {
      const imitation = Object.create(type.prototype) as object;
      expect(program().render('empty.tpl', { imitation })).toBe(cases.outputs.empty);
      expect(failure(() => bind(imitation)).code).toBe('E_DATA_UNSUPPORTED_TYPE');
    });

    it('has no own enumerable state', () => {
      const bound = bind(copy(cases.assign));
      expect(Object.keys(bound)).toEqual([]);
      expect(Object.getOwnPropertyNames(type.prototype)).toEqual(['constructor']);
    });
  });
});
