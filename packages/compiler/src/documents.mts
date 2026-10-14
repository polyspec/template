// The JSON documents that the compiler reads, each described once by its type and its JSON Schema: ajv validates a
// parsed document against the schema, so the compiler reads a value of its type or fails with the source and the errors
// of the schema. A schema of type JSONSchemaType<T> is checked against T by the TypeScript compiler. The canonical AST
// of a template is read by decodeTemplate of @polyspec/template, which validates it against its own JSON Schema.
import { readFileSync } from 'node:fs';
import { Ajv, type JSONSchemaType, type Schema } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });

/** A JSON document of type T: `parse` validates a value, `read` a file; both fail with the source and the errors. */
export interface JsonDocument<T> {
  parse(value: unknown, source: string): T;
  read(path: string): T;
}

function jsonDocument<T>(what: string, schema: Schema | JSONSchemaType<T>): JsonDocument<T> {
  const validate = ajv.compile<T>(schema);
  const parse = (value: unknown, source: string): T => {
    if (validate(value)) return value;
    throw new Error(`compiler: ${source} is no ${what}: ${ajv.errorsText(validate.errors)}`);
  };
  return { parse, read: path => parse(readJson(path), path) };
}

/** The value of the JSON file at `path`, or an error that names the file. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`compiler: ${path} is no JSON text: ${error.message}`, { cause: error });
    throw error;
  }
}

const digest = { type: 'string', pattern: '^[0-9a-f]{64}$' } as const;
const names = <T,>(items: JSONSchemaType<T>): JSONSchemaType<Record<string, T>> => ({ type: 'object', required: [], additionalProperties: items });

/** A file of a canonical AST artifact: its AST file, the digests of its source and AST, and its source line index. */
export interface AstFile {
  path: string;
  sourceDigest: string;
  artifactDigest: string;
  /** The byte offset of the start of each source line, the first 0, ascending. */
  lines: number[];
}

/** The manifest.json of a canonical AST artifact: the source graph that compileAst writes. */
export interface AstManifest {
  schema: 3;
  mode: 'ast';
  target: 'canonical';
  entry: string;
  delimiters: string | null;
  sourceDigest: string;
  typeDigest: string;
  contractDigest: string;
  compilerDigest: string;
  files: Record<string, AstFile>;
}

const astFileSchema: JSONSchemaType<AstFile> = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'sourceDigest', 'artifactDigest', 'lines'],
  properties: {
    path: { type: 'string' },
    sourceDigest: digest,
    artifactDigest: digest,
    lines: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0 } },
  },
};

export const astManifestDocument = jsonDocument<AstManifest>('canonical AST artifact manifest', {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'mode', 'target', 'entry', 'delimiters', 'sourceDigest', 'typeDigest', 'contractDigest', 'compilerDigest', 'files'],
  properties: {
    schema: { type: 'integer', const: 3 },
    mode: { type: 'string', const: 'ast' },
    target: { type: 'string', const: 'canonical' },
    entry: { type: 'string' },
    // JSONSchemaType spells a required string or null as the two types, the null type with nullable.
    delimiters: { anyOf: [{ type: 'string' }, { type: 'null', nullable: true }] },
    sourceDigest: digest,
    typeDigest: digest,
    contractDigest: digest,
    compilerDigest: digest,
    files: names(astFileSchema),
  },
} satisfies JSONSchemaType<AstManifest>);

/** A file of a generated artifact: its path and the digest of its bytes. */
export interface GeneratedFile {
  path: string;
  artifactDigest: string;
}

/** The manifest beside a generated artifact: the AST artifact, type manifest, contract and compiler it was built from. */
export interface GeneratedManifest {
  schema: 3;
  mode: 'gen';
  target: string;
  entry: string;
  sourceDigest: string;
  typeDigest: string;
  contractDigest: string;
  compilerDigest: string;
  files: Record<string, GeneratedFile>;
}

