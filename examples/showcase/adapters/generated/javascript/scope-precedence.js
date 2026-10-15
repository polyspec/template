import { BindError, Frame, RenderContext, RuntimeBindings, RuntimeEnvironment, Scope, TemplateError, bindData, bindMap, checkText, internalBoundary } from "@polyspec/template";
function generatedTypeError(value, path, expected) {
  return new Error(value === null || value === void 0 ? path + " is required" : path + " is not " + expected);
}
function generatedChecked(decode, value, path, runtime, frame, span) {
  try {
    return decode(value, path);
  } catch (error) {
    if (error instanceof Error) throw runtime.error(frame, span, "E_RUNTIME_TYPE", error.message);
    throw error;
  }
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
function generatedOptional(decode) {
  return (value, path) => value === null || value === void 0 ? null : decode(value, path);
}
function generatedDecode_Page(value, path) {
  const object = generatedObject(value, path);
  return { title: generatedString(object.get("title"), path + ".title") };
}
function generatedDecodeAssign(value, path) {
  const object = generatedObject(value, path);
  return { page: generatedDecode_Page(object.get("page"), path + ".page"), root_label: generatedString(object.get("root_label"), path + ".root_label"), defined_label: generatedString(object.get("defined_label"), path + ".defined_label") };
}
function generatedDecodeData_Input_content_tpl(value, path) {
  const object = generatedDataObject(value, path);
  const data = {};
  if (object.has("title")) data.title = generatedString(object.get("title"), path + ".title");
  if (object.has("root_label")) data.root_label = generatedString(object.get("root_label"), path + ".root_label");
  if (object.has("defined_label")) data.defined_label = generatedString(object.get("defined_label"), path + ".defined_label");
  if (object.has("layout_local")) data.layout_local = generatedOptional(generatedString)(object.get("layout_local"), path + ".layout_local");
  return data;
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
          if (raw !== "content.tpl") throw new Error("define.content has an invalid template");
          definitions.content = { template: "content.tpl" };
          targets.set("content", { target: "content.tpl" });
          break;
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
        if (template !== "content.tpl") throw new Error("define.content has an invalid template");
        definitions.content = { template: "content.tpl", data: data === void 0 ? {} : generatedDecodeData_Input_content_tpl(data, "define.content.data") };
        targets.set("content", { target: "content.tpl" });
        break;
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
function render_content_tpl(_assign, _definitions, input, context, runtime, rootData, scope) {
  const frame = new Frame("content.tpl", [0, 10, 29, 64, 105, 164, 175], rootData);
  scope.locals.set("title", input.title);
  scope.locals.set("root_label", input.root_label);
  scope.locals.set("defined_label", input.defined_label);
  scope.locals.set("layout_local", input.layout_local);
  context.at(frame, [0, 14]);
  context.output.write("<article>\n<h1>");
  context.at(frame, [14, 23]);
  context.output.write(runtime.escape(input.title, frame, [17, 22]));
  context.at(frame, [23, 45]);
  context.output.write('</h1>\n<p class="root">');
  context.at(frame, [45, 59]);
  context.output.write(runtime.escape(input.root_label, frame, [48, 58]));
  context.at(frame, [59, 83]);
  context.output.write('</p>\n<p class="defined">');
  context.at(frame, [83, 100]);
  context.output.write(runtime.escape(input.defined_label, frame, [86, 99]));
  context.at(frame, [100, 122]);
  context.output.write('</p>\n<p class="local">');
  context.at(frame, [122, 159]);
  context.output.write(runtime.escape(generatedChecked(generatedString, runtime.call("default", [input.layout_local, "missing"], frame, [125, 158]), 'default(layout_local, "missing")', runtime, frame, [125, 158]), frame, [125, 158]));
  context.at(frame, [159, 175]);
  context.output.write("</p>\n</article>\n");
}
function render_layout_tpl(assign, definitions, input, context, runtime, rootData, scope) {
  const frame = new Frame("layout.tpl", [0, 44, 68, 97, 108], rootData);
  const local_layout_local_1 = "visible only in layout";
  scope.locals.set("layout_local", local_layout_local_1);
  context.at(frame, [44, 68]);
  context.output.write('<section class="scope">\n');
  {
    let definition = definitions.content;
    if (definition === void 0) throw runtime.error(frame, [68, 96], "E_RUNTIME_BLOCK_UNDEFINED", "define content is not registered");
    if (definition?.html !== void 0) {
      context.at(frame, [68, 96]);
      context.output.write(definition.html);
    } else {
      const input2 = { title: assign.page.title, root_label: definition?.data?.root_label !== void 0 ? definition.data.root_label : assign.root_label, defined_label: definition?.data?.defined_label !== void 0 ? definition.data.defined_label : assign.defined_label, layout_local: definition?.data?.layout_local !== void 0 ? definition.data.layout_local : null };
      const blockScope = new Scope();
      context.enter("content.tpl", frame, [68, 96]);
      try {
        render_content_tpl(assign, definitions, input2, context, runtime, rootData, blockScope);
      } finally {
        context.leave();
      }
    }
  }
  context.at(frame, [97, 108]);
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
