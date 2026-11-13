import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { astManifestDocument, generatedManifestDocument, type GeneratedManifest } from './documents.mts';
import { ArtifactStaleError, readStale } from './ast-artifact.mts';
import { contractPath, hash, json } from './artifact-support.mts';
import { filesUnder } from './package-root.mts';

export function generatedManifestPath(output: string): string {
  return `${output}.manifest.json`;
}

// An artifact is one file at `output`, or a directory at `output` with one file per class (the PHP target, T25.1); the
// manifest beside it lists every file with its path, relative to the directory of a file artifact or to the directory
// artifact itself, and the digest of its bytes.
const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();
const artifactBase = (output: string): string => isDirectory(output) ? output : dirname(output);

/** The metadata that a generated artifact must record: the inputs it is built from. */
type Expected = Pick<GeneratedManifest, 'entry' | 'sourceDigest' | 'typeDigest' | 'contractDigest' | 'inputDigest'>;

function verifyGeneratedArtifact(output: string, target: string, expected: Expected | null = null): GeneratedManifest {
  const manifestPath = generatedManifestPath(output);
  if (!existsSync(manifestPath)) throw new ArtifactStaleError(`generated artifact manifest is missing: ${manifestPath}`);
  const manifest = readStale(() => generatedManifestDocument.read(manifestPath));
  if (manifest.target !== target) {
    throw new ArtifactStaleError('generated artifact manifest identity differs');
  }
  const files = Object.entries(manifest.files);
  const listed = isDirectory(output)
    ? files.length > 0 && filesUnder(output).join('\n') === files.map(([name]) => name).sort().join('\n')
    : files.length === 1 && files[0]?.[0] === basename(output);
  const intact = files.every(([name, file]) => file.path === name && existsSync(join(artifactBase(output), name)) && hash(readFileSync(join(artifactBase(output), name))) === file.artifactDigest);
  if (!listed || !intact) throw new ArtifactStaleError(`generated artifact files are missing or changed: ${output}`);
  if (expected) {
    for (const key of ['entry', 'sourceDigest', 'typeDigest', 'contractDigest', 'inputDigest'] as const) {
      if (manifest[key] !== expected[key]) throw new ArtifactStaleError(`generated artifact ${key} differs`);
    }
  }
  return manifest;
}

/**
 * The digest of the files that a compilation reads besides its AST artifact, type manifest and contract: the digest of
 * the bytes of each file, in the order of the sorted paths, so the same tree gives the same digest in any checkout.
 */
function inputDigest(inputs: readonly string[]): string {
  return hash([...inputs].map(file => resolve(file)).sort().map(file => hash(readFileSync(file))).join('\n'));
}

function expectedMetadata(graphPath: string, typeManifestPath: string, inputs: readonly string[] | undefined): Expected {
  const graph = astManifestDocument.read(graphPath);
  const typeBytes = readFileSync(typeManifestPath);
  const contractDigest = hash(readFileSync(contractPath));
  const typeDigest = hash(typeBytes);
  if (graph.typeDigest !== typeDigest) throw new Error('canonical AST and type manifest digests differ');
  if (graph.contractDigest !== contractDigest) throw new Error('canonical AST and compiler contract digests differ');
  const expected: Expected = { entry: graph.entry, sourceDigest: graph.sourceDigest, typeDigest, contractDigest };
  // A caller without inputs, such as a release install, writes the manifest of T27.1-78, which names no compiler file.
  if (inputs !== undefined) expected.inputDigest = inputDigest(inputs);
  return expected;
}

/**
 * The inputs of a generated artifact, its target, output and refresh policy and the
 * compilation, which returns the source of a file artifact, or the sources of a directory artifact by their relative paths.
 */
export interface GeneratedArtifactOptions {
  graphPath: string;
  typeManifestPath: string;
  target: string;
  output: string;
  refresh: string;
  compile: () => string | Record<string, string>;
  check?: boolean;
  /**
   * The files besides the AST artifact, the type manifest and the contract whose bytes the compilation reads, such as the
   * sources of the compiler in a checkout; refresh true rebuilds the artifact when one of them changed (T28.26).
   */
  inputs?: readonly string[];
}

/**
 * Writes, verifies or checks the generated artifact of a target by its refresh policy; the false policy needs no compiler
 * digest, since it only verifies the committed artifact.
 */
export function compileGeneratedArtifact(options: GeneratedArtifactOptions): GeneratedManifest {
  const { graphPath, typeManifestPath, target, refresh, compile, check = false } = options;
  const output = resolve(options.output);
  if (refresh === 'false') {
    if (check) throw new Error('artifact check cannot use the false refresh policy');
    return verifyGeneratedArtifact(output, target);
  }
  if (refresh !== 'dev' && refresh !== 'true') throw new Error(`${refresh} is not an artifact refresh policy`);
  const expected = expectedMetadata(resolve(graphPath), resolve(typeManifestPath), options.inputs);
  if (refresh === 'true' && !check) {
    try {
      return verifyGeneratedArtifact(output, target, expected);
    } catch (error) {
      // Only a missing or stale generated artifact is rebuilt under the true policy; any other failure is its own.
      if (!(error instanceof ArtifactStaleError)) throw error;
    }
  }
  // compile returns the source of a file artifact, or the sources of a directory artifact by their relative paths.
  const compiled = compile();
  const directory = typeof compiled !== 'string';
  const sources = typeof compiled === 'string' ? { [basename(output)]: compiled } : compiled;
  const manifest: GeneratedManifest = {
    schema: 4,
    mode: 'gen',
    target,
    ...expected,
    files: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, { path: name, artifactDigest: hash(source) }])),
  };
  const manifestSource = json(manifest);
  const manifestPath = generatedManifestPath(output);
  const base = directory ? output : dirname(output);
  if (check) {
    const current = directory ? isDirectory(output) && filesUnder(output).join('\n') === Object.keys(sources).sort().join('\n') : existsSync(output);
    if (!current || Object.entries(sources).some(([name, source]) => readFileSync(join(base, name), 'utf8') !== source)) throw new Error(`compiler artifact is stale: ${output}`);
    if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestSource) throw new Error(`compiler artifact manifest is stale: ${manifestPath}`);
    return manifest;
  }
  mkdirSync(dirname(output), { recursive: true });
  const temporaryOutput = `${output}.tmp-${process.pid}`;
  const temporaryManifest = `${manifestPath}.tmp-${process.pid}`;
  try {
    if (typeof compiled === 'string') {
      writeFileSync(temporaryOutput, compiled);
    } else {
      for (const [name, source] of Object.entries(compiled)) {
        mkdirSync(dirname(join(temporaryOutput, name)), { recursive: true });
        writeFileSync(join(temporaryOutput, name), source);
      }
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
