#!/usr/bin/env node
// Checks two things.
//
// 1. Every symbol of the public entry surface of a package carries a documentation comment.
//    The public entry surface is what a consumer reaches through the documented entry points:
//      TypeScript  the symbols re-exported from src/index.ts, src/render.ts and src/node/index.ts,
//                  and the public members of the classes among them
//      Go          the exported identifiers of the module root package, the subpackage types that
//                  its declarations name, and the exported methods of those types
//      PHP         the classes of the API table of the package README and their public methods
//      Rust        the crate attribute #![deny(missing_docs)], which makes the compiler check
//                  every public item
//    A symbol that a package exports only so that another file of the same package can use it is
//    internal and is not checked here.
//
// 2. Every source file starts with a comment naming what the file implements.
//
// A documentation comment is a comment that ends on the line directly above the declaration.
// Exit status 1 with one line per finding, 0 with a summary count.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
const counts = new Map();
let group = 'files';
let checked = 0;

// Counts one checked symbol against the group that is being checked.
function count() {
  checked++;
  counts.set(group, (counts.get(group) ?? 0) + 1);
}

function report(file, line, message) {
  findings.push(`${relative(root, file)}:${line}: ${message}`);
}

// Lists the files of a directory tree whose name ends with one of the extensions.
function sources(directory, extensions) {
  const skip = new Set(['node_modules', 'vendor', 'target', 'dist']);
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const files = [];
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(path);
      } else if (extensions.some(extension => entry.name.endsWith(extension))) {
        files.push(path);
      }
    }
  };
  walk(absolute);
  return files.sort();
}

// True when a comment ends on the line directly above the declaration. Attribute and decorator
// lines between the comment and the declaration are skipped.
function documented(lines, index) {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const line = (lines[cursor] ?? '').trim();
    if (line === '') return false;
    if (line === '*/' || line.startsWith('*') || line.startsWith('//') || line.startsWith('/*')) return true;
    if (line.startsWith('#[') || line.startsWith('@')) continue;
    return false;
  }
  return false;
}

// Returns the index of the closing brace that matches the opening brace on the given line.
function blockEnd(lines, start) {
  let depth = 0;
  for (let index = start; index < lines.length; index++) {
    for (const character of lines[index] ?? '') {
      if (character === '{') depth++;
      else if (character === '}') {
        depth--;
        if (depth === 0) return index;
      }
    }
  }
  return lines.length - 1;
}

// ---------------------------------------------------------------- TypeScript

group = 'template-ts';

const typescriptRoot = join(root, 'packages/template-ts/src');
const typescriptEntries = ['index.ts', 'render.ts', 'node/index.ts'];

// Resolves a module specifier of a file to a source path inside the package.
function typescriptModule(fromFile, specifier) {
  return resolve(dirname(fromFile), specifier.replace(/\.js$/, '.ts'));
}

// Collects {file, name} for every symbol that the entry files re-export or declare.
function typescriptSurface() {
  const surface = new Map();
  const add = (file, name) => {
    const key = `${file}::${name}`;
    if (!surface.has(key)) surface.set(key, { file, name });
  };
  for (const entry of typescriptEntries) {
    const file = join(typescriptRoot, entry);
    if (!existsSync(file)) {
      findings.push(`${relative(root, file)}:1: the entry file does not exist`);
      continue;
    }
    const text = readFileSync(file, 'utf8');

    // Where each imported binding of the entry file comes from.
    const imported = new Map();
    for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
      for (const item of match[1].split(',')) {
        const name = item.replace(/^\s*type\s+/, '').trim().split(/\s+as\s+/)[0];
        if (name) imported.set(name, typescriptModule(file, match[2]));
      }
    }

    // export { a, type b, c as d } from './x.js'
    for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
      const module = typescriptModule(file, match[2]);
      for (const item of match[1].split(',')) {
        const name = item.replace(/^\s*type\s+/, '').trim().split(/\s+as\s+/)[0];
        if (name) add(module, name);
      }
    }

    // export type { a, b as c };  where a and b are imported bindings
    for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*;/g)) {
      for (const item of match[1].split(',')) {
        const name = item.replace(/^\s*type\s+/, '').trim().split(/\s+as\s+/)[0];
        const module = imported.get(name);
        if (name && module) add(module, name);
      }
    }

    // Declarations of the entry file itself.
    for (const match of text.matchAll(
      /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|class|interface|type|const|enum)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      add(file, match[1]);
    }
  }
  return [...surface.values()];
}

