// Generated.
import { RuntimeEnvironment, bind, type PreparedRender, type Program, type RenderOptions, type Template } from '@polyspec/template';
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
export interface Definition<T> { html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Input_card_tpl>; layout?: Definition<Input_layout_tpl>; }
export interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }
type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };
const generatedRecords = {"Page":{"title":{"kind":"string","optional":false}},"Row":{"name":{"kind":"string","optional":false}},"Slot":{"template":{"kind":"string","optional":true},"html":{"kind":"string","optional":true}}} as const;
const generatedAssign = {"flag":{"kind":"boolean","optional":false},"dangerous":{"kind":"string","optional":false},"empty_list":{"kind":"list","item":{"kind":"string","optional":false},"optional":false},"empty_map":{"kind":"map","key":{"kind":"string","optional":false},"value":{"kind":"string","optional":false},"optional":false},"page":{"kind":"record","name":"Page","optional":false},"numbers":{"kind":"list","item":{"kind":"number","optional":false},"optional":false},"lookup":{"kind":"map","key":{"kind":"string","optional":false},"value":{"kind":"string","optional":false},"optional":false},"rows":{"kind":"list","item":{"kind":"record","name":"Row","optional":false},"optional":false}} as const;
const generatedDefinitionSpecs = {"content":{"field":"content","target":"card.tpl","html":true,"input":{"label":{"kind":"string","optional":false}}},"layout":{"field":"layout","target":"layout.tpl","html":false,"input":{}}} as const;
function generatedObject(value: unknown, path: string): Map<string, unknown> { if (value instanceof Map) return value; throw new Error(path + ' is not an object'); }
function generatedBindType(value: unknown, type: GeneratedType, path: string): unknown { if (value === null || value === undefined) { if (type.optional || type.kind === 'null' || type.kind === 'any') return undefined; throw new Error(path + ' is required'); } if (type.kind === 'any') return value; if (type.kind === 'null') { if (value !== null) throw new Error(path + ' is not null'); return null; } if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') { if (typeof value !== type.kind) throw new Error(path + ' is not a ' + type.kind); return value; } if (type.kind === 'list') { if (!Array.isArray(value)) throw new Error(path + ' is not a list'); return value.map((item, index) => generatedBindType(item, type.item as GeneratedType, path + '[' + index + ']')); } if (type.kind === 'map') { const object = generatedObject(value, path); return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key as GeneratedType, path + '.key'), generatedBindType(item, type.value as GeneratedType, path + '.' + key)])); } if (type.kind === 'record') return generatedBindRecord(value, generatedRecords[type.name as keyof typeof generatedRecords] as Record<string, GeneratedType>, path); throw new Error(path + ' has an unknown generated type'); }
function generatedBindRecord(value: unknown, fields: Record<string, GeneratedType>, path: string, partial = false): Record<string, unknown> { const object = generatedObject(value, path); const result: Record<string, unknown> = {}; for (const [name, type] of Object.entries(fields)) { if (!object.has(name)) { if (!partial && !type.optional) throw new Error(path + '.' + name + ' is required'); continue; } result[name] = generatedBindType(object.get(name), type, path + '.' + name); } return result; }
function generatedBindAssign(value: unknown): Assign { const bound = bind(value); return generatedBindRecord(bound, generatedAssign as Record<string, GeneratedType>, 'assign') as unknown as Assign; }
type GeneratedBoundDefinitions = { definitions: Definitions; targets: Map<string, { target: string | null; html?: string }> };
function generatedBindDefinitions(input: RenderOptions['define']): GeneratedBoundDefinitions { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions: Record<string, unknown> = {}; const targets = new Map<string, { target: string | null; html?: string }>(); for (const [id, raw] of object) { const spec = (generatedDefinitionSpecs as Record<string, { field: string; target: string | null; html: boolean; input: Record<string, GeneratedType> }>)[id]; if (spec === undefined) throw new Error('define.' + id + ' is not declared'); if (typeof raw === 'string') { if (spec.target === null || raw !== spec.target) throw new Error('define.' + id + ' has an invalid template'); definitions[spec.field] = {}; targets.set(id, { target: spec.target }); continue; } const entry = generatedObject(raw, 'define.' + id); const template = entry.get('template'); const html = entry.get('html'); const data = entry.get('data'); if (typeof html === 'string') { if (!spec.html || template !== undefined || data !== undefined) throw new Error('define.' + id + ' has an invalid html entry'); definitions[spec.field] = { html }; targets.set(id, { target: null, html }); continue; } if (typeof template !== 'string' || spec.target === null || template !== spec.target) throw new Error('define.' + id + ' has an invalid template'); const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true); definitions[spec.field] = { data: boundData }; targets.set(id, { target: spec.target }); } return { definitions: definitions as Definitions, targets }; }
function stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }
function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function generatedTruthy(value: unknown): boolean { if (value === null || value === undefined || value === false || value === '' || value === 0) return false; if (Array.isArray(value)) return value.length !== 0; if (value instanceof Map) return value.size !== 0; return true; }
function generatedDefault<T>(value: T, fallback: T): T { return generatedTruthy(value) ? value : fallback; }
function generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }
function render_card_tpl(assign: Assign, definitions: Definitions, input: Input_card_tpl): string { let out = '';
  const label = input.label;
    out += "<p class=\"card\">";
    out += escape(stringify(label));
    out += "</p>\n";
  return out; }
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl): string { let out = '';

    const values = [0, ...assign.numbers];
    const merged = new Map([...assign.lookup, ["z", "Z"]]);
    out += "<section>\n<h1>";
    out += escape(stringify(assign.page?.title));
    out += "</h1>\n<p class=\"escaped\">";
    out += escape(stringify(assign.dangerous));
    out += "</p>\n<p class=\"logical\">";
    out += escape(stringify((generatedTruthy(assign.flag) && generatedTruthy("x"))));
    out += "|";
    out += escape(stringify((generatedTruthy(false) || generatedTruthy(2))));
    out += "</p>\n<p class=\"empty-truthiness\">";
    out += escape(stringify((generatedTruthy(assign.empty_list) && generatedTruthy(assign.flag))));
    out += "|";
    out += escape(stringify((generatedTruthy(assign.empty_map) && generatedTruthy(assign.flag))));
    out += "</p>\n<p>";
    out += escape(stringify(values?.[1]));
    out += "|";
    out += escape(stringify(merged?.get("z")));
    out += "</p>\n";
    if (generatedTruthy((generatedTruthy(assign.flag) && generatedTruthy((assign.page?.title == "Guide"))))) {
        out += "<strong>matched</strong>";    } else {
        out += "<strong>missed</strong>";
    }
    out += "\n<p>";
    out += escape(stringify((generatedTruthy(assign.flag) ? "yes" : "no")));
    out += "|";
    out += escape(stringify(((-1) + 3)));
    out += "|";
    out += escape(stringify(generatedDefault("", "fallback")));
    out += "</p>\n<ul>\n";
    { const row_entries = (assign.rows ?? []).map((value, key) => [key, value] as const);
    for (let row_index = 0; row_index < row_entries.length; row_index += 1) {
        const [row_key, row_value] = row_entries[row_index];
        const row = row_value;
        const row_size = row_entries.length;
        const row_first = row_index === 0;
        const row_last = row_index + 1 === row_entries.length;
            out += "<li>";
            out += escape(stringify(row_index));
            out += "/";
            out += escape(stringify(row_size));
            out += ":";
            out += escape(stringify(row?.name));
            out += ":";
            out += escape(stringify(row_first));
            out += ":";
            out += escape(stringify(row_last));
            out += "</li>\n";
    }
    if (row_entries.length === 0) {
            out += "<li>empty</li>\n";
    }
    }
    out += "</ul>\n";
    out += render_partial_tpl(assign, definitions, { values: values });
    if (definitions.content !== undefined) {
            out += "<p>defined</p>";
    } else {
            out += "<p>missing</p>";
    }
    out += "\n";
    { const definition = definitions.content;
    if (definition === undefined) throw new Error("generated definition content is missing");
    if (definition?.html !== undefined) out += definition.html;
    else { const input = Object.assign({  }, definition?.data ?? {}, { label: assign.page?.title }) as Input_card_tpl; out += render_card_tpl(assign, definitions, input); }
    }
    out += "</section>\n";
  return out; }
