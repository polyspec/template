#!/usr/bin/env node
// Installs or removes the command `template-fmt` under a declared prefix without a symbolic link (T18.5).
//
// install: prepares the npm project <prefix>/lib/.polyspec-template-fmt.next-<pid>, whose package.json depends on the
// formatter package and the template package of this checkout, installs both as copies without bin links, renames it
// to <prefix>/lib/polyspec-template-fmt, and writes the executable script <prefix>/bin/template-fmt through a temporary
// file and a rename; the script runs node with the entry of the copied formatter package by its absolute path. A
// later install replaces both, so a changed build of the formatter is installed again; a failed install removes its
// prepared directory and keeps the previous install (T19.7).
// uninstall: removes the project and the script.
//
// Usage: node scripts/install-cli.mjs install|uninstall --prefix <directory>
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

if (action === 'uninstall') {
  rmSync(command, { force: true });
  rmSync(project, { recursive: true, force: true });
  process.stdout.write(`install-cli: removed ${command} and ${project}\n`);
} else {
  const next = join(values.prefix, 'lib', `.polyspec-template-fmt.next-${process.pid}`);
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next, { recursive: true });
  try {
    const language = join(root, 'packages', 'template-language');
    const template = join(root, 'packages', 'template-ts');
    writeFileSync(join(next, 'package.json'), `${JSON.stringify({
      private: true,
      dependencies: { '@polyspec/template-language': `file:${language}`, '@polyspec/template': `file:${template}` },
      overrides: { '@polyspec/template': `file:${template}` },
    }, null, 2)}\n`);
    writeFileSync(join(next, '.npmrc'), 'install-links=true\nbin-links=false\n');
    process.stdout.write(`install-cli: npm install in ${next}\n`);
    const result = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: next, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`npm install in ${next} exited with ${result.status ?? result.signal}; the previous install is unchanged`);
    if (!existsSync(join(next, 'node_modules', '@polyspec', 'template-language', 'bin', 'template-fmt.mjs'))) throw new Error(`the formatter entry is missing in ${next}; run make build-language`);
    // The previous project moves aside and the prepared one takes its name; the script switches to it with a rename.
    const previous = join(values.prefix, 'lib', `.polyspec-template-fmt.previous-${process.pid}`);
    if (existsSync(project)) renameSync(project, previous);
    renameSync(next, project);
    rmSync(previous, { recursive: true, force: true });
  } finally {
    rmSync(next, { recursive: true, force: true });
  }
  mkdirSync(dirname(command), { recursive: true });
  writeFileSync(`${command}.next-${process.pid}`, `#!/bin/sh\nexec node '${entry}' "$@"\n`);
  chmodSync(`${command}.next-${process.pid}`, 0o755);
  renameSync(`${command}.next-${process.pid}`, command);
  process.stdout.write(`install-cli: wrote ${command}, which runs ${entry}\n`);
}
