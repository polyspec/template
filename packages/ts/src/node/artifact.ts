// The artifact-runtime of RT-56 (docs/spec/runtime.md): loads an AST artifact that the build compiler wrote, checks every
// file against its digest, and returns the program that renders it. The loaded templates keep the digest as their version (RT-10).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTemplate } from '../decode.js';
import { AstProgram } from '../index.js';
import type { Loader, LoadResult } from '../loader.js';

interface ArtifactFile {
  path: string;
  artifactDigest: string;
}

interface ArtifactManifest {
  mode: string;
  entry: string;
  files: Map<string, ArtifactFile>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the parsed JSON of a manifest; a value of another shape fails with what it lacks. */
function readManifest(value: unknown, directory: string): ArtifactManifest {
  if (!isRecord(value) || value.mode !== 'ast') {
    const mode = isRecord(value) ? String(value.mode) : typeof value;
    throw new Error(`the artifact in ${directory} is not an AST artifact: ${mode}`);
  }
  if (typeof value.entry !== 'string' || !isRecord(value.files)) throw new Error('AST artifact source graph is incomplete');
  const files = new Map<string, ArtifactFile>();
  for (const [name, file] of Object.entries(value.files)) {
    if (!isRecord(file) || typeof file.path !== 'string' || typeof file.artifactDigest !== 'string') {
      throw new Error(`AST artifact manifest has a file without a path or a digest: ${name}`);
    }
    files.set(name, { path: file.path, artifactDigest: file.artifactDigest });
  }
  return { mode: value.mode, entry: value.entry, files };
}

class ArtifactLoader implements Loader {
  constructor(private readonly templates: Map<string, LoadResult>) {}

  load(name: string): LoadResult | null {
    return this.templates.get(name) ?? null;
  }
}

/**
 * The artifact in a directory is missing or stale: its manifest or one of its files is absent, or a file does not match its
 * digest. It is the one failure that a build fixes, so loadOrRefresh rebuilds on it under `true` and on nothing else.
 */
export class ArtifactStaleError extends Error {
  override name = 'ArtifactStaleError';
}

/**
 * Loads the AST artifact in `directory` and returns the program that renders its templates (RT-56). A missing or stale
 * artifact fails with ArtifactStaleError; any other failure (a file that cannot be read, a manifest that is not JSON, an AST
 * that does not decode) fails with its own error.
 */
export function loadArtifact(directory: string): AstProgram {
  const manifestPath = join(directory, 'manifest.json');
  if (!existsSync(manifestPath)) throw new ArtifactStaleError(`AST artifact manifest is missing: ${manifestPath}`);
  const manifest = readManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), directory);
  if (!manifest.files.has(manifest.entry)) throw new Error('AST artifact source graph is incomplete');
  const templates = new Map<string, LoadResult>();
  for (const [name, file] of manifest.files) {
    const path = join(directory, file.path);
    if (!existsSync(path)) throw new ArtifactStaleError(`AST artifact file is missing: ${name}`);
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== file.artifactDigest) {
      throw new ArtifactStaleError(`AST artifact file does not match its digest: ${name}`);
    }
    templates.set(name, { ast: decodeTemplate(JSON.parse(bytes.toString('utf8'))), version: file.artifactDigest });
  }
  return new AstProgram({ loader: new ArtifactLoader(templates) });
}

/** The refresh policy of an artifact store (RT-76, the ArtifactRefresh of packages/compiler/interface.json). */
export type ArtifactRefreshPolicy = 'dev' | 'true' | 'false';

/**
 * ArtifactStore.loadOrRefresh (docs/spec/runtime.md): returns the program of the artifact in `directory`, building it first
 * when the policy asks. `build` writes the AST artifact of the sources (the build compiler, passed in by the host, so the
 * runtime does not carry the compiler). `dev` builds on every call; `true` reuses a verified artifact and rebuilds only a
 * missing or stale one (ArtifactStaleError), letting every other failure through; `false` loads the artifact that exists and
 * fails when there is none.
 */
export function loadOrRefresh(directory: string, refresh: ArtifactRefreshPolicy, build: (directory: string) => void): AstProgram {
  if (refresh === 'false') return loadArtifact(directory);
  if (refresh === 'dev') {
    build(directory);
    return loadArtifact(directory);
  }
  try {
    return loadArtifact(directory);
  } catch (error) {
    if (!(error instanceof ArtifactStaleError)) throw error;
  }
  build(directory);
  return loadArtifact(directory);
}
