// AST-10: native serializers must preserve every public AST shape and field.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseSync } from 'oxc-parser';
import { jsonDocument } from '../../scripts/json-document.mts';
import { caseIds, casesDir } from '../runner/case-list.mts';

interface Definition { properties?: Record<string, unknown> }
const schema = jsonDocument<{ definitions: Record<string, Definition> }>('AST schema', {
  type: 'object', required: ['definitions'], properties: {
    definitions: { type: 'object', additionalProperties: {
      type: 'object', properties: { properties: { type: 'object' } },
    } },
  },
}).read('contracts/schema/ast.schema.json');

const shapes = Object.entries(schema.definitions).filter(([name, definition]) =>
  definition.properties !== undefined && name !== 'Node' && name !== 'Expr');

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

test('native decoder round-trip fixtures exercise every AST shape and field', { timeout: 30_000 }, () => {
  const found = new Map<string, Set<string>>();
  function visit(value: unknown): void {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!record(value)) return;
    const name = typeof value.type === 'string' ? value.type
      : 'test' in value && 'body' in value && 'span' in value ? 'IfBranch'
      : 'name' in value && 'expr' in value ? 'ScopeItem'
      : 'key' in value && 'value' in value ? 'MapEntry' : undefined;
    if (name !== undefined) {
      const fields = found.get(name) ?? new Set<string>();
      for (const field of Object.keys(value)) fields.add(field);
      found.set(name, fields);
    }
    for (const item of Object.values(value)) visit(item);
  }
  for (const id of caseIds()) {
    const file = join(casesDir, id, 'expected.ast.json');
    if (existsSync(file)) { const value: unknown = JSON.parse(readFileSync(file, 'utf8')); visit(value); }
  }
  const extra: unknown = JSON.parse(readFileSync('tests/fixtures/ast-decode/class-call.json', 'utf8'));
  visit(extra);
  for (const [name, definition] of shapes) {
    assert.deepEqual([...found.get(name) ?? []].sort(), Object.keys(definition.properties ?? {}).sort(), name);
  }
});

test('TypeScript AST public interfaces expose exactly the schema fields', { timeout: 30_000 }, () => {
  const { program, errors } = parseSync('ast.ts', readFileSync('packages/ts/src/ast.ts', 'utf8'));
  assert.deepEqual(errors, []);
  const interfaces = new Map(program.body.flatMap(statement => {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration?.type !== 'TSInterfaceDeclaration') return [];
    return [[statement.declaration.id.name, statement.declaration] as const];
  }));
  for (const [name, definition] of shapes) {
    const native = name === 'Map' ? 'MapLiteral' : name;
    const declaration = interfaces.get(native);
    assert.ok(declaration !== undefined, `${native} is no public interface`);
    const fields = declaration.body.body.map(member => {
      assert.ok(member.type === 'TSPropertySignature' && member.key.type === 'Identifier', `${native}: unnamed field`);
      return member.key.name;
    });
    assert.deepEqual(fields.sort(), Object.keys(definition.properties ?? {}).sort(), name);
  }
});

interface ApiUnit {
  id: string;
  kind: string;
  requirements: string[];
  symbols?: { implementation: string; symbol: string }[];
}

