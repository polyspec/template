// Generated.
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
  page: Page;
  numbers: Array<number>;
  lookup: Map<string, string>;
  rows: Array<Row>;
}
interface Input_card_tpl { label: string; }
interface Input_layout_tpl {  }
interface Input_partial_tpl { values: Array<number>; }
function render_card_tpl(assign: Assign, slots: Record<string, string>, input: Input_card_tpl): string { let out = '';
  const label = input.label;
    out += "<p class=\"card\">";
    out += escape(stringify(label));
    out += "</p>\n";
  return out; }
function render_layout_tpl(assign: Assign, slots: Record<string, string>, input: Input_layout_tpl): string { let out = '';

    const values = [0, ...assign.numbers];
    const merged = new Map([...assign.lookup, ["z", "Z"]]);
    out += "<section>\n<h1>";
    out += escape(stringify(assign.page?.title));
    out += "</h1>\n<p>";
    out += escape(stringify(values?.[1]));
    out += "|";
    out += escape(stringify(merged?.get("z")));
    out += "</p>\n";
    if (Boolean((assign.flag && (assign.page?.title == "Guide")))) {
        out += "<strong>matched</strong>";    } else {
        out += "<strong>missed</strong>";
    }
    out += "\n<p>";
    out += escape(stringify((assign.flag ? "yes" : "no")));
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
    out += render_partial_tpl(assign, slots, { values: values });
    if (slots["content"] !== undefined) {
            out += "<p>defined</p>";
    } else {
            out += "<p>missing</p>";
    }
    out += "\n";
    out += slots["content"] ?? '';
    out += "</section>\n";
  return out; }
function render_partial_tpl(assign: Assign, slots: Record<string, string>, input: Input_partial_tpl): string { let out = '';
  const values = input.values;
    out += "<p class=\"included\">";
    out += escape(stringify(values?.[2]));
    out += "</p>\n";
  return out; }
export function renderTemplate(target: string, assign: Assign, slots: Record<string, string>): string {
  switch (target) {
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
