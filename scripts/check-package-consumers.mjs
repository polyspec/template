#!/usr/bin/env node
// Builds immutable package artifacts and verifies AST/generated consumption outside the workspace.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const scenario = join(root, 'examples/site/scenarios/scope-precedence');
const expected = readFileSync(join(scenario, 'expected.html'), 'utf8');
const temporary = mkdtempSync(join(tmpdir(), 'template-consumers-'));
const artifacts = join(temporary, 'artifacts');
mkdirSync(artifacts);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
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
  const archive = run('npm', ['pack', join(root, 'packages/template-ts'), '--pack-destination', artifacts, '--silent']).split('\n').at(-1);
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
  const module = 'github.com/polyspec/template';
  const goVersion = run('go', ['env', 'GOVERSION']).trim().replace(/^go/, '');
  const proxy = join(temporary, 'go-proxy');
  const endpoint = join(proxy, 'github.com/polyspec/template/@v');
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
  writeFileSync(join(directory, 'go.mod'), `module consumer\n\ngo ${goVersion}\n\nrequire ${module} ${version}\n`);
  writeFileSync(join(directory, 'main.go'), `package main
import ("encoding/json"; "fmt"; "os"; template "github.com/polyspec/template"; "consumer/generated")
func definitions(data []byte) map[string]template.DefineInput { var raw map[string]json.RawMessage; if err:=json.Unmarshal(data,&raw);err!=nil{panic(err)}; out:=map[string]template.DefineInput{}; for name,value:=range raw { var path string; if json.Unmarshal(value,&path)==nil { out[name]=template.DefineInput{Template:path}; continue }; var entry struct{Template string \`json:"template"\`;Data any \`json:"data"\`;HTML *string \`json:"html"\`}; if err:=json.Unmarshal(value,&entry);err!=nil{panic(err)}; out[name]=template.DefineInput{Template:entry.Template,Data:entry.Data,HTML:entry.HTML} }; return out }
func main(){ data,_:=os.ReadFile("data.json"); assign,err:=template.ParseJSON(data);if err!=nil{panic(err)}; defineBytes,_:=os.ReadFile("define.json"); options:=template.RenderOptions{Define:definitions(defineBytes)}; expected,_:=os.ReadFile("expected.html"); astProgram,err:=template.NewAstProgram(template.Options{Loader:template.NewFSLoader(os.DirFS("templates"))});if err!=nil{panic(err)}; ast,err:=astProgram.Render("layout",assign,options);if err!=nil{panic(err)}; generatedProgram,err:=generated.NewGeneratedProgram(template.Options{});if err!=nil{panic(err)}; direct,err:=generatedProgram.Render("layout",assign,options);if err!=nil{panic(err)}; if ast!=string(expected)||direct!=string(expected)||ast!=direct{panic("consumer output differs")};fmt.Print("ok")}
`);
  const environment = { GOPROXY: `file://${proxy},https://proxy.golang.org`, GOSUMDB: 'sum.golang.org', GONOSUMDB: module, GOMODCACHE: join(temporary, 'go-module-cache'), GOTOOLCHAIN: 'auto' };
  run('go', ['mod', 'tidy'], { cwd: directory, env: environment });
  run('go', ['run', '-mod=readonly', '.'], { cwd: directory, env: environment });
}

