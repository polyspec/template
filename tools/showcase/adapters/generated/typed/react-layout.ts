// Generated.
export interface Page { title?: string; }
export interface Slot { template?: string; html?: string; }
export interface Assign {
  title?: string | undefined;
  heading?: string | undefined;
  island_label?: string | undefined;
  root_label?: string | undefined;
  defined_label?: string | undefined;
  page?: Page | undefined;
}
export function render(assign: Assign, slots: Record<string, string>): string { let out = '';
    out += "<main>\n<h1>";
    out += escape(String(assign.title? ?? ''));
    out += "</h1>\n";
    out += slots["content"] ?? '';
    out += "</main>\n";
  return out; }
function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
