#!/usr/bin/env node
// Render throughput comparison of the implementations.
//
// Options:
//   --langs ts,go,rust,php,php-ext   implementations to measure (default: the four core implementations)
//   --fixture NAME           measure one fixture (default: every fixture)
//   --iters N                measured renders per fixture and implementation (default 50000)
//   --warmup N               unmeasured renders before the measurement (default 5000)
//   --fixtures-dir DIR       read fixtures from DIR instead of tools/bench/fixtures
//   --output-md FILE         write the Markdown table to FILE (default tools/bench/results.md)
//   --output-json FILE       write the raw measurements to FILE
//   --json                   print the raw measurements as JSON and write no table
//
// Every implementation renders the same fixture. The run fails when two implementations
// produce different output, because a timing comparison of different work means nothing.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchDir = resolve(dirname(fileURLToPath(import.meta.url)));
const root = resolve(benchDir, '..', '..');
const defaultFixturesDir = join(benchDir, 'fixtures');
const driversDir = join(benchDir, 'drivers');
const packages = join(root, 'packages');

const options = {
  langs: null,
  fixture: null,
  iters: 50000,
  warmup: 5000,
  json: false,
  fixturesDir: defaultFixturesDir,
  outputMd: join(benchDir, 'results.md'),
  outputJson: null,
};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--langs': options.langs = argv[++i]; break;
    case '--fixture': options.fixture = argv[++i]; break;
    case '--iters': options.iters = Number(argv[++i]); break;
    case '--warmup': options.warmup = Number(argv[++i]); break;
    case '--fixtures-dir': options.fixturesDir = resolve(argv[++i]); break;
    case '--output-md': options.outputMd = resolve(argv[++i]); break;
    case '--output-json': options.outputJson = resolve(argv[++i]); break;
    case '--json': options.json = true; break;
    case '--help':
      process.stdout.write('usage: run.mjs [--langs a,b] [--fixture name] [--fixtures-dir DIR] [--iters N] [--warmup N] [--output-md FILE] [--output-json FILE] [--json]\n');
      process.exit(0);
      break;
    default:
      process.stderr.write(`unknown option: ${argv[i]}\n`);
      process.exit(1);
  }
}
if (!Number.isInteger(options.iters) || options.iters <= 0) {
  process.stderr.write('--iters must be a positive integer\n');
  process.exit(1);
}
if (!Number.isInteger(options.warmup) || options.warmup < 0) {
  process.stderr.write('--warmup must be a non-negative integer\n');
  process.exit(1);
}

const cargo = `${process.env.HOME}/.cargo/bin/cargo`;