// Checks one TypeScript declaration and, for a class, its public members. A module that
// re-exports the name from another module is followed until the declaration is found.
function checkTypescriptSymbol(file, name, seen = new Set()) {
  if (!existsSync(file)) {
    findings.push(`${relative(root, file)}:1: ${name} comes from a file that does not exist`);
    return;
  }
  const key = `${file}::${name}`;
  if (seen.has(key)) return;
  seen.add(key);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const pattern = new RegExp(
    `^export\\s+(?:declare\\s+)?(?:abstract\\s+)?(function|class|interface|type|const|enum)\\s+${name}\\b`,
  );
  const index = lines.findIndex(line => pattern.test(line));
  if (index === -1) {
    for (const match of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
      const names = match[1]
        .split(',')
        .map(item => item.replace(/^\s*type\s+/, '').trim().split(/\s+as\s+/))
        .filter(parts => (parts[1] ?? parts[0]) === name);
      if (names.length) {
        checkTypescriptSymbol(typescriptModule(file, match[2]), names[0][0], seen);
        return;
      }
    }
    findings.push(`${relative(root, file)}:1: ${name} is part of the public surface but is not declared here`);
    return;
  }
  count();
  const kind = pattern.exec(lines[index])[1];
  if (!documented(lines, index)) report(file, index + 1, `${kind} ${name}`);
  if (kind !== 'class') return;

  // Public members of an exported class.
  const end = blockEnd(lines, index);
  const member = /^ {2}(?!private|protected|#)(?:public\s+)?(?:readonly\s+)?(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[(<]/;
  for (let cursor = index + 1; cursor < end; cursor++) {
    const match = member.exec(lines[cursor] ?? '');
    if (!match) continue;
    if (['if', 'for', 'while', 'switch', 'return', 'catch'].includes(match[1])) continue;
    count();
    if (!documented(lines, cursor)) report(file, cursor + 1, `method ${name}.${match[1]}`);
  }
}

for (const symbol of typescriptSurface()) checkTypescriptSymbol(symbol.file, symbol.name);

// ---------------------------------------------------------------- Go

group = 'template-go';

const goRoot = join(root, 'packages/template-go');
const goDeclaration = /^(?:func|type|var|const)\s+([A-Z]\w*)/;
const goMethod = /^func\s+\([^)]*?\*?(\w+)\)\s+([A-Z]\w*)/;

// Checks a Go declaration whose documentation comment starts with the identifier name.
function checkGoDeclaration(file, lines, index, name, label) {
  count();
  let cursor = index - 1;
  while (cursor >= 0 && (lines[cursor] ?? '').trim().startsWith('//')) cursor--;
  const first = (lines[cursor + 1] ?? '').trim();
  if (cursor === index - 1 || !first.startsWith(`// ${name}`)) report(file, index + 1, label ?? name);
}

if (existsSync(goRoot)) {
  const rootFiles = readdirSync(goRoot)
    .filter(name => name.endsWith('.go') && !name.endsWith('_test.go'))
    .map(name => join(goRoot, name));

  // Package aliases of the root package and the subpackage types that its declarations name.
  const packageDirectories = new Map();
  const referenced = new Map();
  for (const file of rootFiles) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/"github\.com\/polyspec\/template\/([\w/]+)"/g)) {
      packageDirectories.set(match[1].split('/').pop(), join(goRoot, match[1]));
    }
    for (const match of text.matchAll(/\b([a-z]\w*)\.([A-Z]\w*)/g)) {
      const directory = packageDirectories.get(match[1]);
      if (!directory) continue;
      const key = `${directory}::${match[2]}`;
      if (!referenced.has(key)) referenced.set(key, { directory, name: match[2] });
    }
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const method = goMethod.exec(line);
      const declaration = method ? null : goDeclaration.exec(line);
      if (method) checkGoDeclaration(file, lines, index, method[2], `method ${method[1]}.${method[2]}`);
      else if (declaration) checkGoDeclaration(file, lines, index, declaration[1]);
    });
  }

  // Subpackage types named by the root package, and their exported methods.
  for (const { directory, name } of referenced.values()) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory).filter(item => item.endsWith('.go') && !item.endsWith('_test.go'))) {
      const path = join(directory, entry);
      const lines = readFileSync(path, 'utf8').split('\n');
      lines.forEach((line, index) => {
        const declaration = goDeclaration.exec(line);
        if (declaration && declaration[1] === name) checkGoDeclaration(path, lines, index, name);
        const method = goMethod.exec(line);
        if (method && method[1] === name) {
          checkGoDeclaration(path, lines, index, method[2], `method ${name}.${method[2]}`);
        }
      });
    }
  }
}

