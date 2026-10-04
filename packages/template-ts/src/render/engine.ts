// Engine: template loading, caching, function registration and rendering (RT-1 to RT-6, RT-40, RT-41).
import type { Template } from '../ast.js';
import { errorAt, internalBoundary, TemplateError, type Span } from '../errors.js';
import { type Env, type HostFunction } from '../functions/index.js';
import { MapLoader, resolvePath, type Loader, type LoadResult, PathError } from '../loader.js';
import { DEFAULT_DELIMITERS, parseDelimiters, type Delimiters } from '../parser/scanner.js';
import { BindError, bindData, bindMap, checkText } from '../value/bind.js';
import type { MapValue, Value } from '../value/value.js';
import { Frame, RenderContext, Scope, type DefineEntry, type Limits, type ParsedTemplate, type RuntimeServices } from './context.js';
import { RuntimeEnvironment } from './runtime-environment.js';
import { Renderer } from './statements.js';

export type ParseFunction = (source: string | Uint8Array, name: string, delimiters: Delimiters) => ParsedTemplate;

// Controls when a compiled template artifact is refreshed.
export type ArtifactRefresh = 'dev' | 'true' | 'false';

// What an engine is created with (RT-1, RT-5, RT-6, RT-42). Every field has a default.
export interface EngineOptions {
  loader?: Loader;
  functions?: Record<string, HostFunction>;
  classFunctions?: Record<string, HostFunction>;
  limits?: Partial<Limits>;
  delimiters?: string;
  // Parser used for sources returned by the loader; absent in the render-only build.
  parse?: ParseFunction;
  // dev parses on every load, true refreshes when the loader version changes,
  // false keeps the first loaded artifact for the lifetime of the engine.
  artifactRefresh?: ArtifactRefresh;
}

// One template definition: a path, a definition entry, or ready HTML (RT-24).
export type DefineInput = string | {
  template?: string;
  data?: unknown;
  html?: string;
};

// What one render call receives besides assigned variables: template definitions and the environment (RT-4).
export interface RenderOptions {
  define?: Record<string, DefineInput>;
  env?: Partial<Env>;
}

class AstPreparedExecution {
  constructor(
    private readonly engine: AstProgramCore,
    private readonly rootData: MapValue,
    private readonly registry: Map<string, DefineEntry>,
    private readonly env: Env,
    private readonly targetName: string,
    private readonly template: ParsedTemplate,
  ) {}

  render(): string {
    const context = new RenderContext(this.engine, this.rootData, this.env, this.targetName);
    for (const [id, entry] of this.registry) context.registry.set(id, entry);
    context.enter(this.targetName, null, null);
    new Renderer(context, this.engine).renderNodes(this.template.ast.body, new Frame(this.template.ast.name, this.template.lines, this.rootData), new Scope());
    return context.output.toString();
  }
}

// A prepared request owns exactly one AST or generated execution.
export interface PreparedRender {
  render(): string;
}

class AstPreparedRender implements PreparedRender {
  constructor(private readonly name: string, private readonly execution: AstPreparedExecution) {}

  // A language runtime error during the render is E_INTERNAL (ERR-13).
  render(): string { return internalBoundary(this.name, () => this.execution.render()); }
}

/** Prepares and renders one complete compiled template representation. */
export interface Program {
  prepare(target: string | Template, assign: unknown, options?: RenderOptions): PreparedRender;
  render(target: string | Template, assign: unknown, options?: RenderOptions): string;
}

/** Delegates requests to one complete AST or generated program. */
export class Engine implements Program {
  /** Creates an engine that delegates to one program. */
  constructor(readonly program: Program) {}

  /** Delegates request preparation to the program. */
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender {
    return this.program.prepare(target, assign, options);
  }

  /** Delegates rendering to the program. */
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string {
    return this.program.render(target, assign, options);
  }
}

/** AST program core with template loading, host functions, limits and parsed artifacts. */
export class AstProgramCore implements RuntimeServices, Program {
  readonly loader: Loader;
  readonly runtime: RuntimeEnvironment;
  readonly delimiters: Delimiters;
  private readonly parseFunction: ParseFunction | null;
  readonly artifactRefresh: ArtifactRefresh;
  private readonly cache = new Map<string, { version: string; template: ParsedTemplate }>();

  // Creates an engine. An unknown delimiter pair raises an error here, before any render.
  constructor(options: EngineOptions = {}) {
    this.loader = options.loader ?? new MapLoader();
    this.runtime = new RuntimeEnvironment(options.limits, options.functions);
    for (const [name, fn] of Object.entries(options.classFunctions ?? {})) {
      const separator = name.indexOf('::');
      if (separator <= 0 || separator === name.length - 2) throw new Error(`${JSON.stringify(name)} is not a class function name`);
      this.runtime.registerClass(name.slice(0, separator), name.slice(separator + 2), fn);
    }
    this.parseFunction = options.parse ?? null;
    this.artifactRefresh = options.artifactRefresh ?? 'true';
    if (options.delimiters !== undefined) {
      const delimiters = parseDelimiters(options.delimiters);
      if (delimiters === null) throw new Error(`${JSON.stringify(options.delimiters)} is not a delimiter pair`);
      this.delimiters = delimiters;
    } else {
      this.delimiters = DEFAULT_DELIMITERS;
    }
  }

