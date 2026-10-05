#!/usr/bin/env node
// Installs or removes the command `template-fmt` under a declared prefix without a symbolic link (T18.5).
//
// install: writes the npm project <prefix>/lib/polyspec-template-fmt, whose package.json depends on the formatter
// package and the template package of this checkout, installs both as copies without bin links, and writes the
// executable script <prefix>/bin/template-fmt, which runs node with the entry of the copied formatter package by its
// absolute path. A later install replaces both, so a changed build of the formatter is installed again.
// uninstall: removes the project and the script.
//
// Usage: node scripts/install-cli.mjs install|uninstall --prefix <directory>
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({ options: { prefix: { type: 'string' } }, allowPositionals: true });
const [action] = positionals;
if (!['install', 'uninstall'].includes(action) || positionals.length !== 1 || !values.prefix || !isAbsolute(values.prefix)) {
  throw new Error('usage: install-cli.mjs install|uninstall --prefix <absolute directory>');
}
const project = join(values.prefix, 'lib', 'polyspec-template-fmt');
const command = join(values.prefix, 'bin', 'template-fmt');
const entry = join(project, 'node_modules', '@polyspec', 'template-language', 'bin', 'template-fmt.mjs');

rmSync(command, { force: true });
rmSync(project, { recursive: true, force: true });
if (action === 'uninstall') {
  process.stdout.write(`install-cli: removed ${command} and ${project}\n`);
} else {
  mkdirSync(project, { recursive: true });
  const language = join(root, 'packages', 'template-language');
  const template = join(root, 'packages', 'template-ts');
  writeFileSync(join(project, 'package.json'), `${JSON.stringify({
    private: true,
    dependencies: { '@polyspec/template-language': `file:${language}`, '@polyspec/template': `file:${template}` },
    overrides: { '@polyspec/template': `file:${template}` },
  }, null, 2)}\n`);
  writeFileSync(join(project, '.npmrc'), 'install-links=true\nbin-links=false\n');
  process.stdout.write(`install-cli: npm install in ${project}\n`);
  const result = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: project, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`npm install in ${project} exited with ${result.status ?? result.signal}`);
  if (!existsSync(entry)) throw new Error(`${entry} is missing; run make build-language`);
  mkdirSync(dirname(command), { recursive: true });
  writeFileSync(command, `#!/bin/sh\nexec node '${entry}' "$@"\n`);
  chmodSync(command, 0o755);
  process.stdout.write(`install-cli: wrote ${command}, which runs ${entry}\n`);
}
