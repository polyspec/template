import { BindError, Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, TemplateError, bindData, bindMap, checkText, internalBoundary } from "@polyspec/template";
function generatedTypeError(value, path, expected) {
  return new Error(value === null || value === void 0 ? path + " is required" : path + " is not " + expected);
}
function generatedDataObject(value, path) {
  if (value instanceof Map) return value;
  throw new Error(path + " is not an object");
}
function generatedPlain(value) {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function generatedObject(value, path) {
  if (value instanceof Map) return value;
  throw generatedTypeError(value, path, "an object");
}
function generatedString(value, path) {
  if (typeof value === "string") return value;
  throw generatedTypeError(value, path, "a string");
}
function generatedDecodeAssign(value, path) {
  const object = generatedObject(value, path);
  return { heading: generatedString(object.get("heading"), path + ".heading") };
}
function generatedDecodeData_Input_layout_tpl(value, path) {
  generatedDataObject(value, path);
  return {};
}
function generatedBindAssign(value) {
  const root = bindMap(value);
  return { assign: generatedDecodeAssign(root, "assign"), root };
}
function generatedBindDefinitions(input) {
  const definitions = {};
  const targets = /* @__PURE__ */ new Map();
  if (input === void 0 || input === null) return { definitions, targets };
  if (!generatedPlain(input)) throw new Error("define is not an object");
  const entries = Object.entries(input);
  for (const [id, raw] of entries) {
    checkText(id);
    switch (id) {
      case "content": {
        if (typeof raw === "string") {
          throw new Error("define.content has an invalid template");
        }
        if (typeof raw !== "object" || raw === null) throw new Error("define.content is not an object");
        const template = "template" in raw ? raw.template : void 0;
        const html = "html" in raw ? raw.html : void 0;
        const data = "data" in raw && raw.data !== void 0 ? bindData(raw.data) : void 0;
        if (typeof html === "string") {
          if (template !== void 0 || data !== void 0) throw new Error("define.content has an invalid html entry");
          definitions.content = { html };
          targets.set("content", { target: null, html });
          break;
        }
        throw new Error("define.content has an invalid template");
      }
      case "layout": {
        if (typeof raw === "string") {
          if (raw !== "layout.tpl") throw new Error("define.layout has an invalid template");
          definitions.layout = { template: "layout.tpl" };
          targets.set("layout", { target: "layout.tpl" });
          break;
        }
        if (typeof raw !== "object" || raw === null) throw new Error("define.layout is not an object");
        const template = "template" in raw ? raw.template : void 0;
        const html = "html" in raw ? raw.html : void 0;
        const data = "data" in raw && raw.data !== void 0 ? bindData(raw.data) : void 0;
        if (typeof html === "string") {
          throw new Error("define.layout has an invalid html entry");
        }
        if (template !== "layout.tpl") throw new Error("define.layout has an invalid template");
        definitions.layout = { template: "layout.tpl", data: data === void 0 ? {} : generatedDecodeData_Input_layout_tpl(data, "define.layout.data") };
        targets.set("layout", { target: "layout.tpl" });
        break;
      }
      default:
        throw new Error("define." + id + " is not declared");
    }
  }
  return { definitions, targets };
}
function render_layout_tpl(assign, definitions, _input, context, runtime, rootData, _scope) {
  const frame = new Frame("layout.tpl", [0, 25, 46, 58, 69], rootData);
  context.at(frame, [0, 29]);
  context.output.write('<section class="notice">\n<h1>');
  context.at(frame, [29, 40]);
  context.output.write(runtime.escape(assign.heading, frame, [32, 39]));
  context.at(frame, [40, 46]);
  context.output.write("</h1>\n");
  {
    const definition = definitions.content;
    if (definition?.html === void 0) throw runtime.error(frame, [46, 57], "E_RUNTIME_BLOCK_UNDEFINED", "define content is not registered");
    context.at(frame, [46, 57]);
    context.output.write(definition.html);
  }
  context.at(frame, [58, 69]);
  context.output.write("</section>\n");
}
function renderTemplate(target, assign, definitions, context, runtime, rootData, scope) {
  switch (target) {
    case "layout.tpl":
      render_layout_tpl(assign, definitions, {}, context, runtime, rootData, scope);
      return;
    default:
      throw context.fail("E_LOAD_NOT_FOUND", null, null, "template " + target + " does not exist");
  }
}
function generatedEnv(input) {
  if (input === void 0 || input === null) return { timezone: "Z", now: Math.floor(Date.now() / 1e3) };
  if (!generatedPlain(input)) throw new BindError("E_DATA_UNSUPPORTED_TYPE", "env is not an object");
  const timezone = ("timezone" in input ? input.timezone : void 0) ?? "Z";
  const now = ("now" in input ? input.now : void 0) ?? Math.floor(Date.now() / 1e3);
  if (typeof timezone !== "string") throw new BindError("E_DATA_UNSUPPORTED_TYPE", "env.timezone is not a string");
  if (typeof now !== "number") throw new BindError("E_DATA_UNSUPPORTED_TYPE", "env.now is not a number");
  return { timezone, now };
}
class GeneratedPreparedRender {
  name;
  execute;
  constructor(name, execute) {
    this.name = name;
    this.execute = execute;
  }
  render() {
    return internalBoundary(this.name, this.execute);
  }
}
export class GeneratedProgram {
  runtime;
  constructor(runtime = new RuntimeEnvironment()) {
    this.runtime = runtime;
  }
  prepare(target, assign, options = {}) {
    if (typeof target !== "string") throw new Error("generated target must be a template name");
    return internalBoundary(target, () => this.prepareBound(target, assign, options));
  }
  prepareBound(target, assign, options) {
    let boundAssign;
    let bound;
    let env;
    try {
      boundAssign = generatedBindAssign(assign);
      bound = generatedBindDefinitions(options.define);
      env = generatedEnv(options.env);
    } catch (error) {
      if (error instanceof BindError) throw new TemplateError({ code: error.code, template: target, line: 0, col: 0, offset: 0, end: 0, message: error.message });
      throw error;
    }
    const registered = bound.targets.get(target);
    const html = registered?.html;
    if (html !== void 0) return new GeneratedPreparedRender(target, () => html);
    const targetName = registered?.target ?? target;
    return new GeneratedPreparedRender(target, () => {
      const context = new RenderContext(this.runtime, boundAssign.root, env, targetName);
      const runtime = new RuntimeBindings(context);
      const scope = new Scope();
      context.enter(targetName, null, null);
      try {
        renderTemplate(targetName, boundAssign.assign, bound.definitions, context, runtime, boundAssign.root, scope);
        return context.output.toString();
      } finally {
        context.leave();
      }
    });
  }
  render(target, assign, options = {}) {
    return this.prepare(target, assign, options).render();
  }
}
