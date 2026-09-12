// Generated.
import { RuntimeEnvironment, bind, type PreparedRender, type Program, type RenderOptions, type Template } from '@polyspec/template';
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
export interface Definition<T> { html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Input_content_tpl>; layout?: Definition<Input_layout_tpl>; }
export interface ArtifactManifest { schema: number; mode: 'gen'; target: 'ts'; entry: string; sourceDigest: string; typeDigest: string; contractDigest: string; files: Record<string, string>; }
type GeneratedType = { kind: string; optional?: boolean; item?: GeneratedType; key?: GeneratedType; value?: GeneratedType; name?: string };
const generatedRecords = {"Page":{"title":{"kind":"string","optional":true}},"Slot":{"template":{"kind":"string","optional":true},"html":{"kind":"string","optional":true}}} as const;
const generatedAssign = {"title":{"kind":"string","optional":true},"heading":{"kind":"string","optional":true},"island_label":{"kind":"string","optional":true},"root_label":{"kind":"string","optional":true},"defined_label":{"kind":"string","optional":true},"page":{"kind":"record","name":"Page","optional":true}} as const;
const generatedDefinitionSpecs = {"content":{"field":"content","target":"content.tpl","html":true,"input":{}},"layout":{"field":"layout","target":"layout.tpl","html":false,"input":{}}} as const;
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
function render_content_tpl(assign: Assign, definitions: Definitions, input: Input_content_tpl): string { let out = '';

    out += "<section data-react-island id=\"counter\">\n<p>";
    out += escape(stringify(assign.island_label));
    out += "</p>\n</section>\n";
  return out; }
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl): string { let out = '';

    out += "<main>\n<h1>";
    out += escape(stringify(assign.title));
    out += "</h1>\n";
    { const definition = definitions.content;
    if (definition === undefined) throw new Error("generated definition content is missing");
    if (definition?.html !== undefined) out += definition.html;
    else { const input = Object.assign({  }, definition?.data ?? {}, {  }) as Input_content_tpl; out += render_content_tpl(assign, definitions, input); }
    }
    out += "</main>\n";
  return out; }
export function renderTemplate(target: string, assign: Assign, definitions: Definitions): string {
  switch (target) {
    case "content.tpl": return render_content_tpl(assign, definitions, {});
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
