#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/runtime/interface.json'), 'utf8'));
if (manifest.schema !== 1 || manifest.name !== 'PreparedRender') throw new Error('invalid runtime interface manifest');
if (!Array.isArray(manifest.operations) || manifest.operations.map(item => item.name).join(',') !== 'prepare,render') {
  throw new Error('runtime interface must declare prepare and render in order');
}
const files = {
  rust: ['packages/template-rust/src/render/engine.rs', /pub fn prepare</, /pub fn render/],
  go: ['packages/template-go/render/engine.go', /func \(e \*Engine\) Prepare/, /func \(p \*PreparedRender\) Render/],
  typescript: ['packages/template-ts/src/render/engine.ts', /prepare\(target:/, /class PreparedRender[\s\S]*?render\(\)/],
  php: ['packages/template-php/src/Engine.php', /public function prepare\(/, /class PreparedRender[\s\S]*?public function render\(/],
};
for (const [language, [relative, enginePattern, preparedPattern]] of Object.entries(files)) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  if (!enginePattern.test(source)) throw new Error(`${language}: missing Engine prepare operation`);
  if (!preparedPattern.test(source)) throw new Error(`${language}: missing PreparedRender render operation`);
  const mapping = manifest.languages[language];
  if (!mapping || !mapping.engine || !mapping.prepared) throw new Error(`${language}: missing manifest mapping`);
}
process.stdout.write('runtime interface: four language mappings passed\n');
