import {
  baseTarget, definitionDataName, emitExpression, emitNodes, exportedName,
  fieldName, functionName, goType, indent, inputName, optional,
  phpDefinitionDataField, phpField, phpInputField, phpType, quote,
  rustType, tsField,
} from '../backend-support.mjs';

export const language = 'go';

export function createTarget() {
  const target = baseTarget(language);
  target.block = (node, n) => {
    if (node.target === null) return indent(n, `{ definition := definitions.${exportedName(node.id)}\nif definition == nil || definition.HTML == nil { panic(${quote(`generated definition ${node.id} requires html`)}) }\nout.WriteString(*definition.HTML)\n}`);
    const defaults = node.inputs.filter(item => item.root).map(item => `${exportedName(item.name)}: ${emitExpression(item.root, target)}`).join(', ');
    const defined = node.inputs.map(item => `if definition.Data.${exportedName(item.name)} != nil { input.${exportedName(item.name)} = *definition.Data.${exportedName(item.name)} }`).join('\n');
    const scoped = node.inputs.filter(item => item.scope).map(item => `input.${exportedName(item.name)} = ${emitExpression(item.scope, target)}`).join('\n');
    if (node.id === null) return indent(n, `{ input := ${inputName(node.target)}{${defaults}}\n${scoped}\nout.WriteString(${functionName(node.target)}(assign, definitions, input))\n}`);
    const missing = node.path === null ? `if definition == nil { panic(${quote(`generated definition ${node.id} is missing`)}) }` : '';
    return indent(n, `{ definition := definitions.${exportedName(node.id)}\n${missing}\nif definition != nil && definition.HTML != nil { out.WriteString(*definition.HTML) } else {\n    input := ${inputName(node.target)}{${defaults}}\n    if definition != nil && definition.Data != nil {\n${indent(2, defined)}\n    }\n${indent(1, scoped)}\n    out.WriteString(${functionName(node.target)}(assign, definitions, input))\n}\n}`);
  };
  target.ifBlock = (node, n) => indent(n, `if definitions.${exportedName(node.id)} != nil {\n${emitNodes(node.body, target, n + 1)}\n}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1)}\n}` : ''}`);
  target.loopMeta = (loop, field) => `${fieldName(loop)}_${field.replace(/_$/, '')}`;
  target.index = (object, index, type) => type.kind === 'map' ? `generatedMapGet(${object}, ${index})` : `generatedListGet(${object}, int(${index}))`;
  target.call = (name, args) => {
    if (name !== 'default') throw new Error(`compiler: function ${name} reached the Go backend without support`);
    return `generatedDefault(${args.join(', ')})`;
  };
  target.unary = (op, operand) => `generatedUnary(${quote(op)}, ${operand})`;
  target.binary = (op, left, right) => `generatedBinary(${quote(op)}, ${left}, ${right})`;
  target.ternary = (test, thenValue, elseValue) => `generatedTernary(generatedTruthy(${test}), ${thenValue}, ${elseValue})`;
  target.list = (items, type) => `func() ${goType(type.source)} { result := ${goType(type.source)}{}; ${items.map(item => item.spread ? `result = append(result, ${item.value}...)` : `result = append(result, ${item.value})`).join('; ')}; return result }()`;
  target.map = (entries, type) => `func() ${goType(type.source)} { result := NewOrderedMap[${goType(type.key.source)}, ${goType(type.value.source)}](); ${entries.map(item => item.spread ? `for _, entry := range ${item.value}.Entries() { result.Set(entry.Key, entry.Value) }` : `result.Set(${item.value[0]}, ${item.value[1]})`).join('; ')}; return result }()`;
  target.ifNode = (node, n, scope = []) => node.branches.map((b, i) => `${'\t'.repeat(n)}${i ? '} else if' : 'if'} generatedTruthy(${emitExpression(b.test, target)}) {\n${emitNodes(b.body, target, n + 1, scope)}`).join('\n') + `${'\t'.repeat(n)}}${node.otherwise ? ` else {\n${emitNodes(node.otherwise, target, n + 1, scope)}\n${'\t'.repeat(n)}}` : ''}`;
  target.forNode = (node, n) => {
    const name = fieldName(node.name);
    const iterable = emitExpression(node.iter, target);
    const isMap = node.iter.valueType.kind === 'map';
    const source = isMap ? `${iterable}.Entries()` : iterable;
    const binding = isMap ? `${name}_key, ${name}_value := entry.Key, entry.Value` : `${name}_key, ${name}_value := float64(${name}_index), entry`;
    return indent(n, `{ entries := ${source}\nfor ${name}_index, entry := range entries {\n    ${binding}\n    _ = ${name}_key\n    ${name} := ${name}_value\n    ${name}_size := float64(len(entries))\n    ${name}_first := ${name}_index == 0\n    ${name}_last := ${name}_index + 1 == len(entries)\n${emitNodes(node.body, target, n + 1)}\n}${node.empty ? `\nif len(entries) == 0 {\n${emitNodes(node.empty, target, n + 1)}\n}` : ''}\n}`);
  };
  target.include = (node, n) => indent(n, `out.WriteString(${functionName(node.target)}(assign, definitions, ${inputName(node.target)}{${node.inputs.map(item => `${exportedName(item.name)}: ${emitExpression(item.value, target)}`).join(', ')}}))`);
  return target;
}

export function emitDeclarations(context) {
  const { program, manifest, templateBodies } = context;
  const fields = manifest.fields ?? {};
  const records = { ...(manifest.records ?? {}), ...(manifest.recordsExtra ?? {}) };
  const goRecords = Object.entries(records).map(([name, members]) => `type ${name} struct { ${Object.entries(members).map(([key, type]) => `${exportedName(key)} ${goType(type)}`).join('; ')} }`).join('\n');
  const inputTypes = templateBodies.map(template => `type ${template.input} struct { ${[...template.inputs].map(([name, type]) => `${exportedName(name)} ${goType(type.source)}`).join('; ')} }`).join('\n');
  const definitionDataTypes = templateBodies.map(template => `type ${definitionDataName(template.name)} struct { ${[...template.inputs].map(([name, type]) => `${exportedName(name)} *${goType(type.source)}`).join('; ')} }`).join('\n');
  const definitionsType = `type Definition[T any] struct { HTML *string; Data *T }\ntype Definitions struct { ${[...program.definitions].map(([name, definition]) => `${exportedName(name)} *Definition[${definition.template ? definitionDataName(definition.template) : 'struct{}'}]`).join('; ')} }`;
  return `// Generated.\npackage generated\nimport ("fmt"; "reflect"; "strings")\n${goRecords}\ntype Assign struct {\n${Object.entries(fields).map(([name, type]) => `\t${exportedName(name)} ${goType(type)}`).join('\n')}\n}\n${inputTypes}\n${definitionDataTypes}\n${definitionsType}\ntype OrderedEntry[K comparable, V any] struct { Key K; Value V }\ntype OrderedMap[K comparable, V any] struct { entries []OrderedEntry[K, V] }\nfunc NewOrderedMap[K comparable, V any]() OrderedMap[K, V] { return OrderedMap[K, V]{} }\nfunc (m *OrderedMap[K, V]) Set(key K, value V) { for index := range m.entries { if m.entries[index].Key == key { m.entries[index].Value = value; return } }; m.entries = append(m.entries, OrderedEntry[K, V]{key, value}) }\nfunc (m OrderedMap[K, V]) Get(key K) (V, bool) { for _, entry := range m.entries { if entry.Key == key { return entry.Value, true } }; var zero V; return zero, false }\nfunc (m OrderedMap[K, V]) Entries() []OrderedEntry[K, V] { return m.entries }`;
}

