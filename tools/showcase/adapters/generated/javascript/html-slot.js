// Generated.
import { RuntimeEnvironment, bind } from '@polyspec/template';
const generatedRecords = {};
const generatedAssign = { "heading": { "kind": "string", "optional": false } };
const generatedDefinitionSpecs = { "content": { "field": "content", "target": null, "html": true, "input": {} }, "layout": { "field": "layout", "target": "layout.tpl", "html": false, "input": {} } };
function generatedObject(value, path) { if (value instanceof Map)
    return value; throw new Error(path + ' is not an object'); }
function generatedBindType(value, type, path) { if (value === null || value === undefined) {
    if (type.optional || type.kind === 'null' || type.kind === 'any')
        return undefined;
    throw new Error(path + ' is required');
} if (type.kind === 'any')
    return value; if (type.kind === 'null') {
    if (value !== null)
        throw new Error(path + ' is not null');
    return null;
} if (type.kind === 'string' || type.kind === 'number' || type.kind === 'boolean') {
    if (typeof value !== type.kind)
        throw new Error(path + ' is not a ' + type.kind);
    return value;
} if (type.kind === 'list') {
    if (!Array.isArray(value))
        throw new Error(path + ' is not a list');
    return value.map((item, index) => generatedBindType(item, type.item, path + '[' + index + ']'));
} if (type.kind === 'map') {
    const object = generatedObject(value, path);
    return new Map([...object].map(([key, item]) => [generatedBindType(key, type.key, path + '.key'), generatedBindType(item, type.value, path + '.' + key)]));
} if (type.kind === 'record')
    return generatedBindRecord(value, generatedRecords[type.name], path); throw new Error(path + ' has an unknown generated type'); }
function generatedBindRecord(value, fields, path, partial = false) { const object = generatedObject(value, path); const result = {}; for (const [name, type] of Object.entries(fields)) {
    if (!object.has(name)) {
        if (!partial && !type.optional)
            throw new Error(path + '.' + name + ' is required');
        continue;
    }
    result[name] = generatedBindType(object.get(name), type, path + '.' + name);
} return result; }
function generatedBindAssign(value) { const bound = bind(value); return generatedBindRecord(bound, generatedAssign, 'assign'); }
function generatedBindDefinitions(input) { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions = {}; const targets = new Map(); for (const [id, raw] of object) {
    const spec = generatedDefinitionSpecs[id];
    if (spec === undefined)
        throw new Error('define.' + id + ' is not declared');
    if (typeof raw === 'string') {
        if (spec.target === null || raw !== spec.target)
            throw new Error('define.' + id + ' has an invalid template');
        definitions[spec.field] = {};
        targets.set(id, { target: spec.target });
        continue;
    }
    const entry = generatedObject(raw, 'define.' + id);
    const template = entry.get('template');
    const html = entry.get('html');
    const data = entry.get('data');
    if (typeof html === 'string') {
        if (!spec.html || template !== undefined || data !== undefined)
            throw new Error('define.' + id + ' has an invalid html entry');
        definitions[spec.field] = { html };
        targets.set(id, { target: null, html });
        continue;
    }
    if (typeof template !== 'string' || spec.target === null || template !== spec.target)
        throw new Error('define.' + id + ' has an invalid template');
    const boundData = data === undefined ? {} : generatedBindRecord(data, spec.input, 'define.' + id + '.data', true);
    definitions[spec.field] = { data: boundData };
    targets.set(id, { target: spec.target });
} return { definitions: definitions, targets }; }
function stringify(value) { if (value === null || value === undefined)
    return ''; if (typeof value === 'object')
    throw new Error('a collection cannot be converted to text'); return String(value); }
function escape(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function generatedTruthy(value) { if (value === null || value === undefined || value === false || value === '' || value === 0)
    return false; if (Array.isArray(value))
    return value.length !== 0; if (value instanceof Map)
    return value.size !== 0; return true; }
function generatedDefault(value, fallback) { return generatedTruthy(value) ? value : fallback; }
function generatedIn(value, collection) { if (Array.isArray(collection))
    return collection.includes(value); if (collection instanceof Map)
    return collection.has(value); if (typeof collection === 'string')
    return collection.includes(String(value)); return false; }
function render_layout_tpl(assign, definitions, input) {
    let out = '';
    out += "<section class=\"notice\">\n<h1>";
    out += escape(stringify(assign.heading));
    out += "</h1>\n";
    {
        const definition = definitions.content;
        if (definition?.html === undefined)
            throw new Error("generated definition content requires html");
        out += definition.html;
    }
    out += "</section>\n";
    return out;
}
export function renderTemplate(target, assign, definitions) {
    switch (target) {
        case "layout.tpl": return render_layout_tpl(assign, definitions, {});
        default: throw new Error('generated template is missing or requires inputs: ' + target);
    }
}
export function render(assign, definitions) { return renderTemplate("layout.tpl", assign, definitions); }
class GeneratedPreparedRender {
    execute;
    constructor(execute) { this.execute = execute; }
    render() { return this.execute(); }
}
export class GeneratedProgram {
    runtime;
    constructor(runtime = new RuntimeEnvironment()) { this.runtime = runtime; }
    prepare(target, assign, options = {}) { if (typeof target !== 'string')
        throw new Error('generated target must be a template name'); const typedAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined)
        return new GeneratedPreparedRender(() => registered.html); const targetName = registered?.target ?? target; return new GeneratedPreparedRender(() => renderTemplate(targetName, typedAssign, bound.definitions)); }
    render(target, assign, options = {}) { return this.prepare(target, assign, options).render(); }
}
