import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const contractPath = join(projectRoot, 'tools/compiler/interface.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';

export function generatedManifestPath(output) {
  return `${output}.manifest.json`;
}

export function verifyGeneratedArtifact(output, target, expected = null) {
  const manifestPath = generatedManifestPath(output);
  if (!existsSync(manifestPath)) throw new Error(`generated artifact manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 3 || manifest.mode !== 'gen' || manifest.target !== target) {
    throw new Error('generated artifact manifest identity differs');
  }
  const file = manifest.files?.[basename(output)];
  if (!file || file.path !== basename(output) || !existsSync(output) || hash(readFileSync(output)) !== file.artifactDigest) {
    throw new Error(`generated artifact is missing or corrupt: ${output}`);
  }
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
  const source = compile();
  const artifactDigest = hash(source);
  const manifest = {
    schema: 3,
    mode: 'gen',
    target,
    ...expected,
    files: { [basename(output)]: { path: basename(output), artifactDigest } },
  };
  const manifestSource = json(manifest);
  const manifestPath = generatedManifestPath(output);
  if (check) {
    if (!existsSync(output) || readFileSync(output, 'utf8') !== source) throw new Error(`compiler artifact is stale: ${output}`);
    if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestSource) throw new Error(`compiler artifact manifest is stale: ${manifestPath}`);
    return manifest;
  }
  mkdirSync(dirname(output), { recursive: true });
  const temporarySource = `${output}.tmp-${process.pid}`;
  const temporaryManifest = `${manifestPath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporarySource, source);
    writeFileSync(temporaryManifest, manifestSource);
    renameSync(temporarySource, output);
    renameSync(temporaryManifest, manifestPath);
  } finally {
    rmSync(temporarySource, { force: true });
    rmSync(temporaryManifest, { force: true });
  }
  return manifest;
}
