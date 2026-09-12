// Generated.
import { Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, bind, bindMap, type MapValue, type PreparedRender, type Program, type RenderOptions, type Template, type Value } from '@polyspec/template';
export interface Page {
  title: string;
}
export interface Row {
  name: string;
}
export interface Slot {
  template?: string;
  html?: string;
}
export interface Assign {
  flag: boolean;
  dangerous: string;
  empty_list: Array<string>;
  empty_map: Map<string, string>;
  page: Page;
  numbers: Array<number>;
  lookup: Map<string, string>;
  rows: Array<Row>;
}
export interface Input_card_tpl { label: string; }
export interface Input_layout_tpl {  }
export interface Input_partial_tpl { values: Array<number>; }
export type DefinitionData<T> = Partial<T>;
export interface Definition<T> { template?: string; html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Input_card_tpl>; layout?: Definition<Input_layout_tpl>; }
export interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }
type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };
const generatedRecords = {"Page":{"title":{"kind":"string","optional":false}},"Row":{"name":{"kind":"string","optional":false}},"Slot":{"template":{"kind":"string","optional":true},"html":{"kind":"string","optional":true}}} as const;
const generatedAssign = {"flag":{"kind":"boolean","optional":false},"dangerous":{"kind":"string","optional":false},"empty_list":{"kind":"list","item":{"kind":"string","optional":false},"optional":false},"empty_map":{"kind":"map","key":{"kind":"string","optional":false},"value":{"kind":"string","optional":false},"optional":false},"page":{"kind":"record","name":"Page","optional":false},"numbers":{"kind":"list","item":{"kind":"number","optional":false},"optional":false},"lookup":{"kind":"map","key":{"kind":"string","optional":false},"value":{"kind":"string","optional":false},"optional":false},"rows":{"kind":"list","item":{"kind":"record","name":"Row","optional":false},"optional":false}} as const;
const generatedDefinitionSpecs = {"content":{"field":"content","target":"card.tpl","html":true,"input":{"label":{"kind":"string","optional":false}}},"layout":{"field":"layout","target":"layout.tpl","html":false,"input":{}}} as const;
function generatedObject(value: unknown, path: string): Map<string, unknown> { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }
function generatedBindType(value: unknown, type: GeneratedType, path: string): unknown { if (value === null || value === undefined) { if (type.optional || type.kind === 'null' || type.kind === 'any') return null; throw new Error(path + ' is required'); } if (type.kind === 'any') return value; if (type.kind === 'null') { if (value !== null) throw new Error(path + ' is not null'); return null; } if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') { if (typeof value !== type.kind) throw new Error(path + ' is not a ' + type.kind); return value; } if (type.kind === 'list') { if (!Array.isArray(value)) throw new Error(path + ' is not a list'); return value.map((item, index) => generatedBindType(item, type.item as GeneratedType, path + '[' + index + ']')); } if (type.kind === 'map') { const object = generatedObject(value, path); return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key as GeneratedType, path + '.key'), generatedBindType(item, type.value as GeneratedType, path + '.' + key)])); } if (type.kind === 'record') return generatedBindRecord(value, generatedRecords[type.name as keyof typeof generatedRecords] as Record<string, GeneratedType>, path); throw new Error(path + ' has an unknown generated type'); }
function generatedBindRecord(value: unknown, fields: Record<string, GeneratedType>, path: string, partial = false): Record<string, unknown> { const object = generatedObject(value, path); const result: Record<string, unknown> = {}; for (const [name, type] of Object.entries(fields)) { if (!object.has(name)) { if (!partial && !type.optional) throw new Error(path + '.' + name + ' is required'); if (!partial) result[name] = null; continue; } result[name] = generatedBindType(object.get(name), type, path + '.' + name); } return result; }
function generatedBindAssign(value: unknown): { assign: Assign; root: MapValue } { const root = bindMap(value); return { assign: generatedBindRecord(root, generatedAssign as Record<string, GeneratedType>, 'assign') as unknown as Assign, root }; }
type GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, { target: string | null; html?: string }> };
function generatedBindDefinitions(input: RenderOptions['define']): GeneratedBoundDefinitions { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions: Record<string, unknown> = {}; const targets = new Map<string, { target: string | null; html?: string }>(); for (const [id, raw] of object) { const spec = (generatedDefinitionSpecs as Record<string, { field: string; target: string | null; html: boolean; input: Record<string, GeneratedType> }>)[id]; if (spec === undefined) throw new Error('define.' + id + ' is not declared'); if (typeof raw === 'string') { if (spec.target === null || raw !== spec.target) throw new Error('define.' + id + ' has an invalid template'); definitions[spec.field] = { template: spec.target }; targets.set(id, { target: spec.target }); continue; } const entry = generatedObject(raw, 'define.' + id); const template = entry.get('template'); const html = entry.get('html'); const data = entry.get('data'); if (typeof html === 'string') { if (!spec.html || template !== undefined || data !== undefined) throw new Error('define.' + id + ' has an invalid html entry'); definitions[spec.field] = { html }; targets.set(id, { target: null, html }); continue; } if (typeof template !== 'string' || spec.target === null || template !== spec.target) throw new Error('define.' + id + ' has an invalid template'); const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true); definitions[spec.field] = { template: spec.target, data: boundData }; targets.set(id, { target: spec.target }); } return { definitions: definitions as Definitions, targets }; }
function render_card_tpl(assign: Assign, definitions: Definitions, input: Input_card_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("card.tpl", [0,30], rootData);
  scope.locals.set("label", input.label as unknown as Value);
    context.at(frame, [0,16]); context.output.write("<p class=\"card\">");
    context.at(frame, [16,25]); context.output.write(runtime.escape(scope.lookup(frame, "label") as unknown as string as unknown as Value, frame, [19,24]));
    context.at(frame, [25,30]); context.output.write("</p>\n");
}
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("layout.tpl", [0,29,66,76,100,137,191,268,305,392,463,468,483,563,567,582,586,592,608,655,684,695], rootData);

    scope.locals.set("values", [0, ...(runtime.listSpread(assign.numbers as unknown as Value, frame, [16,26]) as unknown as Array<number>)] as unknown as Value);
    scope.locals.set("merged", new Map([...(runtime.mapSpread(assign.lookup as unknown as Value, frame, [42,51]) as unknown as Map<string, string>), [runtime.stringify("z" as unknown as Value, frame, [53,56]), "Z"]]) as unknown as Value);
    context.at(frame, [66,80]); context.output.write("<section>\n<h1>");
    context.at(frame, [80,94]); context.output.write(runtime.escape((assign.page)?.title as unknown as Value, frame, [83,93]));
    context.at(frame, [94,119]); context.output.write("</h1>\n<p class=\"escaped\">");
    context.at(frame, [119,132]); context.output.write(runtime.escape(assign.dangerous as unknown as Value, frame, [122,131]));
    context.at(frame, [132,156]); context.output.write("</p>\n<p class=\"logical\">");
    context.at(frame, [156,171]); context.output.write(runtime.escape((() => { const left = assign.flag; return runtime.truthy(left as unknown as Value) ? runtime.truthy("x" as unknown as Value) : false; })() as unknown as Value, frame, [159,170]));
    context.at(frame, [171,172]); context.output.write("|");
    context.at(frame, [172,186]); context.output.write(runtime.escape((() => { const left = false; return runtime.truthy(left as unknown as Value) ? true : runtime.truthy(2 as unknown as Value); })() as unknown as Value, frame, [175,185]));
    context.at(frame, [186,219]); context.output.write("</p>\n<p class=\"empty-truthiness\">");
    context.at(frame, [219,241]); context.output.write(runtime.escape((() => { const left = assign.empty_list; return runtime.truthy(left as unknown as Value) ? runtime.truthy(assign.flag as unknown as Value) : false; })() as unknown as Value, frame, [222,240]));
    context.at(frame, [241,242]); context.output.write("|");
    context.at(frame, [242,263]); context.output.write(runtime.escape((() => { const left = assign.empty_map; return runtime.truthy(left as unknown as Value) ? runtime.truthy(assign.flag as unknown as Value) : false; })() as unknown as Value, frame, [245,262]));
    context.at(frame, [263,271]); context.output.write("</p>\n<p>");
    context.at(frame, [271,284]); context.output.write(runtime.escape(runtime.index(scope.lookup(frame, "values") as unknown as Array<number> as unknown as Value, 1 as unknown as Value) as unknown as Value, frame, [274,283]));
    context.at(frame, [284,285]); context.output.write("|");
    context.at(frame, [285,300]); context.output.write(runtime.escape(runtime.index(scope.lookup(frame, "merged") as unknown as Map<string, string> as unknown as Value, "z" as unknown as Value) as unknown as Value, frame, [288,299]));
    context.at(frame, [300,305]); context.output.write("</p>\n");
    if (runtime.truthy((() => { const left = assign.flag; return runtime.truthy(left as unknown as Value) ? runtime.truthy(runtime.binary("==", (assign.page)?.title as unknown as Value, "Guide" as unknown as Value, frame, [316,337]) as unknown as Value) : false; })() as unknown as Value)) {
        context.at(frame, [338,362]); context.output.write("<strong>matched</strong>");    } else {
        context.at(frame, [365,388]); context.output.write("<strong>missed</strong>");
    }
    context.at(frame, [391,395]); context.output.write("\n<p>");
    context.at(frame, [395,418]); context.output.write(runtime.escape((runtime.truthy(assign.flag as unknown as Value) ? "yes" : "no") as unknown as Value, frame, [398,417]));
    context.at(frame, [418,419]); context.output.write("|");
    context.at(frame, [419,429]); context.output.write(runtime.escape(runtime.binary("+", runtime.unary("-", 1 as unknown as Value, frame, [422,424]) as unknown as Value, 3 as unknown as Value, frame, [422,428]) as unknown as Value, frame, [422,428]));
    context.at(frame, [429,430]); context.output.write("|");
    context.at(frame, [430,458]); context.output.write(runtime.escape(runtime.call("default", ["", "fallback"] as unknown as Value[], frame, [433,457]) as unknown as Value, frame, [433,457]));
    context.at(frame, [458,468]); context.output.write("</p>\n<ul>\n");
    { const row_entries = runtime.entries(assign.rows as unknown as Value, frame, [468,585]);
    const row_size = row_entries.length; const row_last_index = row_size - 1;
    const row_had = scope.locals.has("row"); const row_previous = scope.locals.get("row");
    try {
    for (let row_index = 0; row_index < row_size; row_index += 1) {
        const [row_key, row_value] = row_entries[row_index]!;
        scope.locals.set("row", row_value);
        const row_first = row_index === 0;
        const row_last = row_index === row_last_index;
        context.iterations += 1;
        runtime.limit('iteration', context.iterations, frame, [468,585]);
            context.at(frame, [483,487]); context.output.write("<li>");
            context.at(frame, [487,501]); context.output.write(runtime.escape(row_index as unknown as Value, frame, [490,500]));
            context.at(frame, [501,502]); context.output.write("/");
            context.at(frame, [502,515]); context.output.write(runtime.escape(row_size as unknown as Value, frame, [505,514]));
            context.at(frame, [515,516]); context.output.write(":");
            context.at(frame, [516,528]); context.output.write(runtime.escape((scope.lookup(frame, "row") as unknown as Row)?.name as unknown as Value, frame, [519,527]));
            context.at(frame, [528,529]); context.output.write(":");
            context.at(frame, [529,543]); context.output.write(runtime.escape(row_first as unknown as Value, frame, [532,542]));
            context.at(frame, [543,544]); context.output.write(":");
            context.at(frame, [544,557]); context.output.write(runtime.escape(row_last as unknown as Value, frame, [547,556]));
            context.at(frame, [557,563]); context.output.write("</li>\n");
    }
    } finally { if (row_had) scope.locals.set("row", row_previous as Value); else scope.locals.delete("row"); }
    if (row_size === 0) {
            context.at(frame, [567,582]); context.output.write("<li>empty</li>\n");
    }
    }
    context.at(frame, [586,592]); context.output.write("</ul>\n");
    context.enter("partial.tpl", frame, [592,607]);
    try { render_partial_tpl(assign, definitions, { values: scope.lookup(frame, "values") as unknown as Array<number> }, context, runtime, rootData, scope); } finally { context.leave(); }
    if (definitions.content !== undefined) {
            context.at(frame, [620,634]); context.output.write("<p>defined</p>");
    } else {
            context.at(frame, [637,651]); context.output.write("<p>missing</p>");
    }
    context.at(frame, [654,655]); context.output.write("\n");
    { let definition = definitions.content;
    if (definition === undefined) throw runtime.error(frame, [655,683], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
    if (definition?.html !== undefined) { context.at(frame, [655,683]); context.output.write(definition.html); }
    else { const input = Object.assign({  }, definition?.data ?? {}, { label: (assign.page)?.title }) as Input_card_tpl; const blockScope = new Scope(); context.enter("card.tpl", frame, [655,683]); try { render_card_tpl(assign, definitions, input, context, runtime, rootData, blockScope); } finally { context.leave(); } }
    }
    context.at(frame, [684,695]); context.output.write("</section>\n");
}
function render_partial_tpl(assign: Assign, definitions: Definitions, input: Input_partial_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("partial.tpl", [0,38], rootData);
  scope.locals.set("values", input.values as unknown as Value);
    context.at(frame, [0,20]); context.output.write("<p class=\"included\">");
    context.at(frame, [20,33]); context.output.write(runtime.escape(runtime.index(scope.lookup(frame, "values") as unknown as Array<number> as unknown as Value, 2 as unknown as Value) as unknown as Value, frame, [23,32]));
    context.at(frame, [33,38]); context.output.write("</p>\n");
}
function renderTemplate(target: string, assign: Assign, definitions: Definitions, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  switch (target) {
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
