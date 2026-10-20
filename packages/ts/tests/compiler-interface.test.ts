// Compares the runtime declarations of the package with the TypeScript mapping of the compiler manifest
// (packages/compiler/interface.json, RT-67): the engine and the program that it owns, the runtime environment of a
// program and the operations of the bound map (VAL-22). The interface gate of make compiler-interface-check reads the
// same declarations statically with oxc-parser; this test checks the values that the package exports.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AstProgram, bind, Engine, merge, RuntimeEnvironment, TemplateError, type RuntimeServices } from '../src/index.js';
import type { RuntimeServices as RenderRuntimeServices } from '../src/render.js';

interface Operation {
  name: string;
  parameters: string[];
}

interface Manifest {
  languages: { typescript: { error: string; runtimeEnvironmentOperations: string[]; boundMap: { operations: { bind: string; merge: string } } } };
  runtimeContract: {
    Program: { operations: Operation[] };
    Engine: { owns: string[]; operations: string[] };
    AstProgram: { owns: string[] };
    BoundMap: { operations: Operation[] };
  };
}

function isManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null) return false;
  const languages: unknown = Reflect.get(value, 'languages');
  const contract: unknown = Reflect.get(value, 'runtimeContract');
  return typeof languages === 'object' && languages !== null && typeof Reflect.get(languages, 'typescript') === 'object'
    && typeof contract === 'object' && contract !== null && ['Program', 'Engine', 'AstProgram', 'BoundMap'].every(name => typeof Reflect.get(contract, name) === 'object');
}

const manifestPath = join(import.meta.dirname, '..', '..', 'compiler', 'interface.json');
const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!isManifest(parsed)) throw new Error(`${manifestPath} has no TypeScript mapping or runtime contract`);
const manifest = parsed;
const mapping = manifest.languages.typescript;

/** The methods that a class declares itself, in declaration order. */
const methodsOf = (type: { prototype: object }) => Object.getOwnPropertyNames(type.prototype).filter(name => name !== 'constructor');

describe('compiler interface', () => {
  it('program and engine', () => {
    // The AST program implements Program: it holds every operation of the Program contract.
    for (const operation of manifest.runtimeContract.Program.operations) expect(typeof Reflect.get(AstProgram.prototype, operation.name)).toBe('function');
    expect(methodsOf(Engine)).toEqual(manifest.runtimeContract.Engine.operations);
    expect(Object.keys(new Engine(new AstProgram()))).toEqual(manifest.runtimeContract.Engine.owns);
    for (const field of manifest.runtimeContract.AstProgram.owns) expect(Object.keys(new AstProgram())).toContain(field);
    expect(TemplateError.name).toBe(mapping.error);
    expect(methodsOf(RuntimeEnvironment)).toEqual(mapping.runtimeEnvironmentOperations);
  });

  it('runtime services', () => {
    // RuntimeServices is the common runtime interface of both program modes, which RuntimeEnvironment implements and
    // RenderContext takes (compiler.md, public structures), so both entries of the package export it.
    const services: RuntimeServices = new RuntimeEnvironment();
    const rendering: RenderRuntimeServices = services;
    expect(rendering.limits()).toEqual(services.limits());
    expect(rendering.hostFunction('missing')).toBeUndefined();
  });

  it('bound map', () => {
    const operations = { [mapping.boundMap.operations.bind]: bind, [mapping.boundMap.operations.merge]: merge };
    for (const operation of manifest.runtimeContract.BoundMap.operations) {
      const declared = operations[operation.name];
      expect(declared, operation.name).toBeTypeOf('function');
      expect(declared?.length, operation.name).toBe(operation.parameters.length);
    }
  });
});
