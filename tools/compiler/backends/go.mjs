import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'go';

const goSpan = span => `ast.Span{${span.join(', ')}}`;
const goLines = lines => `errs.LineIndex{${lines.join(', ')}}`;
const goResult = node => goType(node.valueType.source);

export function createTarget({ program }) {
  const target = baseTarget(language);
  target.var = (name, type, node) => program.dynamicRoot ? node.scope ? `generatedResult[${goType(type)}](scope.Lookup(frame, ${quote(name)}))` : `generatedMember[${goType(type)}](runtime, rootData, ${quote(name)})` : `${optional(type) ? 'valueOrZero(' : ''}assign.${exportedName(name)}${optional(type) ? ')' : ''}`;
  target.local = (name, type) => `generatedResult[${goType(type)}](scope.Lookup(frame, ${quote(name)}))`;
  target.set = (name, value, level) => indent(level, `scope.Locals[${quote(name)}] = generatedValue(${value})`);
  target.member = (object, key, owner, node) => owner.kind === 'any' ? `generatedMember[${goResult(node)}](runtime, ${object}, ${quote(key)})` : `${object}.${exportedName(key)}`;
  target.text = (value, level, node) => indent(level, `generatedWrite(context, ${quote(value)}, frame, ${goSpan(node.span)})`);
  target.echo = (expression, level, node) => indent(level, `generatedWrite(context, generatedEscape(runtime, ${expression}, frame, ${goSpan(node.expr.span)}), frame, ${goSpan(node.span)})`);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `{ definition := definitions.${exportedName(node.id)}
if definition == nil || definition.HTML == nil { panic(runtime.Error(frame, ${goSpan(node.span)}, errs.RuntimeBlockUndefined, ${quote(`define ${node.id} is not registered`)})) }
generatedWrite(context, *definition.HTML, frame, ${goSpan(node.span)})
}`);
    const defaults = node.inputs.filter(item => item.root).map(item => `${exportedName(item.name)}: ${emitExpression(item.root, target)}`).join(', ');
    const defined = node.inputs.map(item => `if definition.Data.${exportedName(item.name)} != nil { input.${exportedName(item.name)} = *definition.Data.${exportedName(item.name)} }`).join('\n');
    const scoped = node.inputs.filter(item => item.scope).map(item => `input.${exportedName(item.name)} = ${emitExpression(item.scope, target)}`).join('\n');
    const call = `${functionName(node.target)}(assign, definitions, input, context, runtime, rootData, blockScope)`;
    if (node.id === null) return indent(n, `{ input := ${inputName(node.target)}{${defaults}}
${scoped}
blockScope := render.NewScope()
generatedEnter(context, ${quote(node.target)}, frame, ${goSpan(node.span)})
func() { defer context.Leave(); ${call} }()
}`);
    const registryData = node.definition.template ? definitionDataName(node.definition.template) : 'struct{}';
    const registration = node.path === null
      ? `if definition == nil { panic(runtime.Error(frame, ${goSpan(node.span)}, errs.RuntimeBlockUndefined, ${quote(`define ${node.id} is not registered`)})) }`
      : `if definition == nil { definition = &Definition[${registryData}]{Template: ${quote(node.target)}}; definitions.${exportedName(node.id)} = definition } else if definition.HTML != nil || definition.Template != ${quote(node.target)} { panic(runtime.Error(frame, ${goSpan(node.span)}, errs.RuntimeBlockRedefined, ${quote(`define ${node.id} is registered with a different template`)})) }`;
    return indent(n, `{ definition := definitions.${exportedName(node.id)}
${registration}
if definition != nil && definition.HTML != nil { generatedWrite(context, *definition.HTML, frame, ${goSpan(node.span)}) } else {
    input := ${inputName(node.target)}{${defaults}}
    if definition != nil && definition.Data != nil {
${indent(2, defined)}
    }
${indent(1, scoped)}
    blockScope := render.NewScope()
    generatedEnter(context, ${quote(node.target)}, frame, ${goSpan(node.span)})
    func() { defer context.Leave(); ${call} }()
}
}`);
  };
  target.ifBlock = (node, n) => indent(n, `if definitions.${exportedName(node.id)} != nil {
${emitNodes(node.body, target, n + 1)}
}${node.otherwise ? ` else {
${emitNodes(node.otherwise, target, n + 1)}
}` : ''}`);
  target.loopMeta = (loop, field) => `generatedLoopMeta(scope, ${quote(loop)}).${exportedName(field.replace(/_$/, ''))}`;
  target.index = (object, index, _owner, node) => `generatedIndex[${goResult(node)}](runtime, ${object}, ${index})`;
  target.memberCall = (object, method, args, node) => `generatedMemberCall[${goResult(node)}](runtime, generatedValue(${object}), ${quote(method)}, []value.Value{${args.map(item => `generatedValue(${item})`).join(', ')}}, frame, ${goSpan(node.span)})`;
  target.classCall = (className, method, args, node) => `generatedClassCall[${goResult(node)}](runtime, ${quote(className)}, ${quote(method)}, []value.Value{${args.map(item => `generatedValue(${item})`).join(', ')}}, frame, ${goSpan(node.span)})`;
  target.call = (name, args, node) => `generatedCall[${goResult(node)}](runtime, ${quote(name)}, []value.Value{${args.map(item => `generatedValue(${item})`).join(', ')}}, frame, ${goSpan(node.span)})`;
  target.unary = (operator, operand, node) => `generatedUnary[${goResult(node)}](runtime, ${quote(operator)}, ${operand}, frame, ${goSpan(node.span)})`;
  target.binary = (operator, left, right, node) => {
    if (operator === '&&') return `func() bool { left := ${left}; if !generatedTruthy(runtime, left) { return false }; return generatedTruthy(runtime, ${right}) }()`;
    if (operator === '||') return `func() bool { left := ${left}; if generatedTruthy(runtime, left) { return true }; return generatedTruthy(runtime, ${right}) }()`;
    if (operator === '??') return `func() ${goResult(node)} { left := ${left}; if generatedValue(left) != nil { return left }; return ${right} }()`;
    return `generatedBinary[${goResult(node)}](runtime, ${quote(operator)}, ${left}, ${right}, frame, ${goSpan(node.span)})`;
  };
  target.ternary = (test, thenValue, elseValue, node) => `func() ${goResult(node)} { if generatedTruthy(runtime, ${test}) { return ${thenValue} }; return ${elseValue} }()`;
  target.list = (items, type) => `func() ${goType(type.source)} { result := ${goType(type.source)}{}; ${items.map(item => item.spread ? `result = append(result, generatedListSpread[${goType(type.item.source)}](runtime, ${item.value}, frame, ${goSpan(item.span)})...)` : `result = append(result, ${item.value})`).join('; ')}; return result }()`;
  target.map = (entries, type) => `func() ${goType(type.source)} { result := NewOrderedMap[${goType(type.key.source)}, ${goType(type.value.source)}](); ${entries.map(item => item.spread ? `for _, entry := range generatedMapSpread[${goType(type.key.source)}, ${goType(type.value.source)}](runtime, ${item.value}, frame, ${goSpan(item.span)}).Entries() { result.Set(entry.Key, entry.Value) }` : `result.Set(${item.value[0]}, ${item.value[1]})`).join('; ')}; return result }()`;
  target.ifNode = (node, n, scope = []) => node.branches.map((branch, index) => `${'\t'.repeat(n)}${index ? '} else if' : 'if'} generatedTruthy(runtime, ${emitExpression(branch.test, target)}) {
${emitNodes(branch.body, target, n + 1, scope)}`).join('\n') + `${'\t'.repeat(n)}}${node.otherwise ? ` else {
${emitNodes(node.otherwise, target, n + 1, scope)}
${'\t'.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const iterable = emitExpression(node.iter, target);
    return indent(n, `{ entries := generatedEntries(runtime, ${iterable}, frame, ${goSpan(node.span)})
entriesSize := len(entries)
lastIndex := entriesSize - 1
previous, hadPrevious := scope.Locals[${quote(node.name)}]
for ${name}_index, entry := range entries {
    ${name}_key, ${name}_value := entry.Key, entry.Value
    scope.Locals[${quote(node.name)}] = ${name}_value
    scope.Loops[${quote(node.name)}] = append(scope.Loops[${quote(node.name)}], &render.LoopMeta{Index: ${name}_index, Key: ${name}_key, Value: ${name}_value, Size: entriesSize, First: ${name}_index == 0, Last: ${name}_index == lastIndex})
    context.Iterations++
    generatedLimit(runtime, "iteration", context.Iterations, frame, ${goSpan(node.span)})
${emitNodes(node.body, target, n + 1)}
    scope.Loops[${quote(node.name)}] = scope.Loops[${quote(node.name)}][:len(scope.Loops[${quote(node.name)}])-1]
}
if hadPrevious { scope.Locals[${quote(node.name)}] = previous } else { delete(scope.Locals, ${quote(node.name)}) }${node.empty ? `
if entriesSize == 0 {
${emitNodes(node.empty, target, n + 1)}
}` : ''}
}`);
  };
  target.include = (node, n) => indent(n, `generatedEnter(context, ${quote(node.target)}, frame, ${goSpan(node.span)})
func() { defer context.Leave(); ${functionName(node.target)}(assign, definitions, ${inputName(node.target)}{${node.inputs.map(item => `${exportedName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')}}, context, runtime, rootData, scope) }()`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const goRecords = Object.entries(records).map(([name, members]) => `type ${name} struct { ${Object.entries(members).map(([key, type]) => `${exportedName(key)} ${goType(type)} \`json:"${key}"\``).join('; ')} }`).join('\n');
  const inputTypes = templateBodies.map(template => `type ${template.input} struct { ${[...template.inputs].map(([name, type]) => `${exportedName(name)} ${goType(type.source)} \`json:"${name}"\``).join('; ')} }`).join('\n');
  const definitionDataTypes = templateBodies.map(template => `type ${definitionDataName(template.name)} struct { ${[...template.inputs].map(([name, type]) => `${exportedName(name)} *${goType(type.source)} \`json:"${name}"\``).join('; ')} }`).join('\n');
  const definitionsType = `type Definition[T any] struct { Template string \`json:"template"\`; HTML *string \`json:"html"\`; Data *T \`json:"data"\` }\ntype Definitions struct { ${[...program.definitions].map(([name, definition]) => `${exportedName(name)} *Definition[${definition.template ? definitionDataName(definition.template) : 'struct{}'}] \`json:"${name}"\``).join('; ')} }`;
  const assignType = program.dynamicRoot ? 'type Assign struct{}' : `type Assign struct {\n${Object.entries(fields).map(([name, type]) => `\t${exportedName(name)} ${goType(type)} \`json:"${name}"\``).join('\n')}\n}`;
  return `// Generated.\npackage generated\nimport ("bytes"; "encoding/json"; "fmt"; "time"; template "github.com/polyspec/template"; "github.com/polyspec/template/ast"; "github.com/polyspec/template/errs"; "github.com/polyspec/template/functions"; "github.com/polyspec/template/render"; "github.com/polyspec/template/value")\n${goRecords}\n${assignType}\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}\ntype ArtifactManifest struct { Schema int; Mode string; Target string; Entry string; SourceDigest string; TypeDigest string; ContractDigest string; Files map[string]string }\ntype OrderedEntry[K comparable, V any] struct { Key K; Value V }\ntype OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }\nfunc NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }\nfunc (m *OrderedMap[K, V]) Set(key K, item V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = item; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, item}) }\nfunc (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }\nfunc (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }\nfunc (m OrderedMap[K, V]) generatedValue() value.Value { result := value.NewOrderedMap(); for _, entry := range m.entries { result.Set(fmt.Sprint(entry.Key), generatedValue(entry.Value)) }; return result }\nfunc (m *OrderedMap[K, V]) UnmarshalJSON(data []byte) error { decoder := json.NewDecoder(bytes.NewReader(data)); token, err := decoder.Token(); if err != nil { return err }; if token != json.Delim('{') { return fmt.Errorf("generated ordered map must be an object") }; m.entries = nil; for decoder.More() { rawKey, err := decoder.Token(); if err != nil { return err }; keyText, ok := rawKey.(string); if !ok { return fmt.Errorf("generated ordered map key is not text") }; var key K; if err := json.Unmarshal([]byte(strconvQuote(keyText)), &key); err != nil { return err }; var item V; if err := decoder.Decode(&item); err != nil { return err }; m.Set(key, item) }; _, err = decoder.Token(); return err }\nfunc strconvQuote(input string) string { data, _ := json.Marshal(input); return string(data) }`;
}

