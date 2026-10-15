// Generated.
import { BindError, Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, TemplateError, bindData, bindMap, checkText, internalBoundary, type MapValue, type PreparedRender, type Program, type RenderOptions, type Template, type Value } from '@polyspec/template';

export interface Assign {
  page: string;
}
export interface Input_layout_tpl {  }
export type DefinitionData<T> = Partial<T>;
export interface Definition<T> { template?: string; html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Record<never, never>>; layout?: Definition<Input_layout_tpl>; }
export interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }
function generatedTypeError(value: Value | undefined, path: string, expected: string): Error { return new Error(value === null || value === undefined ? path + ' is required' : path + ' is not ' + expected); }
function generatedDataObject(value: Value, path: string): MapValue { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }
function generatedPlain(value: unknown): value is object { if (typeof value !== 'object' || value === null) return false; const prototype = Reflect.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function generatedObject(value: Value | undefined, path: string): MapValue { if (value instanceof Map) return value; throw generatedTypeError(value, path, 'an object'); }
function generatedString(value: Value | undefined, path: string): string { if (typeof value === 'string') return value; throw generatedTypeError(value, path, 'a string'); }
function generatedDecodeAssign(value: Value | undefined, path: string): Assign { const object = generatedObject(value, path); return { page: generatedString(object.get("page"), path + ".page") }; }
function generatedDecodeData_Input_layout_tpl(value: Value, path: string): DefinitionData<Input_layout_tpl> { generatedDataObject(value, path); return {}; }
function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: generatedDecodeAssign(root, 'assign'), root }; }
type GeneratedTarget = { target: string | null; html?: string };
type GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, GeneratedTarget> };
function generatedBindDefinitions(input: unknown): GeneratedBoundDefinitions {
  const definitions: Definitions = {};
  const targets = new Map<string, GeneratedTarget>();
  if (input === undefined || input === null) return { definitions, targets };
  if (!generatedPlain(input)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'define is not an object');
  const entries: [string, unknown][] = Object.entries(input);
  for (const [id, raw] of entries) {
    checkText(id);
    switch (id) {
    case "content": {
      if (typeof raw === 'string') {
        throw new Error("define.content has an invalid template");
      }
      if (typeof raw !== 'object' || raw === null) throw new Error("define.content is not an object");
      const template = 'template' in raw ? raw.template : undefined;
      const html = 'html' in raw ? raw.html : undefined;
      const data = 'data' in raw && raw.data !== undefined ? bindData(raw.data) : undefined;
      if (typeof html === 'string') {
        if (template !== undefined || data !== undefined) throw new Error("define.content has an invalid html entry");
        definitions.content = { html }; targets.set("content", { target: null, html }); break;
      }
      throw new Error("define.content has an invalid template");
    }
    case "layout": {
      if (typeof raw === 'string') {
        if (raw !== "layout.tpl") throw new Error("define.layout has an invalid template");
        definitions.layout = { template: "layout.tpl" }; targets.set("layout", { target: "layout.tpl" }); break;
      }
      if (typeof raw !== 'object' || raw === null) throw new Error("define.layout is not an object");
      const template = 'template' in raw ? raw.template : undefined;
      const html = 'html' in raw ? raw.html : undefined;
      const data = 'data' in raw && raw.data !== undefined ? bindData(raw.data) : undefined;
      if (typeof html === 'string') {
        throw new Error("define.layout has an invalid html entry");
      }
      if (template !== "layout.tpl") throw new Error("define.layout has an invalid template");
      definitions.layout = { template: "layout.tpl", data: data === undefined ? {} : generatedDecodeData_Input_layout_tpl(data, "define.layout.data") }; targets.set("layout", { target: "layout.tpl" }); break;
    }
    default: throw new Error('define.' + id + ' is not declared');
    }
  }
  return { definitions, targets };
}
function render_layout_tpl(_assign: Assign, definitions: Definitions, _input: Input_layout_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, _scope: Scope): void {
  const frame = new Frame("layout.tpl", [0,26,39,51,55,99,103,111], rootData);

    context.at(frame, [0,26]); context.output.write("<main class=\"empty-page\">\n");
    if (definitions.content !== undefined) {
        { const definition = definitions.content;
        if (definition?.html === undefined) throw runtime.error(frame, [39,50], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
        context.at(frame, [39,50]); context.output.write(definition.html);
        }
    } else {
        context.at(frame, [55,99]); context.output.write("<p class=\"empty\">No content definition.</p>\n");
    }
    context.at(frame, [103,111]); context.output.write("</main>\n");
}
function renderTemplate(target: string, assign: Assign, definitions: Definitions, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  switch (target) {
    case "layout.tpl": render_layout_tpl(assign, definitions, {}, context, runtime, rootData, scope); return;
    default: throw context.fail('E_LOAD_NOT_FOUND', null, null, 'template ' + target + ' does not exist');
  }
}
function generatedEnv(input: unknown): { timezone: string; now: number } { if (input === undefined || input === null) return { timezone: 'Z', now: Math.floor(Date.now() / 1000) }; if (!generatedPlain(input)) throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env is not an object'); const timezone = ('timezone' in input ? input.timezone : undefined) ?? 'Z'; const now = ('now' in input ? input.now : undefined) ?? Math.floor(Date.now() / 1000); if (typeof timezone !== 'string') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.timezone is not a string'); if (typeof now !== 'number') throw new BindError('E_DATA_UNSUPPORTED_TYPE', 'env.now is not a number'); return { timezone, now }; }
class GeneratedPreparedRender implements PreparedRender { private readonly name: string; private readonly execute: () => string; constructor(name: string, execute: () => string) { this.name = name; this.execute = execute; } render(): string { return internalBoundary(this.name, this.execute); } }
export class GeneratedProgram implements Program {
  readonly runtime: RuntimeEnvironment;
  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); return internalBoundary(target, () => this.prepareBound(target, assign, options)); }
  private prepareBound(target: string, assign: unknown, options: RenderOptions): PreparedRender { let boundAssign: { assign: Assign; root: MapValue }; let bound: GeneratedBoundDefinitions; let env: { timezone: string; now: number }; try { boundAssign = generatedBindAssign(assign); bound = generatedBindDefinitions(options.define); env = generatedEnv(options.env); } catch (error) { if (error instanceof BindError) throw new TemplateError({ code: error.code, template: target, line: 0, col: 0, offset: 0, end: 0, message: error.message }); throw error; } const registered = bound.targets.get(target); const html = registered?.html; if (html !== undefined) return new GeneratedPreparedRender(target, () => html); const targetName = registered?.target ?? target; return new GeneratedPreparedRender(target, () => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); const scope = new Scope(); context.enter(targetName, null, null); try { renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root, scope); return context.output.toString(); } finally { context.leave(); } }); }
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }
}
