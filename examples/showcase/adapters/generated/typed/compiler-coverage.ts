// Generated.
import { BindError, Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, TemplateError, bindData, bindMap, checkText, internalBoundary, type MapValue, type PreparedRender, type Program, type RenderOptions, type Span, type Template, type Value } from '@polyspec/template';
export interface Page {
  title: string;
}
export interface Row {
  name: string;
}
export interface Slot {
  template: string | null;
  html: string | null;
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
type GeneratedDecoder<T> = (value: Value | undefined, path: string) => T;
function generatedTypeError(value: Value | undefined, path: string, expected: string): Error { return new Error(value === null || value === undefined ? path + ' is required' : path + ' is not ' + expected); }
function generatedChecked<T>(decode: GeneratedDecoder<T>, value: Value, path: string, runtime: RuntimeBindings, frame: Frame, span: Span): T { try { return decode(value, path); } catch (error) { if (error instanceof Error) throw runtime.error(frame, span, 'E_RUNTIME_TYPE', error.message); throw error; } }
function generatedDataObject(value: Value, path: string): MapValue { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }
function generatedPlain(value: unknown): value is object { if (typeof value !== 'object' || value === null) return false; const prototype = Reflect.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function generatedObject(value: Value | undefined, path: string): MapValue { if (value instanceof Map) return value; throw generatedTypeError(value, path, 'an object'); }
function generatedString(value: Value | undefined, path: string): string { if (typeof value === 'string') return value; throw generatedTypeError(value, path, 'a string'); }
function generatedNumber(value: Value | undefined, path: string): number { if (typeof value === 'number') return value; throw generatedTypeError(value, path, 'a number'); }
function generatedBoolean(value: Value | undefined, path: string): boolean { if (typeof value === 'boolean') return value; throw generatedTypeError(value, path, 'a boolean'); }
function generatedOptional<T>(decode: GeneratedDecoder<T>): GeneratedDecoder<T | null> { return (value, path) => value === null || value === undefined ? null : decode(value, path); }
function generatedListOf<T>(item: GeneratedDecoder<T>): GeneratedDecoder<T[]> { return (value, path) => { if (Array.isArray(value)) return value.map((element, index) => item(element, path + '[' + index + ']')); throw generatedTypeError(value, path, 'a list'); }; }
function generatedMapOf<T>(item: GeneratedDecoder<T>): GeneratedDecoder<Map<string, T>> { return (value, path) => new Map([...generatedObject(value, path)].map(([key, element]): [string, T] => [key, item(element, path + '.' + key)])); }
function generatedEncodeList<T>(encode: (value: T) => Value): (value: T[]) => Value { return value => value.map(item => encode(item)); }
function generatedDecode_Page(value: Value | undefined, path: string): Page { const object = generatedObject(value, path); return { title: generatedString(object.get("title"), path + ".title") }; }
function generatedDecode_Row(value: Value | undefined, path: string): Row { const object = generatedObject(value, path); return { name: generatedString(object.get("name"), path + ".name") }; }
function generatedEncode_Row(value: Row): Value { return new Map<string, Value>([["name", value.name]]); }
function generatedDecodeAssign(value: Value | undefined, path: string): Assign { const object = generatedObject(value, path); return { flag: generatedBoolean(object.get("flag"), path + ".flag"), dangerous: generatedString(object.get("dangerous"), path + ".dangerous"), empty_list: generatedListOf(generatedString)(object.get("empty_list"), path + ".empty_list"), empty_map: generatedMapOf(generatedString)(object.get("empty_map"), path + ".empty_map"), page: generatedDecode_Page(object.get("page"), path + ".page"), numbers: generatedListOf(generatedNumber)(object.get("numbers"), path + ".numbers"), lookup: generatedMapOf(generatedString)(object.get("lookup"), path + ".lookup"), rows: generatedListOf(generatedDecode_Row)(object.get("rows"), path + ".rows") }; }
function generatedDecodeData_Input_card_tpl(value: Value, path: string): DefinitionData<Input_card_tpl> { const object = generatedDataObject(value, path); const data: DefinitionData<Input_card_tpl> = {}; if (object.has("label")) data.label = generatedString(object.get("label"), path + ".label"); return data; }
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
        if (raw !== "card.tpl") throw new Error("define.content has an invalid template");
        definitions.content = { template: "card.tpl" }; targets.set("content", { target: "card.tpl" }); break;
      }
      if (typeof raw !== 'object' || raw === null) throw new Error("define.content is not an object");
      const template = 'template' in raw ? raw.template : undefined;
      const html = 'html' in raw ? raw.html : undefined;
      const data = 'data' in raw && raw.data !== undefined ? bindData(raw.data) : undefined;
      if (typeof html === 'string') {
        if (template !== undefined || data !== undefined) throw new Error("define.content has an invalid html entry");
        definitions.content = { html }; targets.set("content", { target: null, html }); break;
      }
      if (template !== "card.tpl") throw new Error("define.content has an invalid template");
      definitions.content = { template: "card.tpl", data: data === undefined ? {} : generatedDecodeData_Input_card_tpl(data, "define.content.data") }; targets.set("content", { target: "card.tpl" }); break;
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
function render_card_tpl(_assign: Assign, _definitions: Definitions, input: Input_card_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("card.tpl", [0,30], rootData);
  scope.locals.set("label", input.label);
    context.at(frame, [0,16]); context.output.write("<p class=\"card\">");
    context.at(frame, [16,25]); context.output.write(runtime.escape(generatedChecked(generatedString, scope.lookup(frame, "label"), "label", runtime, frame, [19,24]), frame, [19,24]));
    context.at(frame, [25,30]); context.output.write("</p>\n");
}
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("layout.tpl", [0,29,66,76,100,137,191,268,305,392,463,468,483,563,567,582,586,592,608,655,684,695], rootData);

