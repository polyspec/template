// Generated.
import { Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, bind, bindMap, type MapValue, type PreparedRender, type Program, type RenderOptions, type Template, type Value } from '@polyspec/template';
export interface Page {
  title?: string;
}
export interface Slot {
  template?: string;
  html?: string;
}
export interface Assign {
  title?: string;
  heading?: string;
  island_label?: string;
  root_label?: string;
  defined_label?: string;
  page?: Page;
}
export interface Input_content_tpl {  }
export interface Input_layout_tpl {  }
export type DefinitionData<T> = Partial<T>;
export interface Definition<T> { template?: string; html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Input_content_tpl>; layout?: Definition<Input_layout_tpl>; }
export interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }
type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };
const generatedRecords = {"Page":{"title":{"kind":"string","optional":true}},"Slot":{"template":{"kind":"string","optional":true},"html":{"kind":"string","optional":true}}} as const;
const generatedAssign = {"title":{"kind":"string","optional":true},"heading":{"kind":"string","optional":true},"island_label":{"kind":"string","optional":true},"root_label":{"kind":"string","optional":true},"defined_label":{"kind":"string","optional":true},"page":{"kind":"record","name":"Page","optional":true}} as const;
const generatedDefinitionSpecs = {"content":{"field":"content","target":"content.tpl","html":true,"input":{}},"layout":{"field":"layout","target":"layout.tpl","html":false,"input":{}}} as const;
function generatedObject(value: unknown, path: string): Map<string, unknown> { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }
function generatedBindType(value: unknown, type: GeneratedType, path: string): unknown { if (value === null || value === undefined) { if (type.optional || type.kind === 'null' || type.kind === 'any') return null; throw new Error(path + ' is required'); } if (type.kind === 'any') return value; if (type.kind === 'null') { if (value !== null) throw new Error(path + ' is not null'); return null; } if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') { if (typeof value !== type.kind) throw new Error(path + ' is not a ' + type.kind); return value; } if (type.kind === 'list') { if (!Array.isArray(value)) throw new Error(path + ' is not a list'); return value.map((item, index) => generatedBindType(item, type.item as GeneratedType, path + '[' + index + ']')); } if (type.kind === 'map') { const object = generatedObject(value, path); return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key as GeneratedType, path + '.key'), generatedBindType(item, type.value as GeneratedType, path + '.' + key)])); } if (type.kind === 'record') return generatedBindRecord(value, generatedRecords[type.name as keyof typeof generatedRecords] as Record<string, GeneratedType>, path); throw new Error(path + ' has an unknown generated type'); }
function generatedBindRecord(value: unknown, fields: Record<string, GeneratedType>, path: string, partial = false): Record<string, unknown> { const object = generatedObject(value, path); const result: Record<string, unknown> = {}; for (const [name, type] of Object.entries(fields)) { if (!object.has(name)) { if (!partial && !type.optional) throw new Error(path + '.' + name + ' is required'); if (!partial) result[name] = null; continue; } result[name] = generatedBindType(object.get(name), type, path + '.' + name); } return result; }
function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: generatedBindRecord(root, generatedAssign as Record<string, GeneratedType>, 'assign') as unknown as Assign, root }; }
type GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, { target: string | null; html?: string }> };
function generatedBindDefinitions(input: RenderOptions['define']): GeneratedBoundDefinitions { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions: Record<string, unknown> = {}; const targets = new Map<string, { target: string | null; html?: string }>(); for (const [id, raw] of object) { const spec = (generatedDefinitionSpecs as Record<string, { field: string; target: string | null; html: boolean; input: Record<string, GeneratedType> }>)[id]; if (spec === undefined) throw new Error('define.' + id + ' is not declared'); if (typeof raw === 'string') { if (spec.target === null || raw !== spec.target) throw new Error('define.' + id + ' has an invalid template'); definitions[spec.field] = { template: spec.target }; targets.set(id, { target: spec.target }); continue; } const entry = generatedObject(raw, 'define.' + id); const template = entry.get('template'); const html = entry.get('html'); const data = entry.get('data'); if (typeof html === 'string') { if (!spec.html || template !== undefined || data !== undefined) throw new Error('define.' + id + ' has an invalid html entry'); definitions[spec.field] = { html }; targets.set(id, { target: null, html }); continue; } if (typeof template !== 'string' || spec.target === null || template !== spec.target) throw new Error('define.' + id + ' has an invalid template'); const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true); definitions[spec.field] = { template: spec.target, data: boundData }; targets.set(id, { target: spec.target }); } return { definitions: definitions as Definitions, targets }; }
function render_content_tpl(assign: Assign, definitions: Definitions, input: Input_content_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("content.tpl", [0,41,65,76], rootData);

    context.at(frame, [0,44]); context.output.write("<section data-react-island id=\"counter\">\n<p>");
    context.at(frame, [44,60]); context.output.write(runtime.escape(assign.island_label as unknown as Value, frame, [47,59]));
    context.at(frame, [60,76]); context.output.write("</p>\n</section>\n");
}
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("layout.tpl", [0,7,26,38,46], rootData);

    context.at(frame, [0,11]); context.output.write("<main>\n<h1>");
    context.at(frame, [11,20]); context.output.write(runtime.escape(assign.title as unknown as Value, frame, [14,19]));
    context.at(frame, [20,26]); context.output.write("</h1>\n");
    { let definition = definitions.content;
    if (definition === undefined) throw runtime.error(frame, [26,37], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
    if (definition?.html !== undefined) { context.at(frame, [26,37]); context.output.write(definition.html); }
    else { const input = Object.assign({  }, definition?.data ?? {}, {  }) as Input_content_tpl; const blockScope = new Scope(); context.enter("content.tpl", frame, [26,37]); try { render_content_tpl(assign, definitions, input, context, runtime, rootData, blockScope); } finally { context.leave(); } }
    }
    context.at(frame, [38,46]); context.output.write("</main>\n");
}
function renderTemplate(target: string, assign: Assign, definitions: Definitions, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  switch (target) {
    case "content.tpl": render_content_tpl(assign, definitions, {}, context, runtime, rootData, scope); return;
    case "layout.tpl": render_layout_tpl(assign, definitions, {}, context, runtime, rootData, scope); return;
    default: throw context.fail('E_LOAD_NOT_FOUND', null, null, 'template ' + target + ' does not exist');
  }
}
function generatedEnv(input: RenderOptions['env']): { timezone: string; now: number } { const timezone = input?.timezone ?? 'Z'; const now = input?.now ?? Math.floor(Date.now() / 1000); if (typeof timezone !== 'string') throw new Error('env.timezone is not a string'); if (typeof now !== 'number') throw new Error('env.now is not a number'); return { timezone, now }; }
class GeneratedPreparedRender implements PreparedRender { private readonly execute: () => string; constructor(execute: () => string) { this.execute = execute; } render(): string { return this.execute(); } }
export class GeneratedProgram implements Program {
  readonly runtime: RuntimeEnvironment;
  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); const boundAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined) return new GeneratedPreparedRender(() => registered.html as string); const targetName = registered?.target ?? target; const env = generatedEnv(options.env); return new GeneratedPreparedRender(() => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); const scope = new Scope(); context.enter(targetName, null, null); try { renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root, scope); return context.output.toString(); } finally { context.leave(); } }); }
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }
}
