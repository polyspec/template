// Builds and verifies one canonical AST artifact graph.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../packages/template-ts/dist/index.mjs';
import { astCompilerDigest } from './compiler-digest.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const contractPath = join(projectRoot, 'tools/compiler/interface.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const lineIndex = bytes => {
  const starts = [0];
  for (let index = 0; index < bytes.length; index++) if (bytes[index] === 0x0a) starts.push(index + 1);
  return starts;
};

function sourceNames(root, directory = root) {
  const names = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'compiled') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) names.push(...sourceNames(root, path));
    else if (entry.isFile() && entry.name.endsWith('.tpl')) names.push(relative(root, path).split('\\').join('/'));
  }
  return names;
}

function verify(output, contractDigest) {
  const manifestPath = join(output, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`AST artifact manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 3 || manifest.mode !== 'ast' || manifest.target !== 'canonical') throw new Error('AST artifact manifest identity differs');
  if (contractDigest !== null && manifest.contractDigest !== contractDigest) throw new Error('AST artifact contract digest differs');
  const files = Object.entries(manifest.files ?? {});
  if (files.length === 0 || !manifest.files[manifest.entry]) throw new Error('AST artifact source graph is incomplete');
  for (const [name, file] of files) {
    if (!Array.isArray(file.lines) || file.lines.length === 0 || file.lines[0] !== 0 || file.lines.some((offset, index) => !Number.isInteger(offset) || offset < 0 || index > 0 && offset <= file.lines[index - 1])) {
      throw new Error(`AST artifact line index is invalid: ${name}`);
    }
    const path = join(output, file.path);
    if (!existsSync(path) || hash(readFileSync(path)) !== file.artifactDigest) throw new Error(`AST artifact is missing or corrupt: ${name}`);
  }
  return manifest;
}

/** Compiles one source directory into a canonical AST graph outside request handling. */
export function compileAst({ root, output, entry, refresh = 'true', typeManifest = null }) {
  root = resolve(root);
  output = resolve(output);
  if (refresh === 'false') return verify(output, null);
  const contractDigest = hash(readFileSync(contractPath));
  const compilerDigest = astCompilerDigest();
  if (refresh !== 'dev' && refresh !== 'true') throw new Error(`${refresh} is not an artifact refresh policy`);
  const names = sourceNames(root);
  if (names.length === 0) throw new Error(`source graph has no .tpl files: ${root}`);
  if (!names.includes(entry)) throw new Error(`source graph entry is missing: ${entry}`);
  const sources = Object.fromEntries(names.map(name => [name, readFileSync(join(root, name))]));
  const sourceDigest = hash(Buffer.concat(names.flatMap(name => [Buffer.from(name + '\0'), sources[name], Buffer.from('\0')])));
  const typeDigest = typeManifest && existsSync(typeManifest) ? hash(readFileSync(typeManifest)) : hash(Buffer.alloc(0));
  if (refresh === 'true' && existsSync(join(output, 'manifest.json'))) {
    try {
      const current = verify(output, null);
      if (current.contractDigest === contractDigest && current.compilerDigest === compilerDigest && current.sourceDigest === sourceDigest && current.typeDigest === typeDigest && current.entry === entry) return current;
    } catch {
      // A changed or damaged artifact is rebuilt under the true refresh policy.
    }
  }
  const temporary = join(dirname(output), `.${basename(output)}-${process.pid}.tmp`);
  rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { recursive: true });
  try {
    const files = {};
    for (const name of names) {
      const ast = json(parse(sources[name], name));
      const path = `${name}.ast.json`;
      mkdirSync(dirname(join(temporary, path)), { recursive: true });
      writeFileSync(join(temporary, path), ast);
      files[name] = { path: posix.normalize(path), sourceDigest: hash(sources[name]), artifactDigest: hash(ast), lines: lineIndex(sources[name]) };
    }
    const manifest = { schema: 3, mode: 'ast', target: 'canonical', entry, sourceDigest, typeDigest, contractDigest, compilerDigest, files };
    writeFileSync(join(temporary, 'manifest.json'), json(manifest));
    mkdirSync(output, { recursive: true });
    for (const file of Object.values(files)) {
      mkdirSync(dirname(join(output, file.path)), { recursive: true });
      renameSync(join(temporary, file.path), join(output, file.path));
    }
    renameSync(join(temporary, 'manifest.json'), join(output, 'manifest.json'));
    rmSync(temporary, { recursive: true, force: true });
    return manifest;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
