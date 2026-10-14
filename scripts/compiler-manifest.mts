// The compiler interface manifest packages/compiler/interface.json (RT-67), described once: its type and the JSON Schema
// that every script validates it with. The checks that read it (check-compiler-interface, its mutations,
// generate-compiler-interface and the showcase contract scripts) compare its content with the code; the schema only
// fixes the shape that they read.
import { join } from 'node:path';
import { jsonDocument, type JsonDocument } from './json-document.mts';
import { required } from './required.mts';

/** An operation of a component of the compiler pipeline. */
export interface ManifestOperation {
  name: string;
  owner: string;
  parameters: string[];
  returns: string;
}

/** An operation of the prepared render contract. */
export interface RuntimeOperation {
  name: string;
  parameters: string[];
  returns: string;
}

/** A type of the manifest: the fields that it declares, as a list or as a description, and its operations, if any. */
export interface ManifestType {
  fields?: string[] | string;
  operations?: string[];
}

/** The names of the bound map of one language (VAL-22). */
export interface BoundMapping {
  type: string;
  operations: Record<string, string>;
  assign: Record<string, string>;
  generatedOperations?: string[];
}

/** The mapping of one language; the PHP extension and JavaScript ESM map only their bound map and entry. */
export interface LanguageMapping {
  backend?: string;
  program?: string[];
  runtimeServices?: string;
  error?: string;
  runtimeServiceOperationNames?: Record<string, string>;
  runtimeBindingOperationNames?: Record<string, string>;
  runtimeEnvironmentFields?: string[];
  runtimeEnvironmentOperations?: string[];
  runtimeBindingsExplicitContext?: string[];
  boundMap: BoundMapping;
  entry?: string;
  frameFields?: string[];
  scopeFields?: string[];
  scopeOperations?: string[];
}

/** A field of a record or a union variant of the showcase adapter. */
export interface Field {
  name: string;
  type: string;
  required: boolean;
  nullable: boolean;
  order: number;
}

/** A variant of a union of the showcase adapter. */
export interface Variant {
  name: string;
  fields: Field[];
  owns: string[];
}

/** A type of the showcase adapter: a record, a union of variants, or another kind such as an alias. */
export type TypeDefinition =
  | { kind: 'record'; fields: Field[] }
  | { kind: 'union'; variants: Variant[] }
  | { kind: 'recursive-union'; variants: string[] }
  | { kind: 'alias'; type: string };

/** A parameter of an operation of the showcase adapter. */
export interface Parameter {
  name: string;
  type: string;
  mode: string;
}

/** An operation of the showcase adapter. */
export interface AdapterOperation {
  name: string;
  parameters: Parameter[];
  returns: string;
  errors: string[];
  preconditions: string[];
  mutates: string[];
  calls: string[];
  failureState: string;
}

/** The adapter of one language of the showcase. */
export interface AdapterLanguage {
  file: string;
  generated: string;
  type: string;
  constructorName: string;
  operationNames: Record<string, string>;
  supportLevels: string[];
}

/** An execution mode of the showcase (RT-63). */
export interface ExecutionMode {
  description: string;
  input: string;
  requestPath: string[];
  requiredSupportLevel: string;
  status: string;
}

/** A transition of the state of the showcase adapter. */
export interface Transition {
  from: string;
  to: string;
  operation: string;
  onError?: string;
}

/** The contract of the language adapters of the showcase. */
export interface ShowcaseAdapter {
  schema: number;
  name: string;
  concreteType: string;
  constructor: { parameters: Parameter[]; errors: string[]; preconditions: string[]; reads: string[]; mutates: string[]; owns: string[] };
  types: Record<string, TypeDefinition>;
  operations: AdapterOperation[];
  languages: Record<string, AdapterLanguage>;
  supportLevels: Record<string, { description: string; operations: string[] }>;
  executionModes: Record<string, ExecutionMode>;
  state: { states: string[]; transitions: Transition[] };
}