export function emitRuntime() {
  return `type generatedValueSource interface { generatedValue() value.Value }
func generatedPanic(err error) { if err != nil { panic(err) } }
func generatedValue(input any) value.Value { switch item := input.(type) { case nil: return nil; case bool: return item; case float64: return item; case string: return item; case value.SafeString: return item; case value.List: return item; case *value.OrderedMap: return item }; if source, ok := input.(generatedValueSource); ok { return source.generatedValue() }; result, err := value.Bind(input); generatedPanic(err); return result }
func generatedResult[T any](input value.Value) T { if result, ok := input.(T); ok { return result }; var result T; generatedPanic(generatedDecode(input, &result)); return result }
func generatedTruthy(runtime *render.RuntimeBindings, input any) bool { return runtime.Truthy(generatedValue(input)) }
func generatedUnary[T any](runtime *render.RuntimeBindings, operator string, input any, frame *render.Frame, span ast.Span) T { result, err := runtime.Unary(operator, generatedValue(input), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedBinary[T any](runtime *render.RuntimeBindings, operator string, left, right any, frame *render.Frame, span ast.Span) T { result, err := runtime.Binary(operator, generatedValue(left), generatedValue(right), frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedMember[T any](runtime *render.RuntimeBindings, input any, key string) T { return generatedResult[T](runtime.Member(generatedValue(input), key)) }
func generatedIndex[T any](runtime *render.RuntimeBindings, input, key any) T { return generatedResult[T](runtime.Index(generatedValue(input), generatedValue(key))) }
func generatedMemberCall[T any](runtime *render.RuntimeBindings, input value.Value, method string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.MemberCall(input, method, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedClassCall[T any](runtime *render.RuntimeBindings, className, method string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.ClassCall(className, method, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedCall[T any](runtime *render.RuntimeBindings, name string, args []value.Value, frame *render.Frame, span ast.Span) T { result, err := runtime.Call(name, args, frame, span); generatedPanic(err); return generatedResult[T](result) }
func generatedEscape(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) string { result, err := runtime.Escape(generatedValue(input), frame, span); generatedPanic(err); return result }
func generatedEntries(runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) []render.RuntimeEntry { result, err := runtime.Entries(generatedValue(input), frame, span); generatedPanic(err); return result }
func generatedListSpread[T any](runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) []T { source, err := runtime.ListSpread(generatedValue(input), frame, span); generatedPanic(err); result := make([]T, len(source)); for index, item := range source { result[index] = generatedResult[T](item) }; return result }
func generatedMapSpread[K comparable, V any](runtime *render.RuntimeBindings, input any, frame *render.Frame, span ast.Span) OrderedMap[K, V] { source, err := runtime.MapSpread(generatedValue(input), frame, span); generatedPanic(err); result := NewOrderedMap[K, V](); for _, key := range source.Keys() { result.Set(generatedResult[K](key), generatedResult[V](source.MustGet(key))) }; return result }
func generatedLoopMeta(scope *render.Scope, name string) *render.LoopMeta { result := scope.LoopMeta(name); if result == nil { panic("generated loop metadata is missing") }; return result }
func generatedWrite(context *render.Context, text string, frame *render.Frame, span ast.Span) { generatedPanic(context.Write(text, frame, &span)) }
func generatedEnter(context *render.Context, name string, frame *render.Frame, span ast.Span) { generatedPanic(context.Enter(name, frame, &span)) }
func generatedLimit(runtime *render.RuntimeBindings, kind string, count int, frame *render.Frame, span ast.Span) { generatedPanic(runtime.Limit(kind, count, frame, span)) }
func valueOrZero[T any](input *T) T { if input == nil { var zero T; return zero }; return *input }
func generatedPlain(input any) any { switch item := input.(type) { case *value.OrderedMap: result := map[string]any{}; for _, key := range item.Keys() { entry, _ := item.Get(key); result[key] = generatedPlain(entry) }; return result; case value.List: result := make([]any, len(item)); for index, entry := range item { result[index] = generatedPlain(entry) }; return result; default: return input } }
func generatedDecode(input any, output any) error { data, err := json.Marshal(generatedPlain(input)); if err != nil { return err }; return json.Unmarshal(data, output) }
func generatedEnv(options template.RenderOptions) functions.Env { env := functions.Env{Timezone: "Z", Now: float64(time.Now().Unix())}; if options.Env != nil { if options.Env.Timezone != "" { env.Timezone = options.Env.Timezone }; env.Now = options.Env.Now }; return env }`;
}

