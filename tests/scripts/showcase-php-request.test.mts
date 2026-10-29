// The PHP showcase adapter writes the request it renders with maps as JSON objects, as the other adapters do (T26.7-85).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { toolsDirectory } from '../../scripts/tools-directory.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the PHP adapter writes request.assign and an empty map as objects', () => {
  const run = spawnSync(path.join(toolsDirectory(ROOT), 'bin/php'), ['examples/showcase/adapters/php.php', 'examples/site/scenarios/compiler-coverage'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const output: unknown = JSON.parse(run.stdout);
  assert.ok(typeof output === 'object' && output !== null && 'request' in output);
  const request: unknown = output.request;
  assert.ok(typeof request === 'object' && request !== null && 'assign' in request);
  const assign: unknown = request.assign;
  assert.ok(typeof assign === 'object' && assign !== null && !Array.isArray(assign), `request.assign is ${JSON.stringify(assign).slice(0, 80)}`);
  assert.ok('empty_map' in assign);
  assert.deepEqual(assign.empty_map, {});
});
