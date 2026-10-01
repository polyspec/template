// Host argument form (VAL-21) and native object equality (EXP-39) with the shared fixture of
// tests/fixtures/native-object/host-values.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstProgram, MapLoader, TemplateError } from '../../src/index.js';
import { repoRoot } from '../helpers.js';

const fixtureDir = join(repoRoot, 'tests', 'fixtures', 'native-object');
const expected = JSON.parse(readFileSync(join(fixtureDir, 'host-values.json'), 'utf8')) as {
  outputs: Record<string, string>;
  errors: Record<string, string>;
};

class Order {
  describe(...args: unknown[]): string {
    return describeArguments(args, this);
  }
}

function describeValue(value: unknown, order: Order): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return `bool(${value})`;
  if (typeof value === 'number') return `number(${value})`;
  if (typeof value === 'string') return `string(${value})`;
  if (Array.isArray(value)) return `list(${value.map(item => describeValue(item, order)).join(',')})`;
  if (value instanceof Map) return `map(${[...value].map(([key, item]) => `${String(key)}=${describeValue(item, order)}`).join(',')})`;
  if (value === order) return 'object(order)';
  return `unexpected(${Object.prototype.toString.call(value)})`;
}

function describeArguments(args: unknown[], order: Order): string {
  return args.map(item => describeValue(item, order)).join(',');
}

function render(target: string): string {
  const templates = Object.fromEntries(
    [...Object.keys(expected.outputs), ...Object.keys(expected.errors)].map(name => [name, readFileSync(join(fixtureDir, name), 'utf8')]),
  );
  const order = new Order();
  const program = new AstProgram({ loader: new MapLoader(templates) });
  program.register('describe', args => describeArguments(args, order));
  program.register('mutate', ([list, map, items]) => {
    (list as unknown[])[0] = 'changed';
    (list as unknown[]).push('added');
    (map as Map<string, unknown>).set('k', 'changed');
    (map as Map<string, unknown>).set('added', true);
    (items as unknown[]).push('added');
    return null;
  });
  program.register('pick', ([value]) => value);
  program.registerClass('Order', 'describe', args => describeArguments(args, order));
  return program.render(target, { order, same: order, other: new Order(), items: [1] });
}

describe('host arguments and native object equality', () => {
  for (const [target, output] of Object.entries(expected.outputs)) {
    it(`renders ${target} (VAL-21, EXP-39)`, () => {
      expect(render(target)).toBe(output);
    });
  }

  for (const [target, code] of Object.entries(expected.errors)) {
    it(`fails ${target} with ${code} (EXP-38)`, () => {
      let actual = 'OK';
      try {
        render(target);
      } catch (error) {
        if (!(error instanceof TemplateError)) throw error;
        actual = error.code;
      }
      expect(actual).toBe(code);
    });
  }
});