export function emitTemplates(context) {
  return context.templateBodies.map(template => {
    const typed = context.program.templates.get(template.name);
    return `func ${template.function}(assign Assign, definitions *Definitions, input ${template.input}, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) {\n\tframe := render.NewFrame(${quote(template.name)}, ${goLines(typed.lines)}, rootData)\n${[...template.inputs].map(([name]) => `scope.Locals[${quote(name)}] = generatedValue(input.${exportedName(name)})`).join('\n')}\n${template.body}\n}`;
  }).join('\n');
}

export function emitEntry(context) {
  const dispatch = context.templateBodies.filter(template => template.inputs.size === 0).map(template => `\tcase ${quote(template.name)}: ${template.function}(assign, definitions, ${template.input}{}, context, runtime, rootData, scope); return`).join('\n');
  const definitionCases = [...context.program.definitions].map(([id, definition]) => `\t\tcase ${quote(id)}:\n\t\t\tif input.HTML != nil { if ${definition.html ? 'false' : 'true'} || input.Template != "" || input.Data != nil { return nil, nil, fmt.Errorf("define.%s has an invalid html entry", id) }; plain[id] = map[string]any{"html": *input.HTML}; targets[id] = generatedTarget{html: input.HTML}; continue }\n\t\t\tif input.Template != ${quote(definition.template ?? '')} { return nil, nil, fmt.Errorf("define.%s has an invalid template", id) }; plain[id] = map[string]any{"template": input.Template, "data": generatedPlain(input.Data)}; targets[id] = generatedTarget{target: ${quote(definition.template ?? '')}}`).join('\n');
  const bindAssign = context.program.dynamicRoot ? '' : 'if err := generatedDecode(rootData, &typedAssign); err != nil { return nil, err }';
  return `func renderTemplate(target string, assign Assign, definitions *Definitions, context *render.Context, runtime *render.RuntimeBindings, rootData *value.OrderedMap, scope *render.Scope) { switch target {\n${dispatch}\n\tdefault: panic(context.Fail(errs.LoadNotFound, nil, nil, "template " + target + " does not exist"))\n} }\ntype generatedTarget struct { target string; html *string }\nfunc generatedBindDefinitions(input map[string]template.DefineInput) (*Definitions, map[string]generatedTarget, error) { _ = input; plain := map[string]any{}; targets := map[string]generatedTarget{}; for id, input := range input { _ = input; switch id {\n${definitionCases}\n\t\tdefault: return nil, nil, fmt.Errorf("define.%s is not declared", id)\n\t} }; var definitions Definitions; if err := generatedDecode(plain, &definitions); err != nil { return nil, nil, err }; return &definitions, targets, nil }\ntype GeneratedProgram struct { Runtime *template.RuntimeEnvironment }\nfunc NewGeneratedProgram(options template.Options) (*GeneratedProgram, error) { runtime, err := template.NewRuntimeEnvironment(options.Limits, options.Functions); if err != nil { return nil, err }; return &GeneratedProgram{Runtime: runtime}, nil }\ntype generatedPrepared struct { target string; assign Assign; definitions *Definitions; rootData *value.OrderedMap; env functions.Env; runtime *template.RuntimeEnvironment; html *string }\nfunc (p *generatedPrepared) Render() (output string, err error) { defer func() { if failure := recover(); failure != nil { if failureError, ok := failure.(error); ok { err = failureError } else { panic(failure) } } }(); context := render.NewContext(p.runtime, p.rootData, p.env, p.target); runtime := render.NewRuntimeBindings(context); scope := render.NewScope(); if err := context.Enter(p.target, nil, nil); err != nil { return "", err }; defer context.Leave(); if p.html != nil { if err := context.Write(*p.html, nil, nil); err != nil { return "", err } } else { renderTemplate(p.target, p.assign, p.definitions, context, runtime, p.rootData, scope) }; return context.Output(), nil }\nfunc (p *GeneratedProgram) Prepare(target any, assign any, options template.RenderOptions) (template.Prepared, error) { name, ok := target.(string); if !ok { return nil, fmt.Errorf("generated target must be a template name") }; rootData, err := value.BindMap(assign); if err != nil { return nil, err }; var typedAssign Assign; ${bindAssign}; definitions, targets, err := generatedBindDefinitions(options.Define); if err != nil { return nil, err }; resolved := targets[name]; targetName := name; if resolved.target != "" { targetName = resolved.target }; return &generatedPrepared{target: targetName, assign: typedAssign, definitions: definitions, rootData: rootData, env: generatedEnv(options), runtime: p.Runtime, html: resolved.html}, nil }\nfunc (p *GeneratedProgram) Render(target any, assign any, options template.RenderOptions) (string, error) { prepared, err := p.Prepare(target, assign, options); if err != nil { return "", err }; return prepared.Render() }\nvar _ template.Program = (*GeneratedProgram)(nil)`;
}
