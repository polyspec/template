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
function render_content_tpl(assign: Assign, slots: Record<string, string>): string { let out = '';
    out += "<section data-react-island id=\"counter\">\n<p>";
    out += escape(String(assign.island_label ?? ''));
    out += "</p>\n</section>\n";
  return out; }
function render_layout_tpl(assign: Assign, slots: Record<string, string>): string { let out = '';
    out += "<main>\n<h1>";
    out += escape(String(assign.title ?? ''));
    out += "</h1>\n";
    out += slots["content"] ?? '';
    out += "</main>\n";
  return out; }
export function renderTemplate(target: string, assign: Assign, slots: Record<string, string>): string {
  switch (target) {
    case "content.tpl": return render_content_tpl(assign, slots);
    case "layout.tpl": return render_layout_tpl(assign, slots);
    default: throw new Error('generated template is missing: ' + target);
  }
}
export function render(assign: Assign, slots: Record<string, string>): string { return renderTemplate("layout.tpl", assign, slots); }
function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
