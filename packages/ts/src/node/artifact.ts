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
  schema: number;
  mode: string;
  entry: string;
  files: Record<string, ArtifactFile>;
}

class ArtifactLoader implements Loader {
  constructor(private readonly templates: Map<string, LoadResult>) {}

  load(name: string): LoadResult | null {
    return this.templates.get(name) ?? null;
  }
}

/** Loads the AST artifact in `directory` and returns the program that renders its templates (RT-56). */
export function loadArtifact(directory: string): AstProgram {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as ArtifactManifest;
  if (manifest.mode !== 'ast') throw new Error(`the artifact in ${directory} is not an AST artifact: ${manifest.mode}`);
  if (!manifest.files[manifest.entry]) throw new Error('AST artifact source graph is incomplete');
  const templates = new Map<string, LoadResult>();
  for (const [name, file] of Object.entries(manifest.files)) {
    const path = join(directory, file.path);
    if (!existsSync(path)) throw new Error(`AST artifact is missing or corrupt: ${name}`);
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== file.artifactDigest) throw new Error(`AST artifact is missing or corrupt: ${name}`);
    templates.set(name, { ast: decodeTemplate(JSON.parse(bytes.toString('utf8'))), version: file.artifactDigest });
  }
  return new AstProgram({ loader: new ArtifactLoader(templates) });
}
