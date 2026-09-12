#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/runtime/interface.json'), 'utf8'));
if (manifest.schema !== 3 || manifest.name !== 'TemplateRuntime') throw new Error('invalid runtime interface manifest');
if (!Array.isArray(manifest.operations) || manifest.operations.map(item => item.name).join(',') !== 'compile,loadOrRefresh,prepare,render,getPage,putPage,getOrSet') {
	throw new Error('runtime interface must declare compilation, artifact, prepared-render and page-cache operations in order');
}
const files = {
  rust: ['packages/template-rust/src/render/engine.rs', /pub fn prepare</, /pub fn render/],
  go: ['packages/template-go/render/engine.go', /func \(e \*Engine\) Prepare/, /func \(p \*PreparedRender\) Render/],
  typescript: ['packages/template-ts/src/render/engine.ts', /prepare\(target:/, /class PreparedRender[\s\S]*?render\(\)/],
  php: ['packages/template-php/src/Engine.php', /public function prepare\(/, /class PreparedRender[\s\S]*?public function render\(/],
};
const compilePatterns = {
  rust: [/pub enum CompileMode/, /pub compile: CompileOptions/, /GeneratedRequest/, /bind_map\(assign\)/, /generated compile mode requires/],
  go: [/type CompileMode string/, /Compile\s+CompileOptions/, /GeneratedRequest/, /value\.BindMap\(assign\)/, /generated compile mode requires/],
  typescript: [/export type CompileMode/, /compile\?: CompileOptions/, /GeneratedRequest/, /bindMap\(assign/, /generated compile mode requires/],
  php: [/compileMode/, /\$options\['compile'\]/, /GeneratedRequest/, /Bind::map\(\$assign\)/, /generated compile mode requires/],
};
const executionPatterns = {
  rust: [/enum PreparedExecution/, /struct AstPreparedExecution/, /struct GeneratedPreparedExecution/, /PreparedExecution::Ast/, /PreparedExecution::Gen/],
  go: [/type preparedExecution interface/, /type astPreparedExecution struct/, /type generatedPreparedExecution struct/],
  typescript: [/interface PreparedExecution/, /class AstPreparedExecution implements PreparedExecution/, /class GeneratedPreparedExecution implements PreparedExecution/],
  php: [/interface PreparedExecution/, /class AstPreparedExecution implements PreparedExecution/, /class GeneratedPreparedExecution implements PreparedExecution/],
};
const forbiddenPlaceholders = {
  rust: [/Gen\s*\{[^}]*template:/],
  go: [/type generatedPreparedExecution struct\s*\{[^}]*template/],
  typescript: [/class GeneratedPreparedExecution[^{]*\{[^}]*private readonly template/],
  php: [/compileMode === 'gen'[\s\S]{0,800}'body'\s*=>\s*\[\]/],
};
const pageCaches = {
  rust: 'packages/template-rust/src/page_cache.rs',
  go: 'packages/template-go/cache/page_cache.go',
  typescript: 'packages/template-ts/src/page-cache.ts',
  php: 'packages/template-php/src/PageCache.php',
};
const publicGeneratedContracts = {
  rust: ['packages/template-rust/src/lib.rs', /GeneratedPreparedRender,\s*GeneratedRenderer,\s*GeneratedRequest/],
  go: ['packages/template-go/engine.go', /type GeneratedRequest = render\.GeneratedRequest[\s\S]*type GeneratedPreparedRender = render\.GeneratedPreparedRender/],
  typescript: ['packages/template-ts/src/index.ts', /GeneratedPreparedRender, GeneratedRenderer, GeneratedRequest/],
  php: ['packages/template-php/src/Engine.php', /final class GeneratedPreparedRender[\s\S]*final class GeneratedRequest/],
};
for (const [language, [relative, enginePattern, preparedPattern]] of Object.entries(files)) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  if (!enginePattern.test(source)) throw new Error(`${language}: missing Engine prepare operation`);
  if (!preparedPattern.test(source)) throw new Error(`${language}: missing PreparedRender render operation`);
  for (const pattern of compilePatterns[language]) if (!pattern.test(source)) throw new Error(`${language}: compile.mode implementation is missing`);
  for (const pattern of executionPatterns[language]) if (!pattern.test(source)) throw new Error(`${language}: explicit AST/generated prepared execution is missing`);
  for (const pattern of forbiddenPlaceholders[language]) if (pattern.test(source)) throw new Error(`${language}: generated execution contains an AST placeholder`);
  const modeIndex = source.search(/compileMode|compile\.mode|CompileMode/);
  const bindIndex = Math.max(source.lastIndexOf('bindMap(assign'), source.lastIndexOf('bind_map(assign'), source.lastIndexOf('BindMap(assign'), source.lastIndexOf('Bind::map($assign'));
  const generatedRequestIndex = Math.max(source.lastIndexOf('generatedRenderer({'), source.lastIndexOf('generatedRender(GeneratedRequest'), source.lastIndexOf('new GeneratedRequest'), source.lastIndexOf('let request = GeneratedRequest'));
  if (modeIndex < 0 || bindIndex < 0 || generatedRequestIndex < 0 || bindIndex > generatedRequestIndex) throw new Error(`${language}: generated mode must use the normalized request after binding`);
  const mapping = manifest.languages[language];
  if (!mapping || !mapping.engine || !mapping.compile || !mapping.generatedRequest || !mapping.generatedPrepared || !mapping.preparedExecution || !mapping.prepared || !mapping.pageCache) throw new Error(`${language}: missing manifest mapping`);
  const pageCache = readFileSync(resolve(root, pageCaches[language]), 'utf8');
  if (!/getOrSet|GetOrSet|get_or_set/.test(pageCache)) throw new Error(`${language}: missing PageCache getOrSet operation`);
  const [publicPath, publicPattern] = publicGeneratedContracts[language];
  if (!publicPattern.test(readFileSync(resolve(root, publicPath), 'utf8'))) throw new Error(`${language}: generated request contract is not public`);
}
process.stdout.write('runtime interface: four language mappings passed\n');