// ---------------------------------------------------------------- PHP

group = 'template-php';

// The classes of the API table of packages/template-php/README.md.
const phpClasses = [
  'Engine.php',
  'TemplateError.php',
  'Loader/LoaderInterface.php',
  'Loader/ArrayLoader.php',
  'Loader/FilesystemLoader.php',
  'Value/Json.php',
  'Value/SafeString.php',
];
const phpType = /^\s*(?:final\s+|abstract\s+)?(class|interface|trait|enum)\s+([A-Za-z_]\w*)/;
const phpMethod = /^\s*public\s+(?:static\s+)?function\s+([A-Za-z_]\w*)/;

for (const relativePath of phpClasses) {
  const file = join(root, 'packages/template-php/src', relativePath);
  if (!existsSync(file)) {
    findings.push(`packages/template-php/src/${relativePath}:1: the file of a public class does not exist`);
    continue;
  }
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const type = phpType.exec(line);
    const method = type ? null : phpMethod.exec(line);
    if (!type && !method) return;
    count();
    if (!documented(lines, index)) {
      report(file, index + 1, type ? `${type[1]} ${type[2]}` : `method ${method[1]}`);
    }
  });
}

// ---------------------------------------------------------------- Rust

group = 'template-rust';

const rustLibrary = join(root, 'packages/template-rust/src/lib.rs');
if (existsSync(rustLibrary)) {
  count();
  if (!readFileSync(rustLibrary, 'utf8').includes('#![deny(missing_docs)]')) {
    findings.push('packages/template-rust/src/lib.rs:1: the crate does not set #![deny(missing_docs)]');
  }
}

// ---------------------------------------------------------------- File comments

group = 'files';

// True when the file starts with a comment, ignoring the lines that must come first.
function startsWithComment(file) {
  const skip = [/^#!/, /^<\?php$/, /^declare\(/, /^#!\[/, /^namespace\s/, /^use\s/];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (skip.some(pattern => pattern.test(line))) continue;
    return line.startsWith('//') || line.startsWith('/*') || line.startsWith('*');
  }
  return false;
}

const fileGroups = [
  ['packages/template-ts/src', ['.ts']],
  ['packages/template-rust/src', ['.rs']],
  ['packages/template-php/src', ['.php']],
];
for (const [directory, extensions] of fileGroups) {
  for (const file of sources(directory, extensions)) {
    if (file.endsWith('.d.ts')) continue;
    count();
    if (!startsWithComment(file)) report(file, 1, 'the file has no comment naming what it implements');
  }
}

// A Go package carries its comment on one of its files.
const goPackages = new Set(
  sources('packages/template-go', ['.go'])
    .filter(file => !file.endsWith('_test.go'))
    .map(file => dirname(file)),
);
for (const directory of [...goPackages].sort()) {
  count();
  const documentedPackage = readdirSync(directory)
    .filter(name => name.endsWith('.go') && !name.endsWith('_test.go'))
    .some(name => /(^|\n)\/\/ (Package|Command) \w[\s\S]*?\npackage\s/.test(readFileSync(join(directory, name), 'utf8')));
  if (!documentedPackage) report(join(directory, 'doc.go'), 1, 'the package has no comment naming what it implements');
}

// ---------------------------------------------------------------- Result

if (findings.length) {
  for (const finding of findings) process.stderr.write(`[doc-coverage] ${finding}\n`);
  process.stderr.write(`[doc-coverage] ${findings.length} of ${checked} public symbols and files are undocumented\n`);
  process.exit(1);
}
const summary = [...counts].map(([name, value]) => `${name} ${value}`).join(', ');
process.stdout.write(`[doc-coverage] ${checked} public symbols and files documented (${summary})\n`);
