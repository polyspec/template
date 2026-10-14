// The manifest of a compiled artifact (RT-57), described once: the manifest.json of a canonical AST graph and the
// <file>.manifest.json of a generated program, as the compiler of packages/compiler writes them.
import { jsonDocument } from './json-document.mts';

/** A file of an artifact: its path under the directory of the manifest. */
export interface ArtifactFile {
  path: string;
}

/** The manifest of an AST or generated artifact. */
export interface ArtifactManifest {
  schema: number;
  mode: string;
  target: string;
  entry: string;
  compilerDigest: string;
  files: Record<string, ArtifactFile>;
}

export const artifactManifestDocument = jsonDocument<ArtifactManifest>('artifact manifest', {
  type: 'object',
  required: ['schema', 'mode', 'target', 'entry', 'compilerDigest', 'files'],
  properties: {
    schema: { type: 'integer' },
    mode: { type: 'string' },
    target: { type: 'string' },
    entry: { type: 'string' },
    compilerDigest: { type: 'string' },
    files: { type: 'object', additionalProperties: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } },
  },
});
