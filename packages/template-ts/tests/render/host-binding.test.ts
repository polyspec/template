// Host binding of JavaScript values and native objects (VAL-2, VAL-13, VAL-17 to VAL-20, FUN-46, ERR-13).
import { describe, expect, it } from 'vitest';
import { AstProgram, MapLoader, parse, parseJson, TemplateError, type ErrorCode, type Template } from '../../src/index.js';
import { bind, BindError } from '../../src/value/bind.js';
import { FsLoader } from '../../src/node/index.js';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof TemplateError || error instanceof BindError) return error.code;
    throw error;
  }
  return 'OK';
}

function failure(run: () => unknown): TemplateError {
  try {
    run();
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error('expected a template error');
}

function program(templates: Record<string, string>): AstProgram {
  return new AstProgram({ loader: new MapLoader(templates) });
}

const nested = (levels: number): unknown => {
  let value: unknown = [];
  for (let level = 1; level < levels; level++) value = [value];
  return value;
};

class Order {
  name = 'n';
  handler = (): string => 'h';
  #secret = 's';
  get label(): string { return `label:${this.#secret}`; }
  get broken(): string { throw new Error('getter exploded'); }
  same(other: unknown): boolean { return other === this; }
  nan(): number { return Number.NaN; }
  fail(): string { throw new Error('method exploded'); }
}
(Order.prototype as unknown as Record<string, unknown>).shared = 1;

describe('numbers', () => {
  it('checks the value, not the host type or the JSON spelling (VAL-2)', () => {
    for (const value of [2 ** 53, 1e19, -9007199254740992, BigInt('9007199254740992')]) expect(code(() => bind(value))).toBe('E_DATA_NUMBER_RANGE');
    for (const text of ['9007199254740992', '9007199254740992.0', '1e19', '-9.007199254740992e15']) expect(code(() => parseJson(text))).toBe('E_DATA_NUMBER_RANGE');
    expect(bind(-9007199254740991)).toBe(-9007199254740991);
    expect(parseJson('9007199254740991.0')).toBe(9007199254740991);
    expect(code(() => parseJson(`1${'0'.repeat(400)}`))).toBe('E_DATA_NUMBER_NOT_FINITE');
  });
});

describe('strings and keys', () => {
  it('rejects text that is not well-formed UTF-16 (VAL-13, VAL-17)', () => {
    for (const value of ['a\ud800', '\udc00', new Map([['\ud800', 1]]), { '\udc00': 1 }]) expect(code(() => bind(value))).toBe('E_DATA_INVALID_UTF8');
    expect(code(() => parseJson('"\\ud800"'))).toBe('E_DATA_INVALID_UTF8');
    expect(code(() => parseJson('{"\\udc00": 1}'))).toBe('E_DATA_INVALID_UTF8');
    expect(code(() => parseJson('"\ud800"'))).toBe('E_DATA_INVALID_UTF8');
    expect(parseJson('"\\ud83d\\ude00"')).toBe('\u{1F600}');
  });

  it('rejects a define id that is not well-formed UTF-16 (VAL-17)', () => {
    expect(code(() => program({ 'a.tpl': '1' }).render('a.tpl', {}, { define: { '\ud800': 'a.tpl' } }))).toBe('E_DATA_INVALID_UTF8');
  });

  it('fails at the first violation in document order (VAL-12)', () => {
    expect(code(() => parseJson('{"a": 1e19, "b": "\\ud800"}'))).toBe('E_DATA_NUMBER_RANGE');
    expect(code(() => parseJson('{"b": "\\ud800", "a": 1e19}'))).toBe('E_DATA_INVALID_UTF8');
  });
});

describe('depth', () => {
  it('stops cycles and deep values with the depth limit (VAL-20)', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const list: unknown[] = [];
    list.push(list);
    const map = new Map<string, unknown>();
    map.set('self', map);
    for (const value of [cyclic, list, map, nested(200000)]) expect(code(() => bind(value))).toBe('E_DATA_DEPTH');
    expect(code(() => bind(nested(64)))).toBe('OK');
    expect(code(() => bind(nested(65)))).toBe('E_DATA_DEPTH');
    expect(code(() => parseJson('['.repeat(200000)))).toBe('E_DATA_DEPTH');
    const templates = program({ 'a.tpl': '{= json(m) | raw}' });
    expect(templates.render('a.tpl', { m: nested(63) })).toBe(`${'['.repeat(63)}${']'.repeat(63)}`);
    expect(failure(() => templates.render('a.tpl', { m: nested(64) })).code).toBe('E_DATA_DEPTH');
  });
});