/** The manifest of packages/compiler/interface.json. */
export interface CompilerManifest {
  schema: number;
  name: string;
  evidence: { readingOrder: string[]; fixtures: string; examples: string[]; generatedEvidence: string[]; verificationCommands: string[] };
  supportLevels: Record<string, { languages: string[]; compileModes: string[] }>;
  types: Record<string, ManifestType>;
  components: Record<string, { owns: string[]; operations: string[] }>;
  operations: ManifestOperation[];
  languages: Record<string, LanguageMapping>;
  forbidden: string[];
  runtimeContract: {
    Program: { operations: RuntimeOperation[] };
    Engine: { owns: string[]; implements: string; operations: string[] };
    AstProgram: { implements: string; owns: string[] };
    GeneratedProgram: { implements: string };
    RuntimeBindings: { operations: RuntimeOperation[] };
    RuntimeServices: { operations: RuntimeOperation[] };
    RuntimeEnvironment: { implements: string; fields: string[]; operations: RuntimeOperation[] };
    RenderFrame: { fields: string[] };
    RenderScope: { fields: string[]; operations: string[] };
    BoundMap: { operations: RuntimeOperation[]; acceptedBy: string[] };
  };
  showcaseAdapter: ShowcaseAdapter;
}

const strings = { type: 'array', items: { type: 'string' } };
const nameMap = { type: 'object', additionalProperties: { type: 'string' } };
const object = (properties: Record<string, object>, optional: string[] = []) => ({
  type: 'object',
  required: Object.keys(properties).filter(name => !optional.includes(name)),
  properties,
});
const runtimeOperations = { type: 'array', items: object({ name: { type: 'string' }, parameters: strings, returns: { type: 'string' } }) };
const field = object({ name: { type: 'string' }, type: { type: 'string' }, required: { type: 'boolean' }, nullable: { type: 'boolean' }, order: { type: 'integer' } });
const parameter = object({ name: { type: 'string' }, type: { type: 'string' }, mode: { type: 'string' } });
// One schema per kind; the kind tells them apart, so exactly one of them holds.
const kindOf = (kind: string) => ({ type: 'string', const: kind });
const typeDefinition = {
  oneOf: [
    object({ kind: kindOf('record'), fields: { type: 'array', items: field } }),
    object({ kind: kindOf('union'), variants: { type: 'array', items: object({ name: { type: 'string' }, fields: { type: 'array', items: field }, owns: strings }) } }),
    object({ kind: kindOf('recursive-union'), variants: strings }),
    object({ kind: kindOf('alias'), type: { type: 'string' } }),
  ],
};
const showcaseAdapter = object({
  schema: { type: 'integer' },
  name: { type: 'string' },
  concreteType: { type: 'string' },
  constructor: object({ parameters: { type: 'array', items: parameter }, errors: strings, preconditions: strings, reads: strings, mutates: strings, owns: strings }),
  types: { type: 'object', additionalProperties: typeDefinition },
  operations: {
    type: 'array',
    items: object({
      name: { type: 'string' }, parameters: { type: 'array', items: parameter }, returns: { type: 'string' }, errors: strings,
      preconditions: strings, mutates: strings, calls: strings, failureState: { type: 'string' },
    }),
  },
  languages: {
    type: 'object',
    additionalProperties: object({
      file: { type: 'string' }, generated: { type: 'string' }, type: { type: 'string' }, constructorName: { type: 'string' },
      operationNames: nameMap, supportLevels: strings,
    }),
  },
  supportLevels: { type: 'object', additionalProperties: object({ description: { type: 'string' }, operations: strings }) },
  executionModes: {
    type: 'object',
    additionalProperties: object({
      description: { type: 'string' }, input: { type: 'string' }, requestPath: strings, requiredSupportLevel: { type: 'string' }, status: { type: 'string' },
    }),
  },
  state: object({
    states: strings,
    transitions: { type: 'array', items: object({ from: { type: 'string' }, to: { type: 'string' }, operation: { type: 'string' }, onError: { type: 'string' } }, ['onError']) },
  }),
});
const schema = object({
  schema: { type: 'integer' },
  name: { type: 'string' },
  evidence: object({ readingOrder: strings, fixtures: { type: 'string' }, examples: strings, generatedEvidence: strings, verificationCommands: strings }),
  supportLevels: { type: 'object', additionalProperties: object({ languages: strings, compileModes: strings }) },
  types: { type: 'object', additionalProperties: object({ fields: { anyOf: [strings, { type: 'string' }] }, operations: strings }, ['fields', 'operations']) },
  components: { type: 'object', additionalProperties: object({ owns: strings, operations: strings }) },
  operations: { type: 'array', items: object({ name: { type: 'string' }, owner: { type: 'string' }, parameters: strings, returns: { type: 'string' } }) },
  languages: {
    type: 'object',
    additionalProperties: object({
      backend: { type: 'string' }, program: strings, runtimeServices: { type: 'string' }, error: { type: 'string' },
      runtimeServiceOperationNames: nameMap, runtimeBindingOperationNames: nameMap, runtimeEnvironmentFields: strings,
      runtimeEnvironmentOperations: strings, runtimeBindingsExplicitContext: strings,
      boundMap: object({ type: { type: 'string' }, operations: nameMap, assign: nameMap, generatedOperations: strings }, ['generatedOperations']),
      entry: { type: 'string' }, frameFields: strings, scopeFields: strings, scopeOperations: strings,
    }, [
      'backend', 'program', 'runtimeServices', 'error', 'runtimeServiceOperationNames', 'runtimeBindingOperationNames', 'runtimeEnvironmentFields',
      'runtimeEnvironmentOperations', 'runtimeBindingsExplicitContext', 'entry', 'frameFields', 'scopeFields', 'scopeOperations',
    ]),
  },
  forbidden: strings,
  runtimeContract: object({
    Program: object({ operations: runtimeOperations }),
    Engine: object({ owns: strings, implements: { type: 'string' }, operations: strings }),
    AstProgram: object({ implements: { type: 'string' }, owns: strings }),
    GeneratedProgram: object({ implements: { type: 'string' } }),
    RuntimeBindings: object({ operations: runtimeOperations }),
    RuntimeServices: object({ operations: runtimeOperations }),
    RuntimeEnvironment: object({ implements: { type: 'string' }, fields: strings, operations: runtimeOperations }),
    RenderFrame: object({ fields: strings }),
    RenderScope: object({ fields: strings, operations: strings }),
    BoundMap: object({ operations: runtimeOperations, acceptedBy: strings }),
  }),
  showcaseAdapter,
});

