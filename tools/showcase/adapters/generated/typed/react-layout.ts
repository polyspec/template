// Generated.
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
export interface Definition<T> { html?: string; data?: Partial<T>; }
export interface Definitions { content?: Definition<Input_content_tpl>; layout?: Definition<Input_layout_tpl>; }
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
function stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }
function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function generatedDefault<T>(value: T, fallback: T): T { return value ? value : fallback; }
function generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }
function generatedCall(name: string, _args: unknown[]): never { throw new Error('generated function is not linked: ' + name); }
