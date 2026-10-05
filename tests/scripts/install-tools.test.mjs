// Tests scripts/install-tools.mjs (`make install-tools`, T19.2): it installs the npm of `packageManager` in package.json
// and the Go of the go directive of packages/template-go/go.mod into var/tools, writes wrapper scripts and no symbolic
// link into var/tools/bin, starts the npm and Go of the machine without var/tools/bin on PATH, and skips an install
// when the exact version is present, so a second run starts no install. The fixture is a temporary repository with a
// copy of the script; `npm` and `go` are stubs on PATH that log their arguments and write what the real commands write.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { goToolchainModule } from '../../scripts/install-tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE = goToolchainModule('1.27.1');

function fixture(t) {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'template-install-tools-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repository = path.join(base, 'repository');
  mkdirSync(path.join(repository, 'scripts'), { recursive: true });
  mkdirSync(path.join(repository, 'packages/template-go'), { recursive: true });
  copyFileSync(path.join(ROOT, 'scripts/install-tools.mjs'), path.join(repository, 'scripts/install-tools.mjs'));
  writeFileSync(path.join(repository, 'package.json'), '{ "packageManager": "npm@12.2.0" }\n');
  writeFileSync(path.join(repository, 'packages/template-go/go.mod'), 'module example.com/template\n\ngo 1.27.1\n');
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  const log = path.join(base, 'calls.log');
  writeFileSync(log, '');
  // npm install --prefix <directory> ... npm@<version> writes node_modules/npm of that version.
  writeFileSync(path.join(bin, 'npm'), `#!/bin/sh
echo "npm $*" >> "${log}"
prefix=$3; version=\${9#npm@}
mkdir -p "$prefix/node_modules/npm/bin"
echo "{ \\"version\\": \\"$version\\" }" > "$prefix/node_modules/npm/package.json"
echo "console.log('npm $version');" > "$prefix/node_modules/npm/bin/npm-cli.js"
`);
  // go mod download <module> writes the toolchain into GOMODCACHE without file modes, as the module zip has none.
  writeFileSync(path.join(bin, 'go'), `#!/bin/sh
echo "go $* GOMODCACHE=$GOMODCACHE GOTOOLCHAIN=$GOTOOLCHAIN" >> "${log}"
root="$GOMODCACHE/$4"; mkdir -p "$root/bin" "$root/pkg/tool/os_arch"
printf 'go1.27.1\\ntime 2026-09-01\\n' > "$root/VERSION"
printf '#!/bin/sh\\necho "toolchain go $*"\\n' > "$root/bin/go"; printf '#!/bin/sh\\n' > "$root/bin/gofmt"; printf '#!/bin/sh\\n' > "$root/pkg/tool/os_arch/compile"
chmod 644 "$root/bin/go" "$root/bin/gofmt" "$root/pkg/tool/os_arch/compile"
`);
  for (const name of ['npm', 'go']) chmodSync(path.join(bin, name), 0o755);
  // A wrapper of an earlier install on PATH would install its own replacement; the script must not start it.
  const tools = path.join(repository, 'var/tools/bin');
  mkdirSync(tools, { recursive: true });
  for (const name of ['npm', 'go']) {
    writeFileSync(path.join(tools, name), `#!/bin/sh\necho "stale ${name} $*" >> "${log}"\nexit 1\n`);
    chmodSync(path.join(tools, name), 0o755);
  }
  const run = () => spawnSync(process.execPath, ['scripts/install-tools.mjs'], {
    cwd: repository, encoding: 'utf8', env: { ...process.env, PATH: [tools, bin, process.env.PATH].join(path.delimiter) },
  });
  const calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return { repository, run, calls };
}

test('install-tools installs npm and Go once, with wrappers and without a symbolic link', (t) => {
  const tools = fixture(t);
  const first = tools.run();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const calls = tools.calls();
  assert.equal(calls.length, 2, calls.join('\n'));
  assert.match(calls[0], /^npm install --prefix \S+\/var\/tools\/npm\.next-\d+ .*--no-bin-links.* npm@12\.2\.0$/);
  assert.match(calls[1], new RegExp(`^go mod download -x ${MODULE.replaceAll('.', '\\.')} GOMODCACHE=\\S+/var/tools/go GOTOOLCHAIN=local$`));
  for (const name of ['npm', 'go', 'gofmt']) {
    const wrapper = path.join(tools.repository, 'var/tools/bin', name);
    assert.ok(lstatSync(wrapper).isFile(), `var/tools/bin/${name} is not a file`);
    assert.equal(statSync(wrapper).mode & 0o111, 0o111, `var/tools/bin/${name} is not executable`);
  }
  const go = spawnSync(path.join(tools.repository, 'var/tools/bin/go'), ['version'], { encoding: 'utf8' });
  assert.equal(go.stdout.trim(), 'toolchain go version', `the go wrapper does not start the installed toolchain: ${go.stderr}`);
  const goroot = path.join(tools.repository, 'var/tools/go', MODULE);
  assert.equal(statSync(path.join(goroot, 'pkg/tool/os_arch/compile')).mode & 0o111, 0o111, 'the tools of pkg/tool are not executable');
  const npm = spawnSync(path.join(tools.repository, 'var/tools/bin/npm'), [], { encoding: 'utf8' });
  assert.equal(npm.stdout.trim(), 'npm 12.2.0');

  const second = tools.run();
  assert.equal(second.status, 0, second.stdout + second.stderr);
  assert.deepEqual(tools.calls(), calls, 'the second run started an install although the exact versions are present');
  assert.match(second.stdout, /npm 12\.2\.0 is installed/);
  assert.match(second.stdout, /Go 1\.27\.1 is installed/);
});

test('install-tools replaces npm of another version', (t) => {
  const tools = fixture(t);
  assert.equal(tools.run().status, 0);
  writeFileSync(path.join(tools.repository, 'package.json'), '{ "packageManager": "npm@12.3.0" }\n');
  const run = tools.run();
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(tools.calls().at(-1), /npm@12\.3\.0$/);
  assert.match(run.stdout, /installed npm 12\.3\.0 in var\/tools\/npm \(was 12\.2\.0\)/);
  assert.equal(JSON.parse(readFileSync(path.join(tools.repository, 'var/tools/npm/node_modules/npm/package.json'), 'utf8')).version, '12.3.0');
});

test('install-tools names the expected form of packageManager', (t) => {
  const tools = fixture(t);
  writeFileSync(path.join(tools.repository, 'package.json'), '{ "packageManager": "npm@12" }\n');
  const run = tools.run();
  assert.equal(run.status, 1);
  assert.match(run.stderr, /package\.json packageManager is "npm@12", expected npm@<major>\.<minor>\.<patch>/);
  assert.deepEqual(tools.calls(), []);
});
