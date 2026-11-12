// Engine API: loaders, host functions, limits and AST rendering (RT-1 to RT-6, RT-40, RT-41).
import { describe, expect, it } from 'vitest';
import { AstProgram, Engine, MapLoader, parse, TemplateError, RuntimeEnvironment, type Loader } from '../../src/index.js';
import { AstProgram as RenderAstProgram, Engine as RenderEngine } from '../../src/render.js';

describe('Engine', () => {
  it('renders a template from a map loader', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '<b>{= x}</b>' }) }));
    expect(engine.render('a.tpl', { x: '<' })).toBe('<b>&lt;</b>');
  });

  // RT-3: render takes a template name, loaded through the loader, or a parsed template,
  // and returns the whole output as one string.
  it('renders a template by its name and as a parsed template (RT-3)', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '<p>{= x}</p>' }) }));
    expect(engine.render('a.tpl', { x: 1 })).toBe('<p>1</p>');
    expect(engine.render(parse('<p>{= x}</p>', 'a.tpl'), { x: 1 })).toBe('<p>1</p>');
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

  // FUN-43, FUN-44, FUN-45, FUN-47, FUN-48, VAL-7: registration, a refused built-in name, a replaced function, the binding of a result, the same names in every host and a plain string result.
  it('follows the host function rules (FUN-43, FUN-44, FUN-45, FUN-47, FUN-48)', () => {
    const templates = { 'a.tpl': '{= tag()}', 'b.tpl': '{= two()}', 'c.tpl': '{= big()}' };
    const program = new AstProgram({ loader: new MapLoader(templates) });
    const engine = new Engine(program);
    program.register('tag', () => '<b>');
    expect(engine.render('a.tpl', {})).toBe('&lt;b&gt;');
    expect(() => program.register('upper', () => '')).toThrow();
    program.register('two', () => 'first');
    program.register('two', () => 'second');
    expect(engine.render('b.tpl', {})).toBe('second');
    program.register('big', () => 1e19);
    let bound: TemplateError | null = null;
    try {
      engine.render('c.tpl', {});
    } catch (error: unknown) {
      if (!(error instanceof TemplateError)) throw error;
      bound = error;
    }
    expect(bound?.code).toBe('E_DATA_NUMBER_RANGE');
    const other = new AstProgram({ loader: new MapLoader(templates) });
    let unknown: TemplateError | null = null;
    try {
      new Engine(other).render('a.tpl', {});
    } catch (error: unknown) {
      if (!(error instanceof TemplateError)) throw error;
      unknown = error;
    }
    expect(unknown?.code).toBe('E_RUNTIME_UNKNOWN_FUNCTION');
  });

  // FUN-9: a safe string compares, concatenates and stringifies as its text.
  it('uses a safe string as its text (FUN-9)', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': "{= raw('<b>') == '<b>'}|{= raw('<b>') + '!'}|{= str(raw('<i>'))}" }) }));
    expect(engine.render('a.tpl', {})).toBe('true|&lt;b&gt;!|&lt;i&gt;');
  });

  // FUN-46: an error that a host function reports fails the render with E_RUNTIME_HOST_FUNCTION at the position of its call.
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

  // RT-20: exceeding the iteration limit fails with E_RUNTIME_LIMIT.
  it('applies the iteration limit', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '{@ i = range(1, 10)}{= i}{/}' }), limits: { iterations: 5 } }));
    let caught: TemplateError | null = null;
    try {
      engine.render('a.tpl', {});
    } catch (error: unknown) {
      if (!(error instanceof TemplateError)) throw error;
      caught = error;
    }
    expect(caught?.code).toBe('E_RUNTIME_LIMIT');
  });

  it('applies the configured expression-depth limit', () => {
    const engine = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': '{= !true}' }), limits: { expressionDepth: 1 } }));
    expect(() => engine.render('a.tpl', {})).toThrow(expect.objectContaining({
      code: 'E_RUNTIME_LIMIT',
      message: 'expression nesting exceeds 1',
    }));
  });

  // RT-5, RT-6: a limits or functions option that the spec does not allow fails the creation of the program (ERR-13).
  it('fails the creation of a program on limits or functions that the spec does not allow (RT-5, RT-6)', () => {
    const loader = new MapLoader({ 'a.tpl': '1' });
    const failure = (build: () => unknown): Error => {
      try {
        build();
      } catch (error: unknown) {
        if (error instanceof Error) return error;
        throw error;
      }
      throw new Error('no error was thrown');
    };
    const cases: Array<[() => unknown, string]> = [
      // @ts-expect-error the spec's invalid values are passed on purpose
      [() => new AstProgram({ loader, limits: 5 }), 'limits is not an object'],
      // @ts-expect-error the spec's invalid values are passed on purpose
      [() => new AstProgram({ loader, limits: [1] }), 'limits is not an object'],
      // @ts-expect-error the spec's invalid values are passed on purpose
      [() => new AstProgram({ loader, limits: { loops: 1 } }), 'limits.loops is not a limit'],
      [() => new AstProgram({ loader, limits: { iterations: 1.5 } }), 'limits.iterations is not an integer'],
      // @ts-expect-error the spec's invalid values are passed on purpose
      [() => new AstProgram({ loader, limits: { depth: '3' } }), 'limits.depth is not an integer'],
      // @ts-expect-error the spec's invalid values are passed on purpose
      [() => new AstProgram({ loader, functions: 5 }), 'functions is not an object'],
      // @ts-expect-error the spec's invalid values are passed on purpose
      [() => new AstProgram({ loader, functions: { f: 1 } }), 'functions.f is not a function'],
    ];
    for (const [build, message] of cases) {
      const error = failure(build);
      expect(error).not.toBeInstanceOf(TemplateError);
      expect(error).not.toBeInstanceOf(TypeError);
      expect(error).not.toBeInstanceOf(RangeError);
      expect(error.message).toBe(message);
    }
    expect(() => new AstProgram({ loader, limits: { iterations: 10 }, functions: { f: () => 1 } })).not.toThrow();
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

  // RT-76: under dev a program renders the changed source of a template, and under false it keeps its first parse.
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

  // RT-40: under the default artifact refresh policy `true` (RT-76) an engine parses a template once per name@version
  // and reuses the parse while the loader reports the same version.
  it('reuses the parse of a template while the loader reports the same version (RT-40)', () => {
    let source = '1';
    let version = 'v1';
    const loader: Loader = {
      load: (name) => (name === 'a.tpl' ? { source, version } : null),
    };
    const engine = new Engine(new AstProgram({ loader }));
    expect(engine.render('a.tpl', {})).toBe('1');
    source = '2';
    expect(engine.render('a.tpl', {})).toBe('1');
    version = 'v2';
    expect(engine.render('a.tpl', {})).toBe('2');
  });

  // RT-4: a define or an env given as request data that is not an object fails the render (E_DATA_UNSUPPORTED_TYPE).
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

  // RT-33: the default limits; RT-35: the output size is checked as the output is written, and exceeding it fails;
  // RT-36: a failed render aborts and returns no partial output.
  it('applies the default limits, checks the output size as it writes and returns no output on an error (RT-33, RT-35, RT-36)', () => {
    for (const key of ['iterations', 'depth', 'outputBytes', 'expressionDepth'] as const) {
      const baseline = { iterations: 1_000_000, depth: 32, outputBytes: 16 * 1024 * 1024, expressionDepth: 64 };
      const environment = new RuntimeEnvironment({ [key]: 7 });
      expect(environment.limits()).toEqual({ ...baseline, [key]: 7 });
    }
    const defaults = new AstProgram({ loader: new MapLoader({ 'a.tpl': '1' }) });
    expect(defaults.limits()).toEqual({ iterations: 1_000_000, depth: 32, outputBytes: 16 * 1024 * 1024, expressionDepth: 64 });

    const fits = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': "ab{= 'cd'}" }), limits: { outputBytes: 4 } }));
    expect(fits.render('a.tpl', {})).toBe('abcd');

    const exceeds = new Engine(new AstProgram({ loader: new MapLoader({ 'a.tpl': "ab{= 'cd'}" }), limits: { outputBytes: 3 } }));
    let output: string | undefined;
    let caught: TemplateError | null = null;
    try {
      output = exceeds.render('a.tpl', {});
    } catch (error: unknown) {
      if (!(error instanceof TemplateError)) throw error;
      caught = error;
    }
    expect(caught?.code).toBe('E_RUNTIME_LIMIT');
    expect(caught?.line).toBe(1);
    expect(caught?.col).toBe(3);
    expect(output).toBeUndefined();
  });
});