  // FUN-43, FUN-44.
  register(name: string, fn: HostFunction): void {
    this.runtime.register(name, fn);
  }

  /** Registers one logical class function used by `Class::method(...)`. */
  registerClass(className: string, method: string, fn: HostFunction): void {
    this.runtime.registerClass(className, method, fn);
  }

  /** Returns the host function registered under a name. */
  hostFunction(name: string): HostFunction | undefined {
    return this.runtime.hostFunction(name);
  }

  /** Returns one logical class function. */
  classFunction(className: string, method: string): HostFunction | undefined {
    return this.runtime.classFunction(className, method);
  }

  /** Returns the active resource limits. */
  limits(): Limits {
    return this.runtime.limits();
  }

  // RT-9, RT-40: loads a template by name through the loader and caches it by version.
  loadTemplate(name: string, from: Frame | null, span: Span | null): ParsedTemplate {
    const fail = (code: 'E_LOAD_NOT_FOUND' | 'E_LOAD_FAILED', message: string): TemplateError => {
      if (from && span) return errorAt(code, from.name, from.lines, span, message);
      return new TemplateError({ code, template: name, line: 0, col: 0, offset: 0, end: 0, message });
    };
    let loaded: LoadResult | null;
    try {
      loaded = this.loader.load(name);
    } catch (error) {
      // RT-9: every exception of the loader is a load failure of the requested name.
      throw fail('E_LOAD_FAILED', `template ${name} cannot be loaded: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (loaded === null) throw fail('E_LOAD_NOT_FOUND', `template ${name} does not exist`);
    const cached = this.cache.get(name);
    if (this.artifactRefresh === 'false' && cached) return cached.template;
    if (this.artifactRefresh === 'true' && cached && cached.version === loaded.version) return cached.template;
    let template: ParsedTemplate;
    if ('ast' in loaded) {
      template = { ast: loaded.ast, lines: null };
    } else {
      if (!this.parseFunction) throw new Error('this build renders parsed templates only; the loader returned source text');
      template = this.parseFunction(loaded.source, name, this.delimiters);
    }
    this.cache.set(name, { version: loaded.version, template });
    return template;
  }

  // Prepares a request for repeated rendering.
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender {
    const name = typeof target === 'string' ? target : target.name;
    return internalBoundary(name, () => this.prepareBound(name, target, assign, options));
  }

  private prepareBound(name: string, target: string | Template, assign: unknown, options: RenderOptions): PreparedRender {
    let rootData: MapValue;
    let registry: Map<string, DefineEntry>;
    let env: Env;
    try {
      rootData = bindMap(assign);
      registry = this.bindDefines(options.define ?? {});
      env = this.bindEnv(options.env ?? {});
    } catch (error) {
      if (error instanceof BindError) {
        throw new TemplateError({ code: error.code, template: name, line: 0, col: 0, offset: 0, end: 0, message: error.message });
      }
      throw error;
    }
    const targetEntry = typeof target === 'string' ? registry.get(target) : undefined;
    const targetName = targetEntry && 'template' in targetEntry ? targetEntry.template : name;
    const template = typeof target === 'string' ? this.loadTemplate(targetName, null, null) : { ast: target, lines: null };
    return new AstPreparedRender(name, new AstPreparedExecution(this, rootData, registry, env, targetName, template));
  }

  // Renders a template name or a parsed template and returns the complete output (RT-3). It
  // raises a TemplateError and returns no partial output when the render fails (RT-36).
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string {
    return this.prepare(target, assign, options).render();
  }

  private bindDefines(defines: Record<string, DefineInput>): Map<string, DefineEntry> {
    const registry = new Map<string, DefineEntry>();
    for (const [id, input] of Object.entries(defines)) {
      checkText(id);
      if (typeof input !== 'string' && typeof input.html === 'string') {
        registry.set(id, { html: input.html });
      } else if (typeof input === 'string' || typeof input.template === 'string') {
        const template = typeof input === 'string' ? input : input.template as string;
        let name: string;
        try {
          name = resolvePath('', template);
        } catch (error) {
          if (error instanceof PathError) throw new BindError('E_DATA_UNSUPPORTED_TYPE', `define ${id}: ${error.message}`);
          throw error;
        }
        const data = typeof input === 'string' || input.data === undefined ? null : bindData(input.data);
        if (data !== null && !(data instanceof Map)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', `define ${id}: data is not a map`);
        registry.set(id, { template: name, data });
      } else {
        throw new BindError('E_DATA_UNSUPPORTED_TYPE', `define ${id}: entry needs "template" or "html"`);
      }
    }
    return registry;
  }

  private bindEnv(env: Partial<Env>): Env {
    const timezone = env.timezone ?? 'Z';
    const now = env.now ?? Math.floor(Date.now() / 1000);
    if (typeof timezone !== 'string') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string');
    if (typeof now !== 'number') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number');
    return { timezone, now };
  }
}

export type { Value };
