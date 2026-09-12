// Generated.
import { Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, bind, bindMap, type MapValue, type PreparedRender, type Program, type RenderOptions, type Template, type Value } from '@polyspec/template';
export interface Page {
  title: string;
}
export interface Assign {
  page: Page;
  root_label: string;
  defined_label: string;
}
export interface Input_content_tpl { title: string; root_label: string; defined_label: string; layout_local?: string; }
export interface Input_layout_tpl {  }
export type DefinitionData<T> = Partial<T>;
export interface Definition<T> { html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Input_content_tpl>; layout?: Definition<Input_layout_tpl>; }
export interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }
type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };
const generatedRecords = {"Page":{"title":{"kind":"string","optional":false}}} as const;
const generatedAssign = {"page":{"kind":"record","name":"Page","optional":false},"root_label":{"kind":"string","optional":false},"defined_label":{"kind":"string","optional":false}} as const;
const generatedDefinitionSpecs = {"content":{"field":"content","target":"content.tpl","html":true,"input":{"title":{"kind":"string","optional":false},"root_label":{"kind":"string","optional":false},"defined_label":{"kind":"string","optional":false},"layout_local":{"kind":"string","optional":true}}},"layout":{"field":"layout","target":"layout.tpl","html":false,"input":{}}} as const;
function generatedObject(value: unknown, path: string): Map<string, unknown> { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }
function generatedBindType(value: unknown, type: GeneratedType, path: string): unknown { if (value === null || value === undefined) { if (type.optional || type.kind === 'null' || type.kind === 'any') return null; throw new Error(path + ' is required'); } if (type.kind === 'any') return value; if (type.kind === 'null') { if (value !== null) throw new Error(path + ' is not null'); return null; } if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') { if (typeof value !== type.kind) throw new Error(path + ' is not a ' + type.kind); return value; } if (type.kind === 'list') { if (!Array.isArray(value)) throw new Error(path + ' is not a list'); return value.map((item, index) => generatedBindType(item, type.item as GeneratedType, path + '[' + index + ']')); } if (type.kind === 'map') { const object = generatedObject(value, path); return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key as GeneratedType, path + '.key'), generatedBindType(item, type.value as GeneratedType, path + '.' + key)])); } if (type.kind === 'record') return generatedBindRecord(value, generatedRecords[type.name as keyof typeof generatedRecords] as Record<string, GeneratedType>, path); throw new Error(path + ' has an unknown generated type'); }
function generatedBindRecord(value: unknown, fields: Record<string, GeneratedType>, path: string, partial = false): Record<string, unknown> { const object = generatedObject(value, path); const result: Record<string, unknown> = {}; for (const [name, type] of Object.entries(fields)) { if (!object.has(name)) { if (!partial && !type.optional) throw new Error(path + '.' + name + ' is required'); if (!partial) result[name] = null; continue; } result[name] = generatedBindType(object.get(name), type, path + '.' + name); } return result; }
function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: generatedBindRecord(root, generatedAssign as Record<string, GeneratedType>, 'assign') as unknown as Assign, root }; }
type GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, { target: string | null; html?: string }> };
function generatedBindDefinitions(input: RenderOptions['define']): GeneratedBoundDefinitions { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions: Record<string, unknown> = {}; const targets = new Map<string, { target: string | null; html?: string }>(); for (const [id, raw] of object) { const spec = (generatedDefinitionSpecs as Record<string, { field: string; target: string | null; html: boolean; input: Record<string, GeneratedType> }>)[id]; if (spec === undefined) throw new Error('define.' + id + ' is not declared'); if (typeof raw === 'string') { if (spec.target === null || raw !== spec.target) throw new Error('define.' + id + ' has an invalid template'); definitions[spec.field] = {}; targets.set(id, { target: spec.target }); continue; } const entry = generatedObject(raw, 'define.' + id); const template = entry.get('template'); const html = entry.get('html'); const data = entry.get('data'); if (typeof html === 'string') { if (!spec.html || template !== undefined || data !== undefined) throw new Error('define.' + id + ' has an invalid html entry'); definitions[spec.field] = { html }; targets.set(id, { target: null, html }); continue; } if (typeof template !== 'string' || spec.target === null || template !== spec.target) throw new Error('define.' + id + ' has an invalid template'); const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true); definitions[spec.field] = { data: boundData }; targets.set(id, { target: spec.target }); } return { definitions: definitions as Definitions, targets }; }
function render_content_tpl(assign: Assign, definitions: Definitions, input: Input_content_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue): void {
  const frame = new Frame("content.tpl", [0,10,29,64,105,164,175], rootData);
  const title = input.title;
  const root_label = input.root_label;
  const defined_label = input.defined_label;
  const layout_local = input.layout_local ?? null;
    context.at(frame, [0,14]); context.output.write("<article>\n<h1>");
    context.at(frame, [14,23]); context.output.write(runtime.escape(title as unknown as Value, frame, [17,22]));
    context.at(frame, [23,45]); context.output.write("</h1>\n<p class=\"root\">");
    context.at(frame, [45,59]); context.output.write(runtime.escape(root_label as unknown as Value, frame, [48,58]));
    context.at(frame, [59,83]); context.output.write("</p>\n<p class=\"defined\">");
    context.at(frame, [83,100]); context.output.write(runtime.escape(defined_label as unknown as Value, frame, [86,99]));
    context.at(frame, [100,122]); context.output.write("</p>\n<p class=\"local\">");
    context.at(frame, [122,159]); context.output.write(runtime.escape(runtime.call("default", [layout_local, "missing"] as unknown as Value[], frame, [125,158]) as unknown as Value, frame, [125,158]));
    context.at(frame, [159,175]); context.output.write("</p>\n</article>\n");
}
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue): void {
  const frame = new Frame("layout.tpl", [0,42,66,95,106], rootData);

    const layout_local = "visible only in layout";
    context.at(frame, [42,66]); context.output.write("<section class=\"scope\">\n");
    { const definition = definitions.content;
    if (definition === undefined) throw runtime.error(frame, [66,94], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
    if (definition?.html !== undefined) { context.at(frame, [66,94]); context.output.write(definition.html); }
    else { const input = Object.assign({ root_label: assign.root_label, defined_label: assign.defined_label }, definition?.data ?? {}, { title: assign.page?.title }) as Input_content_tpl; context.enter("content.tpl", frame, [66,94]); try { render_content_tpl(assign, definitions, input, context, runtime, rootData); } finally { context.leave(); } }
    }
    context.at(frame, [95,106]); context.output.write("</section>\n");
}
function renderTemplate(target: string, assign: Assign, definitions: Definitions, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue): void {
  switch (target) {
    case "layout.tpl": render_layout_tpl(assign, definitions, {}, context, runtime, rootData); return;
    default: throw context.fail('E_LOAD_NOT_FOUND', null, null, 'template ' + target + ' does not exist');
  }
}
function generatedEnv(input: RenderOptions['env']): { timezone: string; now: number } { const timezone = input?.timezone ?? 'Z'; const now = input?.now ?? Math.floor(Date.now() / 1000); if (typeof timezone !== 'string') throw new Error('env.timezone is not a string'); if (typeof now !== 'number') throw new Error('env.now is not a number'); return { timezone, now }; }
class GeneratedPreparedRender implements PreparedRender { private readonly execute: () => string; constructor(execute: () => string) { this.execute = execute; } render(): string { return this.execute(); } }
export class GeneratedProgram implements Program {
  readonly runtime: RuntimeEnvironment;
  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); const boundAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined) return new GeneratedPreparedRender(() => registered.html as string); const targetName = registered?.target ?? target; const env = generatedEnv(options.env); return new GeneratedPreparedRender(() => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); context.enter(targetName, null, null); try { renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root); return context.output.toString(); } finally { context.leave(); } }); }
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }
}