export const generatedManifestDocument = jsonDocument<GeneratedManifest>('generated artifact manifest', {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'mode', 'target', 'entry', 'sourceDigest', 'typeDigest', 'contractDigest', 'compilerDigest', 'files'],
  properties: {
    schema: { type: 'integer', const: 3 },
    mode: { type: 'string', const: 'gen' },
    target: { type: 'string' },
    entry: { type: 'string' },
    sourceDigest: digest,
    typeDigest: digest,
    contractDigest: digest,
    compilerDigest: digest,
    files: names<GeneratedFile>({
      type: 'object',
      additionalProperties: false,
      required: ['path', 'artifactDigest'],
      properties: { path: { type: 'string' }, artifactDigest: digest },
    }),
  },
} satisfies JSONSchemaType<GeneratedManifest>);

/** The signature of a function in a type manifest; the counts default to the length of `args`. */
export interface FunctionSignature {
  implementation: 'builtin' | 'host';
  args: string[];
  minArgs?: number | null;
  /** The most arguments, or -1 for any number. */
  maxArgs?: number | null;
  returns: string;
  /** Whether the runtime, not the compiler, checks the number of arguments. */
  runtimeArity?: boolean | null;
}

/**
 * A definition of a type manifest: the template that renders it, and whether it may be HTML or absent. An optional field
 * of a type manifest may be null, as ajv's `nullable` declares it, and means its default then.
 */
export interface DefinitionDeclaration {
  template?: string | null;
  optional?: boolean | null;
  html?: boolean | null;
}

/** The type manifest of a source graph (docs/spec/compiler.md): the types of its inputs, definitions and functions. */
export interface TypeManifest {
  schema: 3;
  root: 'Assign' | 'any';
  entry: string;
  /** The fields of the root by name, each a type. */
  fields: Record<string, string>;
  /** The fields of each record by name, each a type. */
  records: Record<string, Record<string, string>>;
  defines: Record<string, DefinitionDeclaration>;
  functions: Record<string, FunctionSignature>;
  /** The inputs of each template by name, each a type. */
  templates: Record<string, Record<string, string>>;
}

const types = names<string>({ type: 'string', minLength: 1 });

export const typeManifestDocument = jsonDocument<TypeManifest>('type manifest', {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'root', 'entry', 'fields', 'records', 'defines', 'functions', 'templates'],
  properties: {
    schema: { type: 'integer', const: 3 },
    root: { type: 'string', enum: ['Assign', 'any'] },
    entry: { type: 'string' },
    fields: types,
    records: names(types),
    defines: names<DefinitionDeclaration>({
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        template: { type: 'string', nullable: true },
        optional: { type: 'boolean', nullable: true },
        html: { type: 'boolean', nullable: true },
      },
    }),
    functions: names<FunctionSignature>({
      type: 'object',
      additionalProperties: false,
      required: ['implementation', 'args', 'returns'],
      properties: {
        implementation: { type: 'string', enum: ['builtin', 'host'] },
        args: { type: 'array', items: { type: 'string', minLength: 1 } },
        minArgs: { type: 'integer', minimum: 0, nullable: true },
        maxArgs: { type: 'integer', minimum: -1, nullable: true },
        returns: { type: 'string', minLength: 1 },
        runtimeArity: { type: 'boolean', nullable: true },
      },
    }),
    templates: names(types),
  },
} satisfies JSONSchemaType<TypeManifest>);

/** A canonical function of the function contract functions.json: its name, arity and return type. */
interface CanonicalFunction {
  name: string;
  minArgs: number;
  /** The most arguments, or -1 for any number. */
  maxArgs: number;
  returns: string;
}

/** The parts of the function contract functions.json that the compiler reads; the checks of the repository read the rest. */
export interface FunctionContract {
  canonical: CanonicalFunction[];
}

export const functionContractDocument = jsonDocument<FunctionContract>('function contract', {
  type: 'object',
  required: ['canonical'],
  properties: {
    canonical: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'minArgs', 'maxArgs', 'returns'],
        properties: {
          name: { type: 'string' },
          minArgs: { type: 'integer', minimum: 0 },
          maxArgs: { type: 'integer', minimum: -1 },
          returns: { type: 'string', minLength: 1 },
        },
      },
    },
  },
} satisfies JSONSchemaType<FunctionContract>);
