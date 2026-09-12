// Generated.
import { Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, bind, bindMap } from '@polyspec/template';
const generatedRecords = {};
const generatedAssign = { "page": { "kind": "string", "optional": false } };
const generatedDefinitionSpecs = { "content": { "field": "content", "target": null, "html": true, "input": {} }, "layout": { "field": "layout", "target": "layout.tpl", "html": false, "input": {} } };
function generatedObject(value, path) { if (value instanceof Map)
    return value; throw new Error(path + ' is not an object'); }
function generatedBindType(value, type, path) { if (value === null || value === undefined) {
    if (type.optional || type.kind === 'null' || type.kind === 'any')
        return null;
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
        if (!partial)
            result[name] = null;
        continue;
    }
    result[name] = generatedBindType(object.get(name), type, path + '.' + name);
} return result; }
function generatedBindAssign(value) { const root = bindMap(value); return { assign: generatedBindRecord(root, generatedAssign, 'assign'), root }; }
function generatedBindDefinitions(input) { const value = bind(input ?? {}); const object = generatedObject(value, 'define'); const definitions = {}; const targets = new Map(); for (const [id, raw] of object) {
    const spec = generatedDefinitionSpecs[id];
    if (spec === undefined)
        throw new Error('define.' + id + ' is not declared');
    if (typeof raw === 'string') {
        if (spec.target === null || raw !== spec.target)
            throw new Error('define.' + id + ' has an invalid template');
        definitions[spec.field] = { template: spec.target };
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
    definitions[spec.field] = { template: spec.target, data: boundData };
    targets.set(id, { target: spec.target });
} return { definitions: definitions, targets }; }
function render_layout_tpl(assign, definitions, input, context, runtime, rootData) {
    const frame = new Frame("layout.tpl", [0, 26, 39, 51, 55, 99, 103, 111], rootData);
    context.at(frame, [0, 26]);
    context.output.write("<main class=\"empty-page\">\n");
    if (definitions.content !== undefined) {
        {
            const definition = definitions.content;
            if (definition?.html === undefined)
                throw runtime.error(frame, [39, 50], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
            context.at(frame, [39, 50]);
            context.output.write(definition.html);
        }
    }
    else {
        context.at(frame, [55, 99]);
        context.output.write("<p class=\"empty\">No content definition.</p>\n");
    }
    context.at(frame, [103, 111]);
    context.output.write("</main>\n");
}
function renderTemplate(target, assign, definitions, context, runtime, rootData) {
    switch (target) {
        case "layout.tpl":
            render_layout_tpl(assign, definitions, {}, context, runtime, rootData);
            return;
        default: throw context.fail('E_LOAD_NOT_FOUND', null, null, 'template ' + target + ' does not exist');
    }
}
function generatedEnv(input) { const timezone = input?.timezone ?? 'Z'; const now = input?.now ?? Math.floor(Date.now() / 1000); if (typeof timezone !== 'string')
    throw new Error('env.timezone is not a string'); if (typeof now !== 'number')
    throw new Error('env.now is not a number'); return { timezone, now }; }
class GeneratedPreparedRender {
    execute;
    constructor(execute) { this.execute = execute; }
    render() { return this.execute(); }
}
export class GeneratedProgram {
    runtime;
    constructor(runtime = new RuntimeEnvironment()) { this.runtime = runtime; }
    prepare(target, assign, options = {}) { if (typeof target !== 'string')
        throw new Error('generated target must be a template name'); const boundAssign = generatedBindAssign(assign); const bound = generatedBindDefinitions(options.define); const registered = bound.targets.get(target); if (registered?.html !== undefined)
        return new GeneratedPreparedRender(() => registered.html); const targetName = registered?.target ?? target; const env = generatedEnv(options.env); return new GeneratedPreparedRender(() => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); context.enter(targetName, null, null); try {
        renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root);
        return context.output.toString();
    }
    finally {
        context.leave();
    } }); }
    render(target, assign, options = {}) { return this.prepare(target, assign, options).render(); }
}
