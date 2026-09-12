// Engine: template loading, caching, function registration and rendering (RT-1 to RT-6, RT-40, RT-41).
import type { Template } from '../ast.js';
import { errorAt, TemplateError, type Span } from '../errors.js';
import { builtins, type BuiltIn, type Env, type HostFunction } from '../functions/index.js';
import { MapLoader, resolvePath, type Loader, type LoadResult, PathError } from '../loader.js';
import { DEFAULT_DELIMITERS, parseDelimiters, type Delimiters } from '../parser/scanner.js';
import { BindError, bind, bindMap } from '../value/bind.js';
import type { MapValue, Value } from '../value/value.js';
import { DEFAULT_LIMITS, Frame, RenderContext, type DefineEntry, type EngineServices, type Limits, type ParsedTemplate } from './context.js';
import { Renderer } from './statements.js';

export type ParseFunction = (source: string | Uint8Array, name: string, delimiters: Delimiters, legacyWrappers?: boolean) => ParsedTemplate;

// Controls when a compiled template artifact is refreshed.
export type ArtifactRefresh = 'dev' | 'true' | 'false';
/** Selects AST interpretation or a generated renderer. */
export type CompileMode = 'ast' | 'gen';
/** A prepared request produced by generated host-language code. */
export interface GeneratedPreparedRender { render(): string; }
/** The normalized request shared by AST and generated renderers. */
export interface GeneratedRequest {
  target: string | Template;
  targetName: string;
  rootData: MapValue;
  registry: Map<string, DefineEntry>;
  env: Env;
}
/** Prepares a normalized request with generated host-language code. */
export type GeneratedRenderer = (request: GeneratedRequest) => GeneratedPreparedRender;
/** Compilation settings shared by the runtime contract. */
export interface CompileOptions { mode?: CompileMode; generatedRenderer?: GeneratedRenderer; }

// What an engine is created with (RT-1, RT-5, RT-6, RT-42). Every field has a default.
export interface EngineOptions {
  loader?: Loader;
  functions?: Record<string, HostFunction>;
  limits?: Partial<Limits>;
  delimiters?: string;
  legacyWrappers?: boolean;
  // Parser used for sources returned by the loader; absent in the render-only build.
  parse?: ParseFunction;
  // dev parses on every load, true refreshes when the loader version changes,
  // false keeps the first loaded artifact for the lifetime of the engine.
  artifactRefresh?: ArtifactRefresh;
  compile?: CompileOptions;
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

interface PreparedExecution { render(): string; }

class GeneratedPreparedExecution implements PreparedExecution {
  constructor(private readonly generated: GeneratedPreparedRender) {}

  render(): string { return this.generated.render(); }
}

class AstPreparedExecution implements PreparedExecution {
  constructor(
    private readonly engine: EngineCore,
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
    new Renderer(context).renderNodes(this.template.ast.body, new Frame(this.template, this.rootData));
    return context.output.toString();
  }
}

// A prepared request owns exactly one AST or generated execution.
export class PreparedRender {
  /** Creates a prepared request from one explicit execution variant. */
  constructor(private readonly execution: PreparedExecution) {}

  // Renders the prepared request with fresh execution state.
  render(): string { return this.execution.render(); }
}

// An engine that renders parsed templates. It holds the loader, the host functions, the limits
// and the parse cache (RT-1, RT-40). The entry point of the package extends it with the parser.
export class EngineCore implements EngineServices {
  readonly loader: Loader;
  readonly functions = new Map<string, HostFunction>();
  readonly builtins: ReadonlyMap<string, BuiltIn> = builtins;
  readonly limits: Limits;
  readonly delimiters: Delimiters;
  private readonly parseFunction: ParseFunction | null;
  private readonly legacyWrappers: boolean;
  readonly artifactRefresh: ArtifactRefresh;
  readonly compileMode: CompileMode;
  private readonly generatedRenderer: GeneratedRenderer | null;
  private readonly cache = new Map<string, { version: string; template: ParsedTemplate }>();

