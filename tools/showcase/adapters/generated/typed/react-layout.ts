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
interface Input_content_tpl {  }
interface Input_layout_tpl {  }
function render_content_tpl(assign: Assign, slots: Record<string, string>, input: Input_content_tpl): string { let out = '';

    out += "<section data-react-island id=\"counter\">\n<p>";
    out += escape(stringify(assign.island_label));
    out += "</p>\n</section>\n";
  return out; }
function render_layout_tpl(assign: Assign, slots: Record<string, string>, input: Input_layout_tpl): string { let out = '';

    out += "<main>\n<h1>";
    out += escape(stringify(assign.title));
    out += "</h1>\n";
    out += slots["content"] ?? '';
    out += "</main>\n";
  return out; }
export function renderTemplate(target: string, assign: Assign, slots: Record<string, string>): string {
  switch (target) {
    case "content.tpl": return render_content_tpl(assign, slots, {});
    case "layout.tpl": return render_layout_tpl(assign, slots, {});
    default: throw new Error('generated template is missing or requires inputs: ' + target);
  }
}
export function render(assign: Assign, slots: Record<string, string>): string { return renderTemplate("layout.tpl", assign, slots); }
function stringify(value: unknown): string { if (value === null || value === undefined) return ''; if (typeof value === 'object') throw new Error('a collection cannot be converted to text'); return String(value); }
function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function generatedDefault<T>(value: T, fallback: T): T { return value ? value : fallback; }
function generatedIn(value: unknown, collection: unknown): boolean { if (Array.isArray(collection)) return collection.includes(value); if (collection instanceof Map) return collection.has(value); if (typeof collection === 'string') return collection.includes(String(value)); return false; }
function generatedCall(name: string, _args: unknown[]): never { throw new Error('generated function is not linked: ' + name); }