function checkRust() {
  const target = join(temporary, 'cargo-target');
  run(resolve(process.env.HOME, '.cargo/bin/cargo'), ['package', '--locked', '--allow-dirty', '--no-verify', '--manifest-path', join(root, 'packages/template-rust/Cargo.toml')], { env: { CARGO_TARGET_DIR: target } });
  const archive = join(target, 'package/polyspec-template-0.0.1.crate');
  const packages = join(temporary, 'cargo-packages');
  mkdirSync(packages);
  run('tar', ['-xzf', archive, '-C', packages]);
  const directory = join(temporary, 'rust');
  mkdirSync(join(directory, 'src'), { recursive: true });
  stageScenario(directory);
  cpSync(join(root, 'tools/showcase/adapters/generated/typed/scope-precedence.rust'), join(directory, 'generated.rs'));
  writeFileSync(join(directory, 'Cargo.toml'), `[package]\nname="consumer"\nversion="0.0.1"\nedition="2024"\n[dependencies]\npolyspec-template={path=${JSON.stringify(join(packages, 'polyspec-template-0.0.1'))}}\nserde={version="1",features=["derive"]}\nserde_json={version="1",features=["preserve_order","arbitrary_precision"]}\n`);
  writeFileSync(join(directory, 'src/main.rs'), `mod generated { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated.rs")); }
use polyspec_template::{AstProgram, Engine, EngineOptions, FsLoader, Program, RenderOptions, RenderTarget, RuntimeEnvironment};
fn main(){ let assign:serde_json::Value=serde_json::from_str(include_str!("../data.json")).unwrap(); let raw:serde_json::Value=serde_json::from_str(include_str!("../define.json")).unwrap(); let mut options=RenderOptions::default(); options.define=polyspec_template::defines_from_json(&raw).unwrap(); let expected=include_str!("../expected.html"); let ast=Engine::new(AstProgram::new(EngineOptions{loader:Some(Box::new(FsLoader::new("templates"))),..Default::default()})).render(RenderTarget::Name("layout"),&assign,&options).unwrap(); let program=generated::GeneratedProgram::new(RuntimeEnvironment::new(None,std::collections::HashMap::new())); let direct=program.render(RenderTarget::Name("layout"),&assign,&options).unwrap(); assert_eq!(ast,expected);assert_eq!(direct,expected);assert_eq!(ast,direct); }
`);
  run(resolve(process.env.HOME, '.cargo/bin/cargo'), ['run', '--quiet'], { cwd: directory, env: { CARGO_TARGET_DIR: join(temporary, 'cargo-consumer-target') } });
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
    repositories: [{ type: 'package', package: { name: 'polyspec/template', version: '0.0.1', dist: { url: dist, type: 'zip' }, autoload: { 'psr-4': { 'Polyspec\\Template\\': 'src/' } }, require: { php: '^8.2', 'ext-mbstring': '*' } } }],
    require: { 'polyspec/template': '0.0.1' }, config: { 'allow-plugins': false },
  }));
  run('composer', ['install', '--no-interaction', '--no-progress', '--prefer-dist'], { cwd: directory });
  writeFileSync(join(directory, 'check.php'), `<?php declare(strict_types=1);
require __DIR__.'/vendor/autoload.php'; require __DIR__.'/generated.php';
use Polyspec\\Template\\AstProgram; use Polyspec\\Template\\Engine; use Polyspec\\Template\\Loader\\FilesystemLoader; use Polyspec\\Template\\Value\\Json; use Polyspec\\Template\\Value\\MapValue;
$assign=Json::parse(file_get_contents(__DIR__.'/data.json')); $raw=Json::parse(file_get_contents(__DIR__.'/define.json')); $define=[]; foreach($raw->entries() as $id=>$entry){ if(is_string($entry)){$define[$id]=$entry;continue;} $item=[];foreach($entry->entries() as $key=>$value)$item[$key]=$value;$define[$id]=$item;} $options=['define'=>$define];$expected=file_get_contents(__DIR__.'/expected.html');$ast=(new Engine(new AstProgram(new FilesystemLoader(__DIR__.'/templates'))))->render('layout',$assign,$options);$direct=(new GeneratedProgram())->render('layout',$assign,$options);if($ast!==$expected||$direct!==$expected||$ast!==$direct)throw new RuntimeException('consumer output differs');
`);
  run('php', ['check.php'], { cwd: directory });
}

try {
  checkTypeScript();
  checkGo();
  checkRust();
  checkPhp();
  assert.equal(Buffer.byteLength(expected), 177);
  process.stdout.write('package consumers: TypeScript, Go, Rust and PHP AST/generated output passed\n');
} finally {
  const cleanup = `${temporary}.cleanup-${process.pid}`;
  try { renameSync(temporary, cleanup); } catch { /* the command may have failed before creating the directory */ }
  try { rmSync(cleanup, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); } catch { /* cleanup must not replace the consumer result */ }
}