    scope.locals.set("values", generatedChecked(generatedListOf(generatedNumber), runtime.depth([0, ...runtime.listSpread(assign.numbers, frame, [16,26])], frame, [12,27]), "list", runtime, frame, [12,27]));
    scope.locals.set("merged", generatedChecked(generatedMapOf(generatedString), runtime.depth(new Map<string, Value>([...runtime.mapSpread(assign.lookup, frame, [42,51]), [runtime.stringify("z", frame, [53,56]), "Z"]]), frame, [41,64]), "map", runtime, frame, [41,64]));
    context.at(frame, [66,80]); context.output.write("<section>\n<h1>");
    context.at(frame, [80,94]); context.output.write(runtime.escape((assign.page).title, frame, [83,93]));
    context.at(frame, [94,119]); context.output.write("</h1>\n<p class=\"escaped\">");
    context.at(frame, [119,132]); context.output.write(runtime.escape(assign.dangerous, frame, [122,131]));
    context.at(frame, [132,156]); context.output.write("</p>\n<p class=\"logical\">");
    context.at(frame, [156,171]); context.output.write(runtime.escape((() => { const left = assign.flag; return runtime.truthy(left) ? runtime.truthy("x") : false; })(), frame, [159,170]));
    context.at(frame, [171,172]); context.output.write("|");
    context.at(frame, [172,186]); context.output.write(runtime.escape((() => { const left = false; return runtime.truthy(left) ? true : runtime.truthy(2); })(), frame, [175,185]));
    context.at(frame, [186,219]); context.output.write("</p>\n<p class=\"empty-truthiness\">");
    context.at(frame, [219,241]); context.output.write(runtime.escape((() => { const left = assign.empty_list; return runtime.truthy(left) ? runtime.truthy(assign.flag) : false; })(), frame, [222,240]));
    context.at(frame, [241,242]); context.output.write("|");
    context.at(frame, [242,263]); context.output.write(runtime.escape((() => { const left = assign.empty_map; return runtime.truthy(left) ? runtime.truthy(assign.flag) : false; })(), frame, [245,262]));
    context.at(frame, [263,271]); context.output.write("</p>\n<p>");
    context.at(frame, [271,284]); context.output.write(runtime.escape(generatedChecked(generatedOptional(generatedNumber), runtime.index(generatedChecked(generatedListOf(generatedNumber), scope.lookup(frame, "values"), "values", runtime, frame, [274,280]), 1, frame, [274,283]), "index", runtime, frame, [274,283]), frame, [274,283]));
    context.at(frame, [284,285]); context.output.write("|");
    context.at(frame, [285,300]); context.output.write(runtime.escape(generatedChecked(generatedOptional(generatedString), runtime.index(generatedChecked(generatedMapOf(generatedString), scope.lookup(frame, "merged"), "merged", runtime, frame, [288,294]), "z", frame, [288,299]), "index", runtime, frame, [288,299]), frame, [288,299]));
    context.at(frame, [300,305]); context.output.write("</p>\n");
    if (runtime.truthy((() => { const left = assign.flag; return runtime.truthy(left) ? runtime.truthy(generatedChecked(generatedBoolean, runtime.binary("==", (assign.page).title, "Guide", frame, [316,337]), "==", runtime, frame, [316,337])) : false; })())) {
        context.at(frame, [338,362]); context.output.write("<strong>matched</strong>");    } else {
        context.at(frame, [365,388]); context.output.write("<strong>missed</strong>");
    }
    context.at(frame, [391,395]); context.output.write("\n<p>");
    context.at(frame, [395,418]); context.output.write(runtime.escape((runtime.truthy(assign.flag) ? "yes" : "no"), frame, [398,417]));
    context.at(frame, [418,419]); context.output.write("|");
    context.at(frame, [419,429]); context.output.write(runtime.escape(generatedChecked(generatedNumber, runtime.binary("+", generatedChecked(generatedNumber, runtime.unary("-", 1, frame, [422,424]), "-", runtime, frame, [422,424]), 3, frame, [422,428]), "+", runtime, frame, [422,428]), frame, [422,428]));
    context.at(frame, [429,430]); context.output.write("|");
    context.at(frame, [430,458]); context.output.write(runtime.escape(generatedChecked(generatedString, runtime.call("default", ["", "fallback"], frame, [433,457]), "default", runtime, frame, [433,457]), frame, [433,457]));
    context.at(frame, [458,468]); context.output.write("</p>\n<ul>\n");
    { const row_entries = runtime.entries(generatedEncodeList(generatedEncode_Row)(assign.rows), frame, [468,585]);
    const row_size = row_entries.length; const row_last_index = row_size - 1;
    const row_previous = scope.locals.get("row");
    try {
    for (const [row_index, [, row_value]] of row_entries.entries()) {
        scope.locals.set("row", row_value);
        const row_first = row_index === 0;
        const row_last = row_index === row_last_index;
        context.iterations += 1;
        runtime.limit('iteration', context.iterations, frame, [468,585]);
            context.at(frame, [483,487]); context.output.write("<li>");
            context.at(frame, [487,501]); context.output.write(runtime.escape(row_index, frame, [490,500]));
            context.at(frame, [501,502]); context.output.write("/");
            context.at(frame, [502,515]); context.output.write(runtime.escape(row_size, frame, [505,514]));
            context.at(frame, [515,516]); context.output.write(":");
            context.at(frame, [516,528]); context.output.write(runtime.escape((generatedChecked(generatedDecode_Row, scope.lookup(frame, "row"), "row", runtime, frame, [519,522])).name, frame, [519,527]));
            context.at(frame, [528,529]); context.output.write(":");
            context.at(frame, [529,543]); context.output.write(runtime.escape(row_first, frame, [532,542]));
            context.at(frame, [543,544]); context.output.write(":");
            context.at(frame, [544,557]); context.output.write(runtime.escape(row_last, frame, [547,556]));
            context.at(frame, [557,563]); context.output.write("</li>\n");
    }
    } finally { if (row_previous !== undefined) scope.locals.set("row", row_previous); else scope.locals.delete("row"); }
    if (row_size === 0) {
            context.at(frame, [567,582]); context.output.write("<li>empty</li>\n");
    }
    }
    context.at(frame, [586,592]); context.output.write("</ul>\n");
    context.enter("partial.tpl", frame, [592,607]);
    try { render_partial_tpl(assign, definitions, { values: generatedChecked(generatedListOf(generatedNumber), scope.lookup(frame, "values"), "values", runtime, frame, [592,607]) }, context, runtime, rootData, scope); } finally { context.leave(); }
    if (definitions.content !== undefined) {
            context.at(frame, [620,634]); context.output.write("<p>defined</p>");
    } else {
            context.at(frame, [637,651]); context.output.write("<p>missing</p>");
    }
    context.at(frame, [654,655]); context.output.write("\n");
    { let definition = definitions.content;
    if (definition === undefined) throw runtime.error(frame, [655,683], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
    if (definition?.html !== undefined) { context.at(frame, [655,683]); context.output.write(definition.html); }
    else { const input: Input_card_tpl = { label: (assign.page).title }; const blockScope = new Scope(); context.enter("card.tpl", frame, [655,683]); try { render_card_tpl(assign, definitions, input, context, runtime, rootData, blockScope); } finally { context.leave(); } }
    }
    context.at(frame, [684,695]); context.output.write("</section>\n");
}
function render_partial_tpl(_assign: Assign, _definitions: Definitions, input: Input_partial_tpl, context: RenderContext, runtime: RuntimeBindings, rootData: MapValue, scope: Scope): void {
  const frame = new Frame("partial.tpl", [0,38], rootData);
  scope.locals.set("values", input.values);
    context.at(frame, [0,20]); context.output.write("<p class=\"included\">");
    context.at(frame, [20,33]); context.output.write(runtime.escape(generatedChecked(generatedOptional(generatedNumber), runtime.index(generatedChecked(generatedListOf(generatedNumber), scope.lookup(frame, "values"), "values", runtime, frame, [23,29]), 2, frame, [23,32]), "index", runtime, frame, [23,32]), frame, [23,32]));
    context.at(frame, [33,38]); context.output.write("</p>\n");
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
