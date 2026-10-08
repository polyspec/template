#!/usr/bin/env node
// Builds immutable package artifacts and verifies AST/generated installation outside the workspace.
// The install projects read no source of the network and use the toolchains of the checkout (T19.1): the Go install project
// resolves modules only from the proxy of the run, verifies no checksum against a database of the network and runs the
// installed Go toolchain of the go directive of packages/template-go/go.mod; the Rust install project builds with the toolchain
// of rust-toolchain.toml and a lock derived from packages/template-rust/Cargo.lock; the PHP install project reads only the
// package of the run; the Python install project builds the wheel of the package with the build requirements of
// var/python/wheelhouse (scripts/python-wheelhouse.mjs), reads no index and installs only that wheel.
// Each command is a step without a time limit that prints its start, its output and its result with
// its elapsed time on standard error and is judged by its exit status.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { installCargoLock, createWorkspace, goModuleEnvironment, removeWorkspace } from './install-workspace.mjs';
import { pythonCommand, pythonEnvironment } from './python-toolchain.mjs';
import { buildRequirements, requireWheelhouse, wheelhouse } from './python-wheelhouse.mjs';
import { checkLanguages } from './language-checks.mjs';
import { runStepSync } from './test-progress/step.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const scenario = join(root, 'examples/site/scenarios/scope-precedence');
const expected = readFileSync(join(scenario, 'expected.html'), 'utf8');
const temporary = createWorkspace();
const artifacts = join(temporary, 'artifacts');
mkdirSync(artifacts);

function run(command, args, options = {}) {
  return runStepSync('package installs', command, args, { cwd: options.cwd ?? root, env: { ...process.env, ...options.env }, capture: true }).trim();
}

function stageScenario(directory) {
  const templates = join(directory, 'templates');
  mkdirSync(templates, { recursive: true });
  for (const name of ['layout.tpl', 'content.tpl']) cpSync(join(scenario, name), join(templates, name));
  for (const name of ['data.json', 'define.json', 'expected.html']) cpSync(join(scenario, name), join(directory, name));
}

function checkTypeScript() {
  const directory = join(temporary, 'typescript');
  mkdirSync(directory);
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  // npm names the archive <name without @, / as ->-<version>.tgz; the name is computed, not read from the output of npm,
  // whose wording a release of npm may change (T19.11).
  const manifest = JSON.parse(readFileSync(join(root, 'packages/template-ts/package.json'), 'utf8'));
  const archive = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
  run('npm', ['pack', join(root, 'packages/template-ts'), '--pack-destination', artifacts, '--silent']);
  assert.ok(existsSync(join(artifacts, archive)), `npm pack wrote no ${archive} into ${artifacts}`);
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(artifacts, archive)], { cwd: directory });
  stageScenario(directory);
  cpSync(join(root, 'tools/showcase/adapters/generated/javascript/scope-precedence.js'), join(directory, 'generated.mjs'));
  writeFileSync(join(directory, 'check.mjs'), `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AstProgram, Engine, parseJson } from '@polyspec/template';
import { FsLoader } from '@polyspec/template/node';
import { GeneratedProgram } from './generated.mjs';
const assign = parseJson(readFileSync('data.json', 'utf8'));
const define = JSON.parse(readFileSync('define.json', 'utf8'));
const expected = readFileSync('expected.html', 'utf8');
const ast = new Engine(new AstProgram({ loader: new FsLoader('templates') })).render('layout', assign, { define });
const generated = new GeneratedProgram().render('layout', assign, { define });
assert.equal(ast, expected); assert.equal(generated, expected); assert.equal(ast, generated);
`);
  run('node', ['check.mjs'], { cwd: directory });
}

