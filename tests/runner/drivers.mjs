// Language drivers for the conformance and parity runners.
// Each driver builds its CLI when the binary is absent and runs `parse` or `render`.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = join(root, 'packages');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 10000,
    cwd: options.cwd ?? root,
    env: { ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function build(name, command, args, cwd) {
  const result = run(command, args, { cwd, timeout: 600000 });
  if (result.status !== 0) {
    throw new Error(`${name}: build failed\n${result.stdout}${result.stderr}`);
  }
}

// The shared library of the PHP extension: .dylib on macOS, .so elsewhere.
function extensionPath() {
  const dir = join(packages, 'template-php-ext', 'target', 'release');
  const dylib = join(dir, 'libpolyspec_template.dylib');
  return existsSync(dylib) ? dylib : join(dir, 'libpolyspec_template.so');
}

export const drivers = {
  ts: {
    dir: join(packages, 'template-ts'),
    binary: join(packages, 'template-ts', 'dist', 'index.mjs'),
    build() {
      build('ts', 'npm', ['run', 'build', '-w', '@polyspec/template'], root);
    },
    command(args) {
      return ['node', [join(packages, 'template-ts', 'bin', 'template.mjs'), ...args]];
    },
  },
  go: {
    dir: join(packages, 'template-go'),
    binary: join(packages, 'template-go', 'template'),
    build() {
      build('go', 'go', ['build', '-o', 'template', './cmd/template'], join(packages, 'template-go'));
    },
    command(args) {
      return [join(packages, 'template-go', 'template'), args];
    },
  },
  rust: {
    dir: join(packages, 'template-rust'),
    binary: join(packages, 'template-rust', 'target', 'release', 'template'),
    build() {
      build('rust', 'cargo', ['build', '--locked', '--release', '--bin', 'template'], join(packages, 'template-rust'));
    },
    command(args) {
      return [join(packages, 'template-rust', 'target', 'release', 'template'), args];
    },
  },
  php: {
    dir: join(packages, 'template-php'),
    binary: join(packages, 'template-php', 'vendor', 'autoload.php'),
    build() {
      build('php', 'composer', ['install', '--no-interaction', '--quiet'], join(packages, 'template-php'));
    },
    command(args) {
      return ['php', [join(packages, 'template-php', 'bin', 'template.php'), ...args]];
    },
  },
  'php-ext': {
    dir: join(packages, 'template-php-ext'),
    get binary() {
      return extensionPath();
    },
    build() {
      build('php-ext', `${process.env.HOME}/.cargo/bin/cargo`, ['build', '--locked', '--release'], join(packages, 'template-php-ext'));
    },
    command(args) {
      return ['php', [`-dextension=${extensionPath()}`, join(packages, 'template-php-ext', 'bin', 'template-ext.php'), ...args]];
    },
  },
};

export function available(name) {
  return existsSync(drivers[name].dir);
}

export function prepare(name) {
  const driver = drivers[name];
  if (!existsSync(driver.dir)) throw new Error(`${name}: package directory is absent (${driver.dir})`);
  if (!existsSync(driver.binary)) driver.build();
}

// Runs one CLI invocation and returns {status, stdout, stderr}.
export function invoke(name, args, cwd) {
  const [command, argv] = drivers[name].command(args);
  const result = run(command, argv, { cwd });
  if (result.error) {
    return { status: -1, stdout: '', stderr: result.error.message };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function selectLanguages(option) {
  const all = Object.keys(drivers);
  if (!option) return all.filter(available);
  const names = option.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of names) {
    if (!drivers[name]) throw new Error(`unknown language: ${name} (known: ${all.join(', ')})`);
  }
  return names;
}
