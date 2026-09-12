// Generated.
import { Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, bind, bindMap } from '@polyspec/template';
const generatedRecords = { "Page": { "title": { "kind": "string", "optional": false } }, "Row": { "name": { "kind": "string", "optional": false } }, "Slot": { "template": { "kind": "string", "optional": true }, "html": { "kind": "string", "optional": true } } };
const generatedAssign = { "flag": { "kind": "boolean", "optional": false }, "dangerous": { "kind": "string", "optional": false }, "empty_list": { "kind": "list", "item": { "kind": "string", "optional": false }, "optional": false }, "empty_map": { "kind": "map", "key": { "kind": "string", "optional": false }, "value": { "kind": "string", "optional": false }, "optional": false }, "page": { "kind": "record", "name": "Page", "optional": false }, "numbers": { "kind": "list", "item": { "kind": "number", "optional": false }, "optional": false }, "lookup": { "kind": "map", "key": { "kind": "string", "optional": false }, "value": { "kind": "string", "optional": false }, "optional": false }, "rows": { "kind": "list", "item": { "kind": "record", "name": "Row", "optional": false }, "optional": false } };
const generatedDefinitionSpecs = { "content": { "field": "content", "target": "card.tpl", "html": true, "input": { "label": { "kind": "string", "optional": false } } }, "layout": { "field": "layout", "target": "layout.tpl", "html": false, "input": {} } };
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
function render_card_tpl(assign, definitions, input, context, runtime, rootData, scope) {
    const frame = new Frame("card.tpl", [0, 30], rootData);
    scope.locals.set("label", input.label);
    context.at(frame, [0, 16]);
    context.output.write("<p class=\"card\">");
    context.at(frame, [16, 25]);
    context.output.write(runtime.escape(scope.lookup(frame, "label"), frame, [19, 24]));
    context.at(frame, [25, 30]);
    context.output.write("</p>\n");
}
function render_layout_tpl(assign, definitions, input, context, runtime, rootData, scope) {
    const frame = new Frame("layout.tpl", [0, 29, 66, 76, 100, 137, 191, 268, 305, 392, 463, 468, 483, 563, 567, 582, 586, 592, 608, 655, 684, 695], rootData);
    scope.locals.set("values", [0, ...runtime.listSpread(assign.numbers, frame, [16, 26])]);
    scope.locals.set("merged", new Map([...runtime.mapSpread(assign.lookup, frame, [42, 51]), [runtime.stringify("z", frame, [53, 56]), "Z"]]));
    context.at(frame, [66, 80]);
    context.output.write("<section>\n<h1>");
    context.at(frame, [80, 94]);
    context.output.write(runtime.escape((assign.page)?.title, frame, [83, 93]));
    context.at(frame, [94, 119]);
    context.output.write("</h1>\n<p class=\"escaped\">");
    context.at(frame, [119, 132]);
    context.output.write(runtime.escape(assign.dangerous, frame, [122, 131]));
    context.at(frame, [132, 156]);
    context.output.write("</p>\n<p class=\"logical\">");
    context.at(frame, [156, 171]);
    context.output.write(runtime.escape((() => { const left = assign.flag; return runtime.truthy(left) ? runtime.truthy("x") : false; })(), frame, [159, 170]));
    context.at(frame, [171, 172]);
    context.output.write("|");
    context.at(frame, [172, 186]);
    context.output.write(runtime.escape((() => { const left = false; return runtime.truthy(left) ? true : runtime.truthy(2); })(), frame, [175, 185]));
    context.at(frame, [186, 219]);
    context.output.write("</p>\n<p class=\"empty-truthiness\">");
    context.at(frame, [219, 241]);
    context.output.write(runtime.escape((() => { const left = assign.empty_list; return runtime.truthy(left) ? runtime.truthy(assign.flag) : false; })(), frame, [222, 240]));
    context.at(frame, [241, 242]);
    context.output.write("|");
    context.at(frame, [242, 263]);
    context.output.write(runtime.escape((() => { const left = assign.empty_map; return runtime.truthy(left) ? runtime.truthy(assign.flag) : false; })(), frame, [245, 262]));
    context.at(frame, [263, 271]);
    context.output.write("</p>\n<p>");
    context.at(frame, [271, 284]);
    context.output.write(runtime.escape(runtime.index(scope.lookup(frame, "values"), 1), frame, [274, 283]));
    context.at(frame, [284, 285]);
    context.output.write("|");
    context.at(frame, [285, 300]);
    context.output.write(runtime.escape(runtime.index(scope.lookup(frame, "merged"), "z"), frame, [288, 299]));
    context.at(frame, [300, 305]);
    context.output.write("</p>\n");
    if (runtime.truthy((() => { const left = assign.flag; return runtime.truthy(left) ? runtime.truthy(runtime.binary("==", (assign.page)?.title, "Guide", frame, [316, 337])) : false; })())) {
        context.at(frame, [338, 362]);
        context.output.write("<strong>matched</strong>");
    }
    else {
        context.at(frame, [365, 388]);
        context.output.write("<strong>missed</strong>");
    }
    context.at(frame, [391, 395]);
    context.output.write("\n<p>");
    context.at(frame, [395, 418]);
    context.output.write(runtime.escape((runtime.truthy(assign.flag) ? "yes" : "no"), frame, [398, 417]));
    context.at(frame, [418, 419]);
    context.output.write("|");
    context.at(frame, [419, 429]);
    context.output.write(runtime.escape(runtime.binary("+", runtime.unary("-", 1, frame, [422, 424]), 3, frame, [422, 428]), frame, [422, 428]));
    context.at(frame, [429, 430]);
    context.output.write("|");
    context.at(frame, [430, 458]);
    context.output.write(runtime.escape(runtime.call("default", ["", "fallback"], frame, [433, 457]), frame, [433, 457]));
    context.at(frame, [458, 468]);
    context.output.write("</p>\n<ul>\n");
    {
        const row_entries = runtime.entries(assign.rows, frame, [468, 585]);
        const row_size = row_entries.length;
        const row_last_index = row_size - 1;
        const row_had = scope.locals.has("row");
        const row_previous = scope.locals.get("row");
        try {
            for (let row_index = 0; row_index < row_size; row_index += 1) {
                const [row_key, row_value] = row_entries[row_index];
                scope.locals.set("row", row_value);
                const row_first = row_index === 0;
                const row_last = row_index === row_last_index;
                context.iterations += 1;
                runtime.limit('iteration', context.iterations, frame, [468, 585]);
                context.at(frame, [483, 487]);
                context.output.write("<li>");
                context.at(frame, [487, 501]);
                context.output.write(runtime.escape(row_index, frame, [490, 500]));
                context.at(frame, [501, 502]);
                context.output.write("/");
                context.at(frame, [502, 515]);
                context.output.write(runtime.escape(row_size, frame, [505, 514]));
                context.at(frame, [515, 516]);
                context.output.write(":");
                context.at(frame, [516, 528]);
                context.output.write(runtime.escape(scope.lookup(frame, "row")?.name, frame, [519, 527]));
                context.at(frame, [528, 529]);
                context.output.write(":");
                context.at(frame, [529, 543]);
                context.output.write(runtime.escape(row_first, frame, [532, 542]));
                context.at(frame, [543, 544]);
                context.output.write(":");
                context.at(frame, [544, 557]);
                context.output.write(runtime.escape(row_last, frame, [547, 556]));
                context.at(frame, [557, 563]);
                context.output.write("</li>\n");
            }
        }
        finally {
            if (row_had)
                scope.locals.set("row", row_previous);
            else
                scope.locals.delete("row");
        }
        if (row_size === 0) {
            context.at(frame, [567, 582]);
            context.output.write("<li>empty</li>\n");
        }
    }
    context.at(frame, [586, 592]);
    context.output.write("</ul>\n");
    context.enter("partial.tpl", frame, [592, 607]);
    try {
        render_partial_tpl(assign, definitions, { values: scope.lookup(frame, "values") }, context, runtime, rootData, scope);
    }
    finally {
        context.leave();
    }
    if (definitions.content !== undefined) {
        context.at(frame, [620, 634]);
        context.output.write("<p>defined</p>");
    }
    else {
        context.at(frame, [637, 651]);
        context.output.write("<p>missing</p>");
    }
    context.at(frame, [654, 655]);
    context.output.write("\n");
    {
        let definition = definitions.content;
        if (definition === undefined)
            throw runtime.error(frame, [655, 683], 'E_RUNTIME_BLOCK_UNDEFINED', "define content is not registered");
        if (definition?.html !== undefined) {
            context.at(frame, [655, 683]);
            context.output.write(definition.html);
        }
        else {
            const input = Object.assign({}, definition?.data ?? {}, { label: (assign.page)?.title });
            const blockScope = new Scope();
            context.enter("card.tpl", frame, [655, 683]);
            try {
                render_card_tpl(assign, definitions, input, context, runtime, rootData, blockScope);
            }
            finally {
                context.leave();
            }
        }
    }
    context.at(frame, [684, 695]);
    context.output.write("</section>\n");
}
function render_partial_tpl(assign, definitions, input, context, runtime, rootData, scope) {
    const frame = new Frame("partial.tpl", [0, 38], rootData);
    scope.locals.set("values", input.values);
    context.at(frame, [0, 20]);
    context.output.write("<p class=\"included\">");
    context.at(frame, [20, 33]);
    context.output.write(runtime.escape(runtime.index(scope.lookup(frame, "values"), 2), frame, [23, 32]));
    context.at(frame, [33, 38]);
    context.output.write("</p>\n");
}
function renderTemplate(target, assign, definitions, context, runtime, rootData, scope) {
    switch (target) {
        case "layout.tpl":
            render_layout_tpl(assign, definitions, {}, context, runtime, rootData, scope);
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
        return new GeneratedPreparedRender(() => registered.html); const targetName = registered?.target ?? target; const env = generatedEnv(options.env); return new GeneratedPreparedRender(() => { const context = new RenderContext(this.runtime, boundAssign.root, env, targetName); const runtime = new RuntimeBindings(context); const scope = new Scope(); context.enter(targetName, null, null); try {
        renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root, scope);
        return context.output.toString();
    }
    finally {
        context.leave();
    } }); }
    render(target, assign, options = {}) { return this.prepare(target, assign, options).render(); }
}