function checkGo() {
  const version = 'v0.0.1';
  const module = 'github.com/polyspec/template/packages/template-go';
  const goVersion = /^go (\S+)$/m.exec(readFileSync(join(root, 'packages/template-go/go.mod'), 'utf8'))[1];
  const proxy = join(temporary, 'go-proxy');
  const endpoint = join(proxy, module, '@v');
  const zipRoot = join(temporary, 'go-zip', `${module}@${version}`);
  mkdirSync(endpoint, { recursive: true });
  mkdirSync(zipRoot, { recursive: true });
  const tracked = run('git', ['ls-files', 'packages/template-go']).split('\n').filter(Boolean);
  for (const path of tracked) {
    const destination = join(zipRoot, relative('packages/template-go', path));
    mkdirSync(resolve(destination, '..'), { recursive: true });
    cpSync(join(root, path), destination);
  }
  cpSync(join(root, 'packages/template-go/go.mod'), join(endpoint, `${version}.mod`));
  writeFileSync(join(endpoint, `${version}.info`), JSON.stringify({ Version: version, Time: '2026-09-12T00:00:00Z' }));
  writeFileSync(join(endpoint, 'list'), `${version}\n`);
  run('zip', ['-q', '-r', join(endpoint, `${version}.zip`), `${module}@${version}`], { cwd: join(temporary, 'go-zip') });

  const directory = join(temporary, 'go');
  mkdirSync(join(directory, 'generated'), { recursive: true });
  stageScenario(directory);
  cpSync(join(root, 'tools/showcase/adapters/go/generated/scope-precedence/generated.go'), join(directory, 'generated/generated.go'));
  writeFileSync(join(directory, 'go.mod'), `module installcheck\n\ngo ${goVersion}\n\nrequire ${module} ${version}\n`);
  writeFileSync(join(directory, 'main.go'), `package main
import ("encoding/json"; "fmt"; "os"; template "github.com/polyspec/template/packages/template-go"; "installcheck/generated")
func definitions(data []byte) map[string]template.DefineInput { var raw map[string]json.RawMessage; if err:=json.Unmarshal(data,&raw);err!=nil{panic(err)}; out:=map[string]template.DefineInput{}; for name,value:=range raw { var path string; if json.Unmarshal(value,&path)==nil { out[name]=template.DefineInput{Template:path}; continue }; var entry struct{Template string \`json:"template"\`;Data any \`json:"data"\`;HTML *string \`json:"html"\`}; if err:=json.Unmarshal(value,&entry);err!=nil{panic(err)}; out[name]=template.DefineInput{Template:entry.Template,Data:entry.Data,HTML:entry.HTML} }; return out }
func main(){ data,_:=os.ReadFile("data.json"); assign,err:=template.ParseJSON(data);if err!=nil{panic(err)}; defineBytes,_:=os.ReadFile("define.json"); options:=template.RenderOptions{Define:definitions(defineBytes)}; expected,_:=os.ReadFile("expected.html"); astProgram,err:=template.NewAstProgram(template.Options{Loader:template.NewFSLoader(os.DirFS("templates"))});if err!=nil{panic(err)}; ast,err:=astProgram.Render("layout",assign,options);if err!=nil{panic(err)}; generatedProgram,err:=generated.NewGeneratedProgram(template.Options{});if err!=nil{panic(err)}; direct,err:=generatedProgram.Render("layout",assign,options);if err!=nil{panic(err)}; for _,result:=range []struct{name,actual string}{{"AST program",ast},{"generated program",direct}}{ if result.actual!=string(expected){fmt.Fprintf(os.Stderr,"Go %s output differs\\nexpected: %q\\nactual:   %q\\n",result.name,string(expected),result.actual);os.Exit(1)} };fmt.Print("ok")}
`);
  const environment = { GOPROXY: `file://${proxy}`, GOSUMDB: 'off', GOTOOLCHAIN: 'local', ...goModuleEnvironment(temporary) };
  run('go', ['mod', 'tidy'], { cwd: directory, env: environment });
  run('go', ['run', '-mod=readonly', '.'], { cwd: directory, env: environment });
}

