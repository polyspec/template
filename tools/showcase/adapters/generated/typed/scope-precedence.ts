// Generated.
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
function render_content_tpl(assign: Assign, definitions: Definitions, input: Input_content_tpl): string { let out = '';
  const title = input.title;
  const root_label = input.root_label;
  const defined_label = input.defined_label;
  const layout_local = input.layout_local;
    out += "<article>\n<h1>";
    out += escape(stringify(title));
    out += "</h1>\n<p class=\"root\">";
    out += escape(stringify(root_label));
    out += "</p>\n<p class=\"defined\">";
    out += escape(stringify(defined_label));
    out += "</p>\n<p class=\"local\">";
    out += escape(stringify(generatedDefault(layout_local, "missing")));
    out += "</p>\n</article>\n";
  return out; }
function render_layout_tpl(assign: Assign, definitions: Definitions, input: Input_layout_tpl): string { let out = '';

    const layout_local = "visible only in layout";
    out += "<section class=\"scope\">\n";
    { const definition = definitions.content;
    if (definition === undefined) throw new Error("generated definition content is missing");
    if (definition?.html !== undefined) out += definition.html;
    else { const input = Object.assign({ root_label: assign.root_label, defined_label: assign.defined_label }, definition?.data ?? {}, { title: assign.page?.title }) as Input_content_tpl; out += render_content_tpl(assign, definitions, input); }
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
