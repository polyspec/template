// The imports of a JavaScript or TypeScript module, read as Node.js reads it: amaro (the TypeScript remover of Node.js, in
// transform mode) turns TypeScript into JavaScript, acorn parses it, and acorn-walk finds the import and export
// declarations with a source, the dynamic imports and the calls of require. The editor boundaries
// (scripts/check-editor-boundaries.mts, T27.1-37) read modules through it.
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse, type Program } from 'acorn';
import { simple } from 'acorn-walk';
import { transformSync } from 'amaro';

const TYPESCRIPT = /\.[cm]?ts$/;
const COMMONJS = /\.c[jt]s$/;
// A relative import of TypeScript names the JavaScript file that the compiler writes.
const COMPILED: Record<string, string> = { '.js': '.ts', '.mjs': '.mts', '.cjs': '.cts' };

/** An import of a module: its specifier, or null for a computed one. */
export type Import = string | null;

/** The program of the JavaScript or TypeScript `text` of `file`, as acorn parses it; a CommonJS file is a script. */
export function parseModule(file: string, text: string): Program {
  try {
    const code = TYPESCRIPT.test(file) ? transformSync(text, { mode: 'transform', filename: file }).code : text;
    return parse(code, { ecmaVersion: 'latest', sourceType: COMMONJS.test(file) ? 'script' : 'module', ranges: true });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new Error(`${file}: ${error.message}`, { cause: error });
  }
}

/** The imports of the `program` of `file`: static imports, re-exports, dynamic imports and calls of require. */
export function moduleImports(file: string, program: Program): Import[] {
  const imports: Import[] = [];
  const source = (node: { source?: { type: string; value?: unknown } | null }) => {
    // The source of an import or an export from another module is a string literal.
    const value = node.source?.type === 'Literal' ? node.source.value : undefined;
    if (typeof value !== 'string') throw new Error(`${file}: an import names no string source`);
    imports.push(value);
  };
  simple(program, {
    ImportDeclaration: source,
    ExportAllDeclaration: source,
    ExportNamedDeclaration(node) { if (node.source) source(node); },
    ImportExpression(node) { imports.push(node.source.type === 'Literal' && typeof node.source.value === 'string' ? node.source.value : null); },
    CallExpression(node) {
      const [argument] = node.arguments;
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'require' || !argument) return;
      imports.push(argument.type === 'Literal' && typeof argument.value === 'string' ? argument.value : null);
    },
  });
  return imports;
}

/** The file of the relative `specifier` of `from`: the named file, or the TypeScript file of a named JavaScript file. */
export function resolveRelative(from: string, specifier: string): string | null {
  const named = path.resolve(path.dirname(from), specifier);
  if (existsSync(named) && statSync(named).isFile()) return named;
  const extension = path.extname(named);
  const compiled = COMPILED[extension];
  if (compiled === undefined) return null;
  const typescript = `${named.slice(0, -extension.length)}${compiled}`;
  return existsSync(typescript) ? typescript : null;
}
