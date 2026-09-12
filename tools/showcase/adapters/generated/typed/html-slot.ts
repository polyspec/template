// Generated.

export interface Assign {
  heading: string;
}
export interface Input_layout_tpl {  }
export type DefinitionData<T> = Partial<T>;
export interface Definition<T> { html?: string; data?: DefinitionData<T>; }
export interface Definitions { content?: Definition<Record<never, never>>; layout?: Definition<Input_layout_tpl>; }
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl): string { let out = '';

    out += "<section class=\"notice\">\n<h1>";
    out += escape(stringify(assign.heading));
    out += "</h1>\n";
    { const definition = definitions.content;
    if (definition?.html === undefined) throw new Error("generated definition content requires html");
    out += definition.html;
    }
    out += "</section>\n";
  return out; }
export function renderTemplate(target: string, assign: Assign, definitions: Definitions): string {
  switch (target) {
    case "layout.tpl": return render_layout_tpl(assign, definitions, {});
    default: throw new Error('generated template is missing or requires inputs: ' + target);
  }
}
export function render(assign: Assign, definitions: Definitions): string { return renderTemplate("layout.tpl", assign, definitions); }
function stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }
function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function generatedDefault<T>(value: T, fallback: T): T { return value ? value : fallback; }
function generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }
function generatedCall(name: string, _args: unknown[]): never { throw new Error('generated function is not linked: ' + name); }