  // Creates an engine. An unknown delimiter pair raises an error here, before any render.
  constructor(options: EngineOptions = {}) {
    this.loader = options.loader ?? new MapLoader();
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.parseFunction = options.parse ?? null;
    this.legacyWrappers = options.legacyWrappers === true;
    this.artifactRefresh = options.artifactRefresh ?? 'true';
    this.compileMode = options.compile?.mode ?? 'ast';
    if (this.compileMode !== 'ast' && this.compileMode !== 'gen') throw new Error(`${this.compileMode} is not a compile mode`);
    this.generatedRenderer = options.compile?.generatedRenderer ?? null;
    if (options.delimiters !== undefined) {
      const delimiters = parseDelimiters(options.delimiters);
      if (delimiters === null) throw new Error(`${JSON.stringify(options.delimiters)} is not a delimiter pair`);
      this.delimiters = delimiters;
    } else {
      this.delimiters = DEFAULT_DELIMITERS;
    }
    for (const [name, fn] of Object.entries(options.functions ?? {})) this.register(name, fn);
  }

  // FUN-43, FUN-44.
  register(name: string, fn: HostFunction): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`${JSON.stringify(name)} is not an identifier`);
    if (this.builtins.has(name)) throw new Error(`${name} is a built-in function`);
    this.functions.set(name, fn);
  }

  // RT-9, RT-40: loads a template by name through the loader and caches it by version.
  loadTemplate(name: string, from: Frame | null, span: Span | null): ParsedTemplate {
    const loaded: LoadResult | null = this.loader.load(name);
    if (loaded === null) {
      const template = from ? from.name : name;
      const message = `template ${name} does not exist`;
      if (from && span) throw errorAt('E_LOAD_NOT_FOUND', template, from.template.lines, span, message);
      throw new TemplateError({ code: 'E_LOAD_NOT_FOUND', template: name, line: 0, col: 0, offset: 0, end: 0, message });
    }
    const cached = this.cache.get(name);
    if (this.artifactRefresh === 'false' && cached) return cached.template;
    if (this.artifactRefresh === 'true' && cached && cached.version === loaded.version) return cached.template;
    let template: ParsedTemplate;
    if ('ast' in loaded) {
      template = { ast: loaded.ast, lines: null };
    } else {
      if (!this.parseFunction) throw new Error('this build renders parsed templates only; the loader returned source text');
      template = this.parseFunction(loaded.source, name, this.delimiters, this.legacyWrappers);
    }
    this.cache.set(name, { version: loaded.version, template });
    return template;
  }

  // Prepares a request for repeated rendering.
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender {
    const name = typeof target === 'string' ? target : target.name;
    let rootData: MapValue;
    let registry: Map<string, DefineEntry>;
    let env: Env;
    try {
      rootData = bindMap(assign ?? new Map());
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
    if (this.compileMode === 'gen') {
      if (!this.generatedRenderer) throw new Error('generated compile mode requires generatedRenderer');
      return new PreparedRender(new GeneratedPreparedExecution(this.generatedRenderer({ target, targetName, rootData, registry, env })));
    }
    const template = typeof target === 'string' ? this.loadTemplate(targetName, null, null) : { ast: target, lines: null };
    return new PreparedRender(new AstPreparedExecution(this, rootData, registry, env, targetName, template));
  }

  // Renders a template name or a parsed template and returns the complete output (RT-3). It
  // raises a TemplateError and returns no partial output when the render fails (RT-36).
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string {
    return this.prepare(target, assign, options).render();
  }

  private bindDefines(defines: Record<string, DefineInput>): Map<string, DefineEntry> {
    const registry = new Map<string, DefineEntry>();
    for (const [id, input] of Object.entries(defines)) {
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
        const data = typeof input === 'string' || input.data === undefined ? null : bind(input.data);
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