export function emitRuntime() {
  return `func generatedMapGet[K comparable, V any](value OrderedMap[K, V], key K) V { result, _ := value.Get(key); return result }\nfunc generatedListGet[T any](value []T, index int) T { if index >= 0 && index < len(value) { return value[index] }; var zero T; return zero }\nfunc generatedTernary[T any](test bool, yes, no T) T { if test { return yes }; return no }\nfunc generatedEscape(value any) string { if value == nil { return "" }; return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\\\"", "&quot;", "'", "&#39;").Replace(fmt.Sprint(value)) }\nfunc generatedTruthy(value any) bool { if value == nil { return false }; reflected := reflect.ValueOf(value); switch reflected.Kind() { case reflect.Bool: return reflected.Bool(); case reflect.Float32, reflect.Float64: return reflected.Float() != 0; case reflect.String, reflect.Array, reflect.Slice, reflect.Map: return reflected.Len() != 0; case reflect.Struct: field := reflected.FieldByName("entries"); if field.IsValid() { return field.Len() != 0 } }; return true }\nfunc generatedUnary(op string, value any) any { if op == "!" { return !generatedTruthy(value) }; return -value.(float64) }\nfunc generatedBinary(op string, left, right any) any { switch op { case "&&": return generatedTruthy(left) && generatedTruthy(right); case "||": return generatedTruthy(left) || generatedTruthy(right); case "??": if left != nil { return left }; return right; case "==", "===": return fmt.Sprint(left) == fmt.Sprint(right); case "!=", "!==": return fmt.Sprint(left) != fmt.Sprint(right); case "+": if _, ok := left.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; if _, ok := right.(string); ok { return fmt.Sprint(left)+fmt.Sprint(right) }; return left.(float64)+right.(float64); case "-": return left.(float64)-right.(float64); case "*": return left.(float64)*right.(float64); case "/": return left.(float64)/right.(float64); case "%": return float64(int64(left.(float64))%int64(right.(float64))); case "<": return fmt.Sprint(left) < fmt.Sprint(right); case ">": return fmt.Sprint(left) > fmt.Sprint(right); case "<=": return fmt.Sprint(left) <= fmt.Sprint(right); case ">=": return fmt.Sprint(left) >= fmt.Sprint(right) }; panic("unsupported generated operator: "+op) }\nfunc generatedDefault(value, fallback any) any { if generatedTruthy(value) { return value }; return fallback }\nfunc valueOrZero[T any](value *T) T { if value == nil { var zero T; return zero }; return *value }`;
}

export function emitTemplates(context) {
  return context.templateBodies.map(template => `func ${template.function}(assign Assign, definitions Definitions, input ${template.input}) string { var out strings.Builder\n${[...template.inputs].map(([name]) => `${fieldName(name)} := input.${exportedName(name)}`).join('\n')}\n${template.body}\n return out.String() }`).join('\n');
}

export function emitEntry(context) {
  const dispatch = context.templateBodies.filter(template => template.inputs.size === 0).map(template => `\tcase ${quote(template.name)}: return ${template.function}(assign, definitions, ${template.input}{})`).join('\n');
  return `func RenderTemplate(target string, assign Assign, definitions Definitions) string { switch target {\n${dispatch}\n\tdefault: panic("generated template is missing or requires inputs: " + target)\n} }\nfunc Render(assign Assign, definitions Definitions) string { return RenderTemplate(${quote(context.program.entry)}, assign, definitions) }\nvar _ = fmt.Fprint`;
}
