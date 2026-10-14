// Engine API: loaders, host functions, limits and AST rendering (RT-1 to RT-6, RT-40, RT-41).
import { describe, expect, it } from 'vitest';
import { AstProgram, Engine, MapLoader, parse, TemplateError } from '../../src/index.js';
import { AstProgram as RenderAstProgram, Engine as RenderEngine } from '../../src/render.js';

describe('Engine', () => {
  it('renders a template from a map loader', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '<b>{= x}</b>' }) }));
    expect(engine.render('a.tpl', { x: '<' })).toBe('<b>&lt;</b>');
  });

  it('calls registered host functions and binds their results', () => {
    const program = new AstProgram({ loader: new MapLoader({ 'a.tpl': '{= twice(2)} {= wrap("a")}' }) });
    const engine = new Engine(program);
    program.register('twice', ([n]) => {
      if (typeof n !== 'number') throw new TypeError(`twice takes a number, not ${String(n)}`);
      return n * 2;
    });
    program.register('wrap', ([s]) => {
      if (typeof s !== 'string') throw new TypeError(`wrap takes a string, not ${String(s)}`);
      return `[${s}]`;
    });
    expect(engine.render('a.tpl', {})).toBe('4 [a]');
    expect(() => program.register('upper', () => '')).toThrow();
  });

  it('reports host function failures at the call', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': 'x\n{= boom()}' }), functions: { boom: () => { throw new Error('no'); } } }));
    let caught: TemplateError | null = null;
    try {
      engine.render('a.tpl', {});
    } catch (error: unknown) {
      if (!(error instanceof TemplateError)) throw error;
      caught = error;
    }
    expect(caught?.code).toBe('E_RUNTIME_HOST_FUNCTION');
    expect(caught?.line).toBe(2);
  });

  it('applies the iteration limit', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '{@ i = range(1, 10)}{= i}{/}' }), limits: { iterations: 5 } }));
    expect(() => engine.render('a.tpl', {})).toThrow(TemplateError);
  });

  it('applies the configured expression-depth limit', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '{= !true}' }), limits: { expressionDepth: 1 } }));
    expect(() => engine.render('a.tpl', {})).toThrow(expect.objectContaining({
      code: 'E_RUNTIME_LIMIT',
      message: 'expression nesting exceeds 1',
    }));
  });

  it('renders a parsed AST through the render-only entry', () => {
    const ast = parse('{= a + 1}', 'x.tpl');
    const engine = new RenderEngine(new RenderAstProgram({ loader: new MapLoader({ 'x.tpl': ast }) }));
    expect(engine.render('x.tpl', { a: 2 })).toBe('3');
    expect(engine.render(ast, { a: 2 })).toBe('3');
  });

  it('re-parses when the loader reports a new version', () => {
    const loader = new MapLoader({ 'a.tpl': '1' });
    const engine = new Engine(new AstProgram({ loader }));
    expect(engine.render('a.tpl', {})).toBe('1');
    loader.set('a.tpl', '2');
    expect(engine.render('a.tpl', {})).toBe('2');
  });

  it('supports development and immutable artifact refresh policies', () => {
    const devLoader = new MapLoader({ 'a.tpl': '1' });
    const dev = new Engine(new AstProgram({ loader: devLoader, artifactRefresh: 'dev' }));
    expect(dev.render('a.tpl', {})).toBe('1');
    devLoader.set('a.tpl', '2');
    expect(dev.render('a.tpl', {})).toBe('2');

    const immutableLoader = new MapLoader({ 'a.tpl': '1' });
    const immutable = new Engine(new AstProgram({ loader: immutableLoader, artifactRefresh: 'false' }));
    expect(immutable.render('a.tpl', {})).toBe('1');
    immutableLoader.set('a.tpl', '2');
    expect(immutable.render('a.tpl', {})).toBe('1');
  });

  it('binds define and env given as request data, and rejects them when they are no object', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '{= date(0, "Y")}|{+ "b.tpl"}', 'b.tpl': 'B' }) }));
    expect(engine.render('a.tpl', {}, { define: null, env: null })).toBe('1970|B');
    expect(engine.render('a.tpl', {}, { define: { b: 'b.tpl' }, env: { timezone: 'Z' } })).toBe('1970|B');
    const failure = (options: { define?: unknown; env?: unknown }): string => {
      try {
        engine.render('a.tpl', {}, options);
      } catch (error) {
        if (!(error instanceof TemplateError)) throw error;
        return `${error.code}: ${error.message}`;
      }
      return 'rendered';
    };
    expect(failure({ define: 'b.tpl' })).toBe('E_DATA_UNSUPPORTED_TYPE: define is not an object');
    expect(failure({ env: 0 })).toBe('E_DATA_UNSUPPORTED_TYPE: env is not an object');
    expect(failure({ define: new Map([['b', 'b.tpl']]) })).toBe('E_DATA_UNSUPPORTED_TYPE: define is not an object');
    expect(failure({ env: ['Z'] })).toBe('E_DATA_UNSUPPORTED_TYPE: env is not an object');
    expect(failure({ env: { now: 'today' } })).toBe('E_DATA_UNSUPPORTED_TYPE: env.now is not a number');
  });
});