/** The document packages/compiler/interface.json. */
export const compilerManifestDocument: JsonDocument<CompilerManifest> = jsonDocument<CompilerManifest>('compiler interface manifest', schema);

/** The path of the manifest under the root of the repository. */
export const manifestPath = (root: string): string => join(root, 'packages/compiler/interface.json');

/** The mapping of `language` in `manifest`; fails when the manifest maps no such language. */
export function languageMapping(manifest: CompilerManifest, language: string): LanguageMapping {
  return required(manifest.languages[language], `the mapping of ${language} in interface.json`);
}

/** The type `name` of `manifest`; fails when the manifest declares no such type. */
export function manifestType(manifest: CompilerManifest, name: string): ManifestType {
  return required(manifest.types[name], `the type ${name} of interface.json`);
}

/** The list of fields of the type `name`; fails when the type declares none or describes them in prose. */
export function typeFields(manifest: CompilerManifest, name: string): string[] {
  const fields = manifestType(manifest, name).fields;
  if (!Array.isArray(fields)) throw new Error(`the type ${name} of interface.json declares no list of fields`);
  return fields;
}

/** The operations of the type `name`; fails when the type declares none. */
export function typeOperations(manifest: CompilerManifest, name: string): string[] {
  return required(manifestType(manifest, name).operations, `the operations of the type ${name} of interface.json`);
}