function render_partial_tpl(assign: Assign, definitions: Definitions, input: Input_partial_tpl): string { let out = '';
  const values = input.values;
    out += "<p class=\"included\">";
    out += escape(stringify(values?.[2]));
    out += "</p>\n";
  return out; }
export function renderTemplate(target: string, assign: Assign, definitions: Definitions): string {
  switch (target) {
    case "layout.tpl": return render_layout_tpl(assign, definitions, {});
    default: throw new Error('generated template is missing or requires inputs: ' + target);
  }
}
export function render(assign: Assign, definitions: Definitions): string { return renderTemplate("layout.tpl", assign, definitions); }
class GeneratedPreparedRender implements PreparedRender { private readonly execute: () => string; constructor(execute: () => string) { this.execute = execute; } render(): string { return this.execute(); } }
export class GeneratedProgram implements Program {
  readonly runtime: RuntimeEnvironment;
  constructor(runtime: RuntimeEnvironment = new RuntimeEnvironment()) { this.runtime = runtime; }
  prepare(target: string | Template, assign: unknown, options: RenderOptions = {}): PreparedRender { if (typeof target !== 'string') throw new Error('generated target must be a template name'); const typedAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined) return new GeneratedPreparedRender(() => registered.html as string); const targetName = registered?.target ?? target; return new GeneratedPreparedRender(() => renderTemplate(targetName, typedAssign, bound.definitions)); }
  render(target: string | Template, assign: unknown, options: RenderOptions = {}): string { return this.prepare(target, assign, options).render(); }
}
