import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const contractPath = fileURLToPath(new URL('./interface.json', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

export function generatedManifestPath(output) {
  return `${output}.manifest.json`;
}

// An artifact is one file at `output`, or a directory at `output` with one file per class (the PHP target, T25.1); the
// manifest beside it lists every file with its path, relative to the directory of a file artifact or to the directory
// artifact itself, and the digest of its bytes.
const isDirectory = path => existsSync(path) && statSync(path).isDirectory();
const artifactBase = output => isDirectory(output) ? output : dirname(output);

/** The files under a directory, as paths relative to it with `/`, sorted. */
function directoryFiles(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(directory, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .sort();
}

function verifyGeneratedArtifact(output, target, expected = null) {
  const manifestPath = generatedManifestPath(output);
  if (!existsSync(manifestPath)) throw new Error(`generated artifact manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 3 || manifest.mode !== 'gen' || manifest.target !== target) {
    throw new Error('generated artifact manifest identity differs');
  }
  const files = Object.entries(manifest.files ?? {});
  const listed = isDirectory(output)
    ? files.length > 0 && directoryFiles(output).join('\n') === files.map(([name]) => name).sort().join('\n')
    : files.length === 1 && files[0][0] === basename(output);
  const intact = files.every(([name, file]) => file.path === name && existsSync(join(artifactBase(output), name)) && hash(readFileSync(join(artifactBase(output), name))) === file.artifactDigest);
  if (!listed || !intact) throw new Error(`generated artifact is missing or corrupt: ${output}`);
  if (expected) {
    for (const key of ['entry', 'sourceDigest', 'typeDigest', 'contractDigest', 'compilerDigest']) {
      if (manifest[key] !== expected[key]) throw new Error(`generated artifact ${key} differs`);
    }
  }
  return manifest;
}

function expectedMetadata(graphPath, typeManifestPath) {
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  if (graph.schema !== 3 || graph.mode !== 'ast' || graph.target !== 'canonical') {
    throw new Error('generated compiler requires a canonical AST artifact manifest');
  }
  const typeBytes = readFileSync(typeManifestPath);
  const contractDigest = hash(readFileSync(contractPath));
  const typeDigest = hash(typeBytes);
  if (graph.typeDigest !== typeDigest) throw new Error('canonical AST and type manifest digests differ');
  if (graph.contractDigest !== contractDigest) throw new Error('canonical AST and compiler contract digests differ');
  return { entry: graph.entry, sourceDigest: graph.sourceDigest, typeDigest, contractDigest };
}

/**
 * Writes, verifies or checks the generated artifact of a target by its refresh policy; the false policy needs no compiler
 * digest, since it only verifies the committed artifact.
 * @param {{ graphPath: string, typeManifestPath: string, target: string, output: string, refresh: string, compilerDigest?: string, compile: () => string | Record<string, string>, check?: boolean }} options
 */
export function compileGeneratedArtifact({ graphPath, typeManifestPath, target, output, refresh, compilerDigest, compile, check = false }) {
  output = resolve(output);
  if (refresh === 'false') {
    if (check) throw new Error('artifact check cannot use the false refresh policy');
    return verifyGeneratedArtifact(output, target);
  }
  if (refresh !== 'dev' && refresh !== 'true') throw new Error(`${refresh} is not an artifact refresh policy`);
  if (typeof compilerDigest !== 'string' || compilerDigest.length !== 64) throw new Error('generated compiler digest is missing');
  const expected = { ...expectedMetadata(resolve(graphPath), resolve(typeManifestPath)), compilerDigest };
  if (refresh === 'true' && !check) {
    try {
      return verifyGeneratedArtifact(output, target, expected);
    } catch {
      // A stale or damaged generated artifact is rebuilt under the true policy.
    }
  }
  // compile returns the source of a file artifact, or the sources of a directory artifact by their relative paths.
  const compiled = compile();
  const directory = typeof compiled !== 'string';
  const sources = directory ? compiled : { [basename(output)]: compiled };
  const manifest = {
    schema: 3,
    mode: 'gen',
    target,
    ...expected,
    files: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, { path: name, artifactDigest: hash(source) }])),
  };
  const manifestSource = json(manifest);
  const manifestPath = generatedManifestPath(output);
  const base = directory ? output : dirname(output);
  if (check) {
    const current = directory ? isDirectory(output) && directoryFiles(output).join('\n') === Object.keys(sources).sort().join('\n') : existsSync(output);
    if (!current || Object.entries(sources).some(([name, source]) => readFileSync(join(base, name), 'utf8') !== source)) throw new Error(`compiler artifact is stale: ${output}`);
    if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestSource) throw new Error(`compiler artifact manifest is stale: ${manifestPath}`);
    return manifest;
  }
  mkdirSync(dirname(output), { recursive: true });
  const temporaryOutput = `${output}.tmp-${process.pid}`;
  const temporaryManifest = `${manifestPath}.tmp-${process.pid}`;
  try {
    if (directory) {
      for (const [name, source] of Object.entries(sources)) {
        mkdirSync(dirname(join(temporaryOutput, name)), { recursive: true });
        writeFileSync(join(temporaryOutput, name), source);
      }
    } else {
      writeFileSync(temporaryOutput, sources[basename(output)]);
    }
    writeFileSync(temporaryManifest, manifestSource);
    // A directory artifact replaces the whole directory, so it holds no file of an earlier build.
    rmSync(output, { recursive: true, force: true });
    renameSync(temporaryOutput, output);
    renameSync(temporaryManifest, manifestPath);
  } finally {
    rmSync(temporaryOutput, { recursive: true, force: true });
    rmSync(temporaryManifest, { force: true });
  }
  return manifest;
}
