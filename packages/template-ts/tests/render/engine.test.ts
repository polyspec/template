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
    program.register('twice', ([n]) => (n as number) * 2);
    program.register('wrap', ([s]) => `[${s as string}]`);
    expect(engine.render('a.tpl', {})).toBe('4 [a]');
    expect(() => program.register('upper', () => '')).toThrow();
  });

  it('reports host function failures at the call', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': 'x\n{= boom()}' }), functions: { boom: () => { throw new Error('no'); } } }));
    let caught: TemplateError | null = null;
    try {
      engine.render('a.tpl', {});
    } catch (error) {
      caught = error as TemplateError;
    }
    expect(caught?.code).toBe('E_RUNTIME_HOST_FUNCTION');
    expect(caught?.line).toBe(2);
  });

  it('applies the iteration limit', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '{@ i = range(1, 10)}{= i}{/}' }), limits: { iterations: 5 } }));
    expect(() => engine.render('a.tpl', {})).toThrow(TemplateError);
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
});
