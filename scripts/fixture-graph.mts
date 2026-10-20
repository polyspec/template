// The canonical AST graph of a fixture, which the generated checks compile into every backend.
import { join } from 'node:path';
import { compileAst } from '../packages/compiler/src/ast-artifact.mts';

/** Compiles the fixture directory `fixture` from its `entry` template into the directory `ast` of `workspace`; returns the path of its manifest.json. */
export function compileFixtureGraph(workspace: string, fixture: string, entry: string, typeManifest: string): string {
  const graph = join(workspace, 'ast');
  compileAst({ root: fixture, output: graph, entry, refresh: 'dev', typeManifest });
  return join(graph, 'manifest.json');
}