describe('native objects', () => {
  const templates = program({
    'fields.tpl': '{= o.name}|{= o["name"]}|{= o.label}|{= o.same}|{= o.shared}|{= o.missing}',
    'handler.tpl': 'x{= o.handler}',
    'broken.tpl': 'x{= o["broken"]}',
    'call.tpl': 'x{= o.CALL()}',
    'nan.tpl': 'x{= o.nan()}',
    'fail.tpl': 'x{= o.fail()}',
    'same.tpl': '{= same(o, [o], ["k" => o])}|{= o.same(o)}|{= Order::same(o)}',
  });

  it('reads own properties and getters but not methods (VAL-19)', () => {
    expect(templates.render('fields.tpl', { o: new Order() })).toBe('n|n|label:s|||');
  });

  it('binds field values and reports failures at the lookup (VAL-19, ERR-5)', () => {
    const handler = failure(() => templates.render('handler.tpl', { o: new Order() }));
    expect([handler.code, handler.line, handler.col]).toEqual(['E_DATA_UNSUPPORTED_TYPE', 1, 5]);
    const broken = failure(() => templates.render('broken.tpl', { o: new Order() }));
    expect([broken.code, broken.col]).toEqual(['E_RUNTIME_HOST_FUNCTION', 5]);
    expect(broken.message).toContain('getter exploded');
  });

  it('calls only methods declared below Object.prototype (VAL-19)', () => {
    for (const method of ['toString', 'constructor', 'handler', 'hasOwnProperty', 'name']) {
      const source = `{= o.${method}()}`;
      expect(code(() => program({ 'm.tpl': source }).render('m.tpl', { o: new Order() }))).toBe('E_RUNTIME_UNKNOWN_FUNCTION');
    }
    expect(code(() => templates.render('call.tpl', { o: new Order() }))).toBe('E_RUNTIME_UNKNOWN_FUNCTION');
  });

  it('binds method results at the call and keeps host messages (VAL-19, FUN-46)', () => {
    const nan = failure(() => templates.render('nan.tpl', { o: new Order() }));
    expect([nan.code, nan.col]).toEqual(['E_DATA_NUMBER_NOT_FINITE', 5]);
    const fail = failure(() => templates.render('fail.tpl', { o: new Order() }));
    expect(fail.code).toBe('E_RUNTIME_HOST_FUNCTION');
    expect(fail.message).toContain('method exploded');
  });

  it('passes the original instance to host code (VAL-18)', () => {
    const order = new Order();
    const local = program({ 'same.tpl': '{= same(o, [o], ["k" => o])}|{= o.same(o)}|{= Order::same(o)}' });
    local.register('same', ([direct, list, map]) => direct === order && (list as unknown[])[0] === order && (map as Map<string, unknown>).get('k') === order);
    local.registerClass('Order', 'same', ([direct]) => direct === order);
    expect(local.render('same.tpl', { o: order })).toBe('true|true|true');
  });

  it('binds host function and class function results at the call (FUN-45)', () => {
    const local = program({ 'a.tpl': 'x{= f()}', 'b.tpl': 'x{= Order::f()}', 'c.tpl': '{= make().name}' });
    local.register('f', () => 1e19);
    local.registerClass('Order', 'f', () => '\ud800');
    local.register('make', () => new Order());
    const host = failure(() => local.render('a.tpl', {}));
    expect([host.code, host.col]).toEqual(['E_DATA_NUMBER_RANGE', 5]);
    const classFunction = failure(() => local.render('b.tpl', {}));
    expect([classFunction.code, classFunction.col]).toEqual(['E_DATA_INVALID_UTF8', 5]);
    expect(local.render('c.tpl', {})).toBe('n');
  });
});

describe('internal boundary', () => {
  it('reports a language runtime error as E_INTERNAL and lets other exceptions pass (ERR-13)', () => {
    const broken = new AstProgram({ loader: { load: () => ({ ast: {} as Template, version: '1' }) } });
    const error = failure(() => broken.render('page.tpl', {}));
    expect([error.code, error.template, error.line] as [ErrorCode, string, number]).toEqual(['E_INTERNAL', 'page.tpl', 0]);
    expect(code(() => parse('{= 1}', 'p.tpl'))).toBe('OK');
  });
});

describe('loader failures', () => {
  const throwing = (failing: string) => new AstProgram({
    loader: {
      load: (name: string) => {
        if (name === failing) throw new Error(`cannot read ${name}`);
        return { source: name === 'page.tpl' ? 'a\n{+ part.tpl}' : 'part', version: '1' };
      },
    },
  });

  it('reports a throwing loader as E_LOAD_FAILED at the entry template (RT-9, ERR-6)', () => {
    const error = failure(() => throwing('page.tpl').render('page.tpl', {}));
    expect([error.code, error.template, error.line, error.col]).toEqual(['E_LOAD_FAILED', 'page.tpl', 0, 0]);
    expect(error.message).toContain('cannot read page.tpl');
  });

  it('reports a throwing loader as E_LOAD_FAILED at the include tag (RT-9, ERR-9)', () => {
    const error = failure(() => throwing('part.tpl').render('page.tpl', {}));
    expect([error.code, error.template, error.line, error.col]).toEqual(['E_LOAD_FAILED', 'page.tpl', 2, 1]);
    expect(error.message).toContain('cannot read part.tpl');
  });

  it('reports an unreadable regular file as E_LOAD_FAILED and a directory as E_LOAD_NOT_FOUND (RT-10)', () => {
    const root = mkdtempSync(join(tmpdir(), 'template-loader-'));
    try {
      writeFileSync(join(root, 'locked.tpl'), 'x');
      chmodSync(join(root, 'locked.tpl'), 0o000);
      mkdirSync(join(root, 'folder.tpl'));
      const files = new AstProgram({ loader: new FsLoader(root) });
      expect(code(() => files.render('locked.tpl', {}))).toBe('E_LOAD_FAILED');
      expect(code(() => files.render('folder.tpl', {}))).toBe('E_LOAD_NOT_FOUND');
      expect(code(() => files.render('missing.tpl', {}))).toBe('E_LOAD_NOT_FOUND');
    } finally {
      chmodSync(join(root, 'locked.tpl'), 0o600);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('JSON text', () => {
  it('reports text that is not one JSON document as E_DATA_INVALID_JSON (VAL-12)', () => {
    for (const text of ['', ' ', '{', '{"a": }', '[1,]', '{"a": 1} x', 'nul', '"a', '01']) expect(code(() => parseJson(text))).toBe('E_DATA_INVALID_JSON');
    expect(code(() => parseJson('{"a": 1e19, "b": }'))).toBe('E_DATA_NUMBER_RANGE');
  });
});