function run(command, args, cwd, timeout) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    cwd: cwd ?? root,
    timeout: timeout ?? 600000,
    env: { ...process.env, PATH: `${process.env.HOME}/.cargo/bin:${process.env.PATH}` },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function build(name, command, args, cwd) {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(`${name}: build failed\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
}

const drivers = {
  ts: {
    package: join(packages, 'template-ts'),
    prepare() {
      if (!existsSync(join(packages, 'template-ts', 'dist', 'index.mjs'))) {
        build('ts', 'npm', ['run', 'build', '-w', '@polyspec/template'], root);
      }
    },
    command: (fixture, target, legacyWrappers) => ['node', [join(driversDir, 'bench-ts.mjs'), fixture, String(options.iters), String(options.warmup), target, String(legacyWrappers)]],
  },
  go: {
    package: join(packages, 'template-go'),
    prepare() {
      build('go', 'go', ['build', '-o', 'bench-go', '.'], join(driversDir, 'bench-go'));
    },
    command: (fixture, target, legacyWrappers) => [join(driversDir, 'bench-go', 'bench-go'), [fixture, String(options.iters), String(options.warmup), target, String(legacyWrappers)]],
  },
  rust: {
    package: join(packages, 'template-rust'),
    prepare() {
      build('rust', cargo, ['build', '--release'], join(driversDir, 'bench-rust'));
    },
    command: (fixture, target, legacyWrappers) => [
      join(driversDir, 'bench-rust', 'target', 'release', 'bench-rust'),
      [fixture, String(options.iters), String(options.warmup), target, String(legacyWrappers)],
    ],
  },
  php: {
    package: join(packages, 'template-php'),
    prepare() {
      if (!existsSync(join(packages, 'template-php', 'vendor', 'autoload.php'))) {
        build('php', 'composer', ['install', '--no-interaction', '--quiet'], join(packages, 'template-php'));
      }
    },
    command: (fixture, target, legacyWrappers) => ['php', [join(driversDir, 'bench-php.php'), fixture, String(options.iters), String(options.warmup), target, String(legacyWrappers)]],
  },
  'php-ext': {
    package: join(packages, 'template-php-ext'),
    prepare() {
      build('php-ext', cargo, ['build', '--locked', '--release'], join(packages, 'template-php-ext'));
    },
    command: (fixture, target, legacyWrappers) => [
      'php',
      ['-dextension=' + extensionPath(), join(driversDir, 'bench-ext.php'), fixture, String(options.iters), String(options.warmup), target, String(legacyWrappers)],
    ],
    default: false,
  },
};

function extensionPath() {
  const dir = join(packages, 'template-php-ext', 'target', 'release');
  const dylib = join(dir, 'libpolyspec_template.dylib');
  return existsSync(dylib) ? dylib : join(dir, 'libpolyspec_template.so');
}

function selectLanguages(option) {
  const all = Object.keys(drivers);
  if (!option) return all.filter(name => drivers[name].default !== false && existsSync(drivers[name].package));
  const names = option.split(',').map(name => name.trim()).filter(Boolean);
  for (const name of names) {
    if (!drivers[name]) {
      process.stderr.write(`unknown language: ${name} (known: ${all.join(', ')})\n`);
      process.exit(1);
    }
  }
  return names;
}

function listFixtures() {
  const names = readdirSync(options.fixturesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(options.fixturesDir, entry.name, 'bench.json')))
    .map(entry => entry.name)
    .sort();
  if (!options.fixture) return names;
  if (!names.includes(options.fixture)) {
    process.stderr.write(`unknown fixture: ${options.fixture} (known: ${names.join(', ')})\n`);
    process.exit(1);
  }
  return [options.fixture];
}

function metadataFor(fixture) {
  return JSON.parse(readFileSync(join(options.fixturesDir, fixture, 'bench.json'), 'utf8'));
}

function targetFor(fixture) {
  return metadataFor(fixture).target ?? 'input.tpl';
}

function legacyWrappersFor(fixture) {
  const value = metadataFor(fixture).legacyWrappers ?? false;
  if (typeof value !== 'boolean') throw new Error(`${fixture}: bench.json legacyWrappers must be boolean`);
  return value;
}

function sampleCountFor(fixture) {
  const samples = metadataFor(fixture).measurements ?? 1;
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new Error(`${fixture}: bench.json measurements must be a positive integer`);
  }
  return samples;
}

const languages = selectLanguages(options.langs);
if (!languages.length) {
  process.stderr.write('no implementation package exists\n');
  process.exit(1);
}
const fixtures = listFixtures();
if (!fixtures.length) {
  process.stderr.write('no fixture found\n');
  process.exit(1);
}

for (const language of languages) drivers[language].prepare();

const measurements = [];
const failures = [];
for (const fixture of fixtures) {
  const dir = join(options.fixturesDir, fixture);
  const target = targetFor(fixture);
  const legacyWrappers = legacyWrappersFor(fixture);
  const samples = sampleCountFor(fixture);
  for (let sample = 1; sample <= samples; sample++) {
    for (const language of languages) {
      const [command, args] = drivers[language].command(dir, target, legacyWrappers);
      const result = run(command, args, root, 1800000);
      if (result.status !== 0) {
        failures.push(`${fixture} [${language}] sample ${sample} exit ${result.status}: ${(result.stderr ?? '').trim()}`);
        continue;
      }
      const line = (result.stdout ?? '').trim().split('\n').pop();
      let measurement;
      try {
        measurement = JSON.parse(line);
      } catch {
        failures.push(`${fixture} [${language}] sample ${sample} output is not JSON: ${line}`);
        continue;
      }
      measurement.sample = sample;
      measurement.target = target;
      measurement.legacy_wrappers = legacyWrappers;
      if (measurement.repeat_sha256 !== undefined && measurement.repeat_sha256 !== measurement.output_sha256) {
        failures.push(`${fixture} [${language}] sample ${sample} repeated render changed output`);
      }
      measurements.push(measurement);
    }
  }
}

// Every implementation must have produced the same bytes for a fixture.
for (const fixture of fixtures) {
  const forFixture = measurements.filter(m => m.fixture === fixture);
  const hashes = new Set(forFixture.map(m => m.output_sha256));
  if (hashes.size > 1) {
    failures.push(`${fixture}: implementations produced different output: ${forFixture.map(m => `${m.lang}=${m.output_sha256.slice(0, 12)}`).join(' ')}`);
  }
}

if (failures.length) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exit(1);
}

if (options.json) {
  if (options.outputJson) {
    mkdirSync(dirname(options.outputJson), { recursive: true });
    writeFileSync(options.outputJson, JSON.stringify(measurements, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(measurements, null, 2) + '\n');
  process.exit(0);
}

function metrics(measurement) {
  return {
    perSecond: measurement.iters / measurement.seconds,
    microseconds: (measurement.seconds / measurement.iters) * 1e6,
  };
}

function describe(fixture) {
  return metadataFor(fixture).description;
}

function table(header, rows) {
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map(row => row[index].length)));
  const line = cells => `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  return [line(header), `| ${widths.map(width => '-'.repeat(width)).join(' | ')} |`, ...rows.map(line)].join('\n');
}

const header = ['Fixture', ...languages.flatMap(language => [`${language} ops/s`, `${language} µs`])];
const rows = fixtures.map(fixture => {
  const cells = [fixture];
  for (const language of languages) {
    const measurement = measurements.find(m => m.fixture === fixture && m.lang === language);
    if (!measurement) {
      cells.push('-', '-');
      continue;
    }
    const { perSecond, microseconds } = metrics(measurement);
    cells.push(Math.round(perSecond).toLocaleString('en-US'), microseconds.toFixed(1));
  }
  return cells;
});

const descriptions = table(['Fixture', 'Content'], fixtures.map(fixture => [fixture, describe(fixture)]));
const results = table(header, rows);

const document = [
  '# Benchmark results',
  '',
  `Renders per second and microseconds per render, measured with ${options.iters.toLocaleString('en-US')} renders per fixture and implementation after ${options.warmup.toLocaleString('en-US')} unmeasured renders.`,
  '',
  'Absolute times depend on the machine, the toolchain versions and the load during the run. Only the ratios within one run are comparable. The run fails when two implementations produce different output for a fixture.',
  '',
  'Regenerate this file with `make bench`.',
  '',
  '## Fixtures',
  '',
  descriptions,
  '',
  '## Results',
  '',
  results,
  '',
].join('\n');

mkdirSync(dirname(options.outputMd), { recursive: true });
writeFileSync(options.outputMd, document);
if (options.outputJson) {
  mkdirSync(dirname(options.outputJson), { recursive: true });
  writeFileSync(options.outputJson, JSON.stringify(measurements, null, 2) + '\n');
}
process.stdout.write(`${results}\n`);
process.stdout.write(`\n${measurements.length} measurements written to ${options.outputMd}\n`);