function checkRust() {
  const target = join(temporary, 'cargo-target');
  run(resolve(process.env.HOME, '.cargo/bin/cargo'), ['package', '--locked', '--allow-dirty', '--no-verify', '--manifest-path', join(root, 'packages/template-rust/Cargo.toml')], { env: { CARGO_TARGET_DIR: target } });
  const crate = `polyspec-template-${/^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(root, 'packages/template-rust/Cargo.toml'), 'utf8'))[1]}`;
  const archive = join(target, `package/${crate}.crate`);
  const packages = join(temporary, 'cargo-packages');
  mkdirSync(packages);
  run('tar', ['-xzf', archive, '-C', packages]);
  const directory = join(temporary, 'rust');
  mkdirSync(join(directory, 'src'), { recursive: true });
  stageScenario(directory);
  cpSync(join(root, 'tools/showcase/adapters/generated/typed/scope-precedence.rust'), join(directory, 'generated.rs'));
  writeFileSync(join(directory, 'Cargo.toml'), `[package]\nname="install-check"\nversion="0.0.1"\nedition="2024"\n[dependencies]\npolyspec-template={path=${JSON.stringify(join(packages, crate))}}\nserde={version="1",features=["derive"]}\nserde_json={version="1",features=["preserve_order","arbitrary_precision"]}\n`);
  // The install project builds with the locked versions of the package and the toolchain of the checkout. Cargo does not
  // resolve the development dependencies of a path dependency for an install project.
  const manifest = readFileSync(join(root, 'packages/template-rust/Cargo.toml'), 'utf8');
  const development = [...(/^\[dev-dependencies\]\n((?:[^[\n].*\n?)*)/m.exec(manifest)?.[1] ?? '').matchAll(/^([\w-]+)\s*=/gm)].map(match => match[1]);
  writeFileSync(join(directory, 'Cargo.lock'), installCargoLock(readFileSync(join(root, 'packages/template-rust/Cargo.lock'), 'utf8'), {
    name: 'install-check', version: '0.0.1', dependencies: ['polyspec-template', 'serde', 'serde_json'], removed: { 'polyspec-template': development }, lockPath: 'packages/template-rust/Cargo.lock',
  }));
  cpSync(join(root, 'rust-toolchain.toml'), join(directory, 'rust-toolchain.toml'));
  writeFileSync(join(directory, 'src/main.rs'), `mod generated { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated.rs")); }
use polyspec_template::{AstProgram, Engine, EngineOptions, FsLoader, Program, RenderOptions, RenderTarget, RuntimeEnvironment};
fn main(){ let assign:serde_json::Value=serde_json::from_str(include_str!("../data.json")).unwrap(); let raw:serde_json::Value=serde_json::from_str(include_str!("../define.json")).unwrap(); let mut options=RenderOptions::default(); options.define=polyspec_template::defines_from_json(&raw).unwrap(); let expected=include_str!("../expected.html"); let ast=Engine::new(AstProgram::new(EngineOptions{loader:Some(Box::new(FsLoader::new("templates"))),..Default::default()}).unwrap()).render(RenderTarget::Name("layout"),&assign,&options).unwrap(); let program=generated::GeneratedProgram::new(RuntimeEnvironment::new(None,std::collections::HashMap::new())); let direct=program.render(RenderTarget::Name("layout"),&assign,&options).unwrap(); assert_eq!(ast,expected);assert_eq!(direct,expected);assert_eq!(ast,direct); }
`);
  run(resolve(process.env.HOME, '.cargo/bin/cargo'), ['run', '--quiet', '--locked'], { cwd: directory, env: { CARGO_TARGET_DIR: join(temporary, 'cargo-install-target') } });
}

function checkPhp() {
  run('composer', ['archive', '--format=zip', `--dir=${artifacts}`, '--file=polyspec-template'], { cwd: join(root, 'packages/template-php') });
  const archive = join(artifacts, 'polyspec-template.zip');
  const directory = join(temporary, 'php');
  mkdirSync(directory);
  stageScenario(directory);
  cpSync(join(root, 'tools/showcase/adapters/generated/typed/scope-precedence.php'), join(directory, 'generated.php'));
  const dist = `file://${archive}`;
  writeFileSync(join(directory, 'composer.json'), JSON.stringify({
    repositories: [{ 'packagist.org': false }, { type: 'package', package: { name: 'polyspec/template', version: '0.0.1', dist: { url: dist, type: 'zip' }, autoload: { 'psr-4': { 'Polyspec\\Template\\': 'src/' } }, require: { php: '^8.2', 'ext-mbstring': '*' } } }],
    require: { 'polyspec/template': '0.0.1' }, config: { 'allow-plugins': false },
  }));
  run('composer', ['install', '--no-interaction', '--no-progress', '--prefer-dist'], { cwd: directory });
  writeFileSync(join(directory, 'check.php'), `<?php declare(strict_types=1);
require __DIR__.'/vendor/autoload.php'; require __DIR__.'/generated.php';
use Polyspec\\Template\\AstProgram; use Polyspec\\Template\\Engine; use Polyspec\\Template\\Loader\\FilesystemLoader; use Polyspec\\Template\\Value\\Json; use Polyspec\\Template\\Value\\MapValue;
$assign=Json::parse(file_get_contents(__DIR__.'/data.json')); $raw=Json::parse(file_get_contents(__DIR__.'/define.json')); $define=[]; foreach($raw->entries() as $id=>$entry){ if(is_string($entry)){$define[$id]=$entry;continue;} $item=[];foreach($entry->entries() as $key=>$value)$item[$key]=$value;$define[$id]=$item;} $options=['define'=>$define];$expected=file_get_contents(__DIR__.'/expected.html');$ast=(new Engine(new AstProgram(new FilesystemLoader(__DIR__.'/templates'))))->render('layout',$assign,$options);$direct=(new \\Polyspec\\Showcase\\Generated\\ScopePrecedence\\GeneratedProgram())->render('layout',$assign,$options);foreach(['AST program'=>$ast,'generated program'=>$direct] as $name=>$actual){if($actual!==$expected){fwrite(STDERR,"PHP $name output differs\\nexpected: ".json_encode($expected)."\\nactual:   ".json_encode($actual)."\\n");exit(1);}}
`);
  run('php', ['check.php'], { cwd: directory });
}

function checkPython() {
  // pip builds in the directory it is given and writes build/ and egg-info there, so it builds a copy of the tracked files.
  const source = join(temporary, 'python-source');
  for (const path of run('git', ['ls-files', 'packages/template-python']).split('\n').filter(Boolean)) {
    const destination = join(source, relative('packages/template-python', path));
    mkdirSync(resolve(destination, '..'), { recursive: true });
    cpSync(join(root, path), destination);
  }
  const python = pythonCommand();
  const pip = { ...pythonEnvironment(), PIP_NO_INDEX: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
  const version = /^version = "([^"]+)"$/m.exec(readFileSync(join(source, 'pyproject.toml'), 'utf8'))[1];
  const archive = join(artifacts, `polyspec_template-${version}-py3-none-any.whl`);
  run(python, ['-m', 'pip', 'wheel', '--no-deps', '--no-index', '--find-links', requireWheelhouse(buildRequirements(), wheelhouse), '--wheel-dir', artifacts, source], { env: pip });
  assert.ok(existsSync(archive), `pip wheel wrote no ${archive} into ${artifacts}`);
  const directory = join(temporary, 'python');
  mkdirSync(directory);
  run(python, ['-m', 'venv', join(directory, 'venv')]);
  const installed = join(directory, 'venv/bin/python');
  run(installed, ['-m', 'pip', 'install', '--no-deps', '--no-index', archive], { env: pip });
  stageScenario(directory);
  cpSync(join(root, 'tools/showcase/adapters/generated/typed/scope-precedence.py'), join(directory, 'generated.py'));
  writeFileSync(join(directory, 'check.py'), `import json
from pathlib import Path

from polyspec.template import AstProgram, Engine, EngineOptions, FsLoader, RenderOptions, parse_json_bytes
from generated import GeneratedProgram

assign = parse_json_bytes(Path('data.json').read_bytes())
options = RenderOptions(define=json.loads(Path('define.json').read_text(encoding='utf-8')))
expected = Path('expected.html').read_text(encoding='utf-8')
ast = Engine(AstProgram(EngineOptions(loader=FsLoader('templates')))).render('layout', assign, options)
generated = Engine(GeneratedProgram()).render('layout', assign, options)
assert ast == expected, ast
assert generated == expected, generated
assert ast == generated
`);
  run(installed, ['check.py'], { cwd: directory, env: pythonEnvironment() });
}

let failure;
try {
  assert.equal(Buffer.byteLength(expected), 177);
  checkLanguages('package installs', { TypeScript: checkTypeScript, Go: checkGo, Rust: checkRust, PHP: checkPhp, Python: checkPython });
} catch (error) {
  failure = error;
}
try {
  removeWorkspace(temporary);
} catch (error) {
  failure = failure ? new AggregateError([failure, error], 'the package install check failed and its workspace removal failed') : error;
}
if (failure) throw failure;
process.stdout.write('package installs: TypeScript, Go, Rust, PHP and Python AST/generated output passed\n');
