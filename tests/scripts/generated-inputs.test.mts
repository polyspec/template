// A generated artifact depends on the bytes of the compiler that writes it as well as on its AST artifact, type manifest
// and contract, so a result of refresh true depends on the tree alone only when the judgement reads those bytes: the
// typed generator of the showcase (examples/showcase/compile-generated.mts) passes the files of packages/compiler that a
// compilation reads as the inputs of each artifact, and refresh true rebuilds an artifact whose inputs changed. Without
// them a checkout whose backend changed keeps the artifact of the earlier backend, which an empty checkout does not.
// A caller that passes no inputs, such as a release install, writes the manifest of T27.1-78 unchanged.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';
import { compileAst } from '../../packages/compiler/src/ast-artifact.mts';
import { compileGeneratedArtifact, generatedManifestPath } from '../../packages/compiler/src/generated-artifact.mts';
import { root } from '../runner/drivers.mts';

const temporary = mkdtempSync(join(tmpdir(), 'polyspec-generated-inputs-'));
after(() => rmSync(temporary, { recursive: true, force: true }));

const sources = join(temporary, 'templates');
mkdirSync(sources);
writeFileSync(join(sources, 'page.tpl'), 'Hello\n');
const types = join(temporary, 'types.json');
writeFileSync(types, '');
const graph = join(temporary, 'ast');
compileAst({ root: sources, output: graph, entry: 'page.tpl', refresh: 'dev', typeManifest: types });
const never = (): string => { throw new Error('the artifact is current, so nothing compiles'); };

test('refresh true rebuilds a generated artifact when a file of its inputs changes, and only then', () => {
  const backend = join(temporary, 'backend.mts');
  writeFileSync(backend, 'export const form = 1;\n');
  const output = join(temporary, 'page.rust');
  const options = { graphPath: join(graph, 'manifest.json'), typeManifestPath: types, target: 'rust', output, inputs: [backend] };
  compileGeneratedArtifact({ ...options, refresh: 'dev', compile: () => 'first\n' });
  const manifest: unknown = JSON.parse(readFileSync(generatedManifestPath(output), 'utf8'));
  assert.ok(typeof manifest === 'object' && manifest !== null && 'inputDigest' in manifest, 'the manifest records the digest of its inputs');
  compileGeneratedArtifact({ ...options, refresh: 'true', compile: never });
  writeFileSync(backend, 'export const form = 2;\n');
  compileGeneratedArtifact({ ...options, refresh: 'true', compile: () => 'second\n' });
  assert.equal(readFileSync(output, 'utf8'), 'second\n', 'a changed input rebuilds the artifact');
  compileGeneratedArtifact({ ...options, refresh: 'true', compile: never });
});

test('the typed generator of the showcase declares the files of the compiler as the inputs of its artifacts', async () => {
  const { compilerInputs } = await import('../../examples/showcase/generated-output.mts');
  const inputs = compilerInputs().map((file: string) => relative(root, file));
  for (const file of ['packages/compiler/src/backends/rust.mts', 'packages/compiler/src/backend-support.mts', 'packages/compiler/src/ir.mts', 'packages/compiler/backends/go/generated_value.go', 'packages/compiler/functions.json']) {
    assert.ok(inputs.includes(file), `the inputs name ${file}`);
  }
  const generator = readFileSync(join(root, 'examples/showcase/compile-generated.mts'), 'utf8');
  assert.match(generator, /inputs: /u, 'compile-generated.mts passes inputs to compileGeneratedArtifact');
});