test('every schema shape and field names its native public representation', { timeout: 30_000 }, () => {
  const config = jsonDocument<{ units: ApiUnit[] }>('API declarations', {
    type: 'object', required: ['units'], properties: { units: { type: 'array', items: {
      type: 'object', required: ['id', 'kind', 'requirements'], properties: {
        id: { type: 'string' }, kind: { type: 'string' }, requirements: { type: 'array', items: { type: 'string' } },
        symbols: { type: 'array', items: { type: 'object', required: ['implementation', 'symbol'], properties: {
          implementation: { type: 'string' }, symbol: { type: 'string' },
        } } },
      },
    } } },
  }).read('config/parity.json');
  const nodes = new Set(['Text', 'Echo', 'If', 'For', 'Set', 'Include', 'Block', 'IfBlock']);
  const structs = new Set(['Template', 'Comment', 'IfBranch', 'ScopeItem']);
  const alias: Record<string, string> = { Set: 'SetNode', LoopMeta: 'LoopMetaExpression', Map: 'MapLiteral' };
  for (const [name, definition] of shapes) {
    const native = alias[name] ?? name;
    const rust = structs.has(name) ? name : name === 'MapEntry' ? 'MapEntry::Entry'
      : `${nodes.has(name) ? 'Node' : 'Expr'}::${name}`;
    for (const field of [undefined, ...Object.keys(definition.properties ?? {})]) {
      const id = `api-ast-shape-${name.toLowerCase()}${field === undefined ? '' : `-${field.toLowerCase()}`}`;
      const unit = config.units.find(item => item.id === id);
      assert.ok(unit !== undefined, `${id} has no API declaration`);
      assert.equal(unit.kind, 'api');
      assert.ok(unit.requirements.includes('AST-10'), id);
      const rustField = field !== undefined && field !== 'type' && structs.has(name) ? `::${field}` : '';
      const goField = field === undefined ? '' : field === 'id' ? '.ID' : `.${field[0]?.toUpperCase()}${field.slice(1)}`;
      assert.deepEqual(unit.symbols, [
        { implementation: 'ts', symbol: `@polyspec/template!${native}${field === undefined ? ':interface' : `#${field}:member`}` },
        { implementation: 'go', symbol: `github.com/polyspec/template/packages/go/ast.${name}${goField}` },
        { implementation: 'rust', symbol: `polyspec_template::${rust}${rustField}` },
        // These SDKs publish the AST as native arrays/dictionaries, not per-node classes.
        // Their public decoder and the native round-trip units own each schema field.
        { implementation: 'php', symbol: 'Polyspec\\Template\\AstProgram::decodeTemplate' },
        { implementation: 'php-ext', symbol: 'Polyspec\\Template\\AstProgram::decodeTemplate' },
        { implementation: 'python', symbol: 'template.decode_template' },
      ], id);
    }
  }
});

// The same committed data is decoded by all six SDKs, so adding a schema literal
// without exercising it through the public decoders must fail this unit.
test('the shared enum fixture covers every canonical AST literal', { timeout: 5000 }, () => {
  const fixture: unknown = JSON.parse(readFileSync('tests/fixtures/ast-decode/enum-literals.json', 'utf8'));
  assert.ok(record(fixture) && Array.isArray(fixture.body));
  for (const [name, field] of [['Binary', 'op'], ['Unary', 'op'], ['LoopMeta', 'field']] as const) {
    const property = schema.definitions[name]?.properties?.[field];
    assert.ok(record(property) && Array.isArray(property.enum));
    const literals: unknown[] = property.enum;
    const expected = literals.map(value => { assert.equal(typeof value, 'string'); return String(value); });
    const found: string[] = fixture.body.flatMap((node: unknown) => {
      assert.ok(record(node) && record(node.expr));
      if (node.expr.type !== name) return [];
      const value = node.expr[field];
      assert.equal(typeof value, 'string');
      return [String(value)];
    });
    assert.deepEqual([...found].sort(), [...expected].sort(), `${name}.${field}`);
  }
});

// AST-4: native literal carriers preserve every scalar alternative, including false.
test('the shared AST value fixture covers scalar carriers and map spread', { timeout: 5000 }, () => {
  const fixture: unknown = JSON.parse(readFileSync('tests/fixtures/ast-decode/enum-literals.json', 'utf8'));
  assert.ok(record(fixture) && Array.isArray(fixture.body));
  const expressions = fixture.body.map((node: unknown) => { assert.ok(record(node) && record(node.expr)); return node.expr; });
  const scalars = expressions.filter(expr => expr.type === 'Literal');
  assert.deepEqual(scalars.map(expr => [expr.kind, expr.value]), [
    ['null', null], ['bool', true], ['number', 12.5], ['string', 'é😀'], ['bool', false],
  ]);
  const map = expressions.find(expr => expr.type === 'Map');
  assert.ok(map && Array.isArray(map.entries));
  assert.equal(map.entries.length, 2);
  const entries: unknown[] = map.entries;
  const [entry, spread] = entries;
  assert.ok(record(entry) && record(entry.key) && record(entry.value));
  assert.equal(entry.key.value, 'key');
  assert.equal(entry.value.value, 12.5);
  assert.ok(record(spread) && record(spread.expr));
  assert.equal(spread.type, 'Spread');
  assert.equal(spread.expr.type, 'Var');
  assert.equal(spread.expr.name, 'rest');
});
