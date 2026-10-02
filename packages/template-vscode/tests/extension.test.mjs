// Extension manifest, bundles and the bundled language server. The client side runs in VS Code in tests/integration.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const SERVER = 'dist/server.cjs';

// The semantic token types that VS Code defines; other types of the server legend must be contributed.
const STANDARD_TOKEN_TYPES = new Set(['namespace', 'class', 'enum', 'interface', 'struct', 'typeParameter', 'type', 'parameter', 'variable', 'property', 'enumMember', 'decorator', 'event', 'function', 'method', 'macro', 'label', 'comment', 'string', 'keyword', 'number', 'regexp', 'operator']);

const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const requiredBy = path => [...new Set(readFileSync(join(root, path), 'utf8').match(/require\("[^"]+"\)/g).map(call => call.slice(9, -2)))];

let server;
let connection;
let initialized;
const published = [];

before(async () => {
  server = spawn(process.execPath, [join(root, SERVER), '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] });
  connection = createMessageConnection(new StreamMessageReader(server.stdout), new StreamMessageWriter(server.stdin));
  connection.onNotification('textDocument/publishDiagnostics', params => {
    published.push(params);
  });
  connection.listen();
  initialized = await connection.sendRequest('initialize', { processId: process.pid, rootUri: null, capabilities: {} });
  await connection.sendNotification('initialized', {});
});

after(async () => {
  const exited = new Promise(resolvePromise => server.once('exit', code => resolvePromise(code)));
  await connection.sendRequest('shutdown');
  await connection.sendNotification('exit');
  assert.equal(await exited, 0);
  connection.dispose();
});

test('manifest contributes the language, the grammar and the language configuration', () => {
  const [language] = manifest.contributes.languages;
  assert.equal(language.id, 'polyspec-template');
  assert.deepEqual(language.extensions, ['.tpl']);
  const [grammar] = manifest.contributes.grammars;
  assert.equal(grammar.language, 'polyspec-template');
  assert.equal(grammar.scopeName, 'text.html.polyspec-template');
  const syntax = JSON.parse(readFileSync(join(root, grammar.path), 'utf8'));
  assert.equal(syntax.scopeName, grammar.scopeName);
  const configuration = JSON.parse(readFileSync(join(root, language.configuration), 'utf8'));
  assert.deepEqual(configuration.comments.blockComment, ['{*', '*}']);
  assert.ok(configuration.brackets.some(([open, close]) => open === '{' && close === '}'));
});

test('manifest contributes the templateBlocks formatting setting and enables format on type for the language', () => {
  const setting = manifest.contributes.configuration.properties['polyspec-template.format.templateBlocks'];
  assert.deepEqual(setting.enum, ['indent', 'flat']);
  assert.equal(setting.default, 'indent');
  assert.deepEqual(manifest.contributes.configurationDefaults, { '[polyspec-template]': { 'editor.formatOnType': true } });
});

test('manifest supports untrusted and virtual workspaces and declares no Node.js engine', () => {
  assert.deepEqual(manifest.capabilities, { untrustedWorkspaces: { supported: true }, virtualWorkspaces: true });
  assert.deepEqual(Object.keys(manifest.engines), ['vscode']);
});

test('manifest contributes the Go to Matching Template Tag command and its keybinding', () => {
  const [command] = manifest.contributes.commands;
  assert.equal(command.command, 'polyspec-template.goToMatchingTag');
  const [keybinding] = manifest.contributes.keybindings;
  assert.equal(keybinding.command, command.command);
  assert.equal(keybinding.when, 'editorTextFocus && editorLangId == polyspec-template');
});

test('manifest contributes every token type of the server legend that VS Code does not define', () => {
  const legend = initialized.capabilities.semanticTokensProvider.legend.tokenTypes;
  const contributed = manifest.contributes.semanticTokenTypes.map(type => type.id);
  assert.deepEqual(contributed, legend.filter(type => !STANDARD_TOKEN_TYPES.has(type)));
  for (const type of manifest.contributes.semanticTokenTypes) assert.ok(STANDARD_TOKEN_TYPES.has(type.superType), type.id);
  const [scopes] = manifest.contributes.semanticTokenScopes;
  assert.equal(scopes.language, 'polyspec-template');
  for (const type of Object.keys(scopes.scopes)) assert.ok(legend.includes(type), type);
});

test('the bundles load no workspace package at run time and are packaged', () => {
  assert.deepEqual(requiredBy(manifest.main).filter(name => !builtins.has(name)), ['vscode']);
  assert.deepEqual(requiredBy(SERVER).filter(name => !builtins.has(name)), []);
  const packaged = readFileSync(join(root, '.vscodeignore'), 'utf8').split('\n');
  assert.ok(packaged.includes(`!${manifest.main.replace(/^\.\//, '')}`));
  assert.ok(packaged.includes(`!${SERVER}`));
});

test('the bundled server publishes diagnostics and answers the requests of the extension', async () => {
  const uri = 'file:///work/page.tpl';
  const text = '<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>\n{? a}';
  await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'polyspec-template', version: 1, text } });
  const textDocument = { uri };
  const tags = await connection.sendRequest('polyspec-template/tagRanges', { textDocument });
  assert.deepEqual(tags.map(range => [range.start.line, range.start.character, range.end.line, range.end.character]), [[1, 0, 1, 10], [2, 4, 2, 9], [3, 0, 3, 3], [5, 0, 5, 5]]);
  assert.deepEqual(await connection.sendRequest('polyspec-template/matchingTag', { textDocument, position: { line: 1, character: 2 } }), { line: 3, character: 0 });
  const edits = await connection.sendRequest('textDocument/onTypeFormatting', { textDocument, position: { line: 1, character: 10 }, ch: '}', options: { tabSize: 2, insertSpaces: true } });
  assert.deepEqual(edits, [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '  ' }]);
  for (let attempt = 0; attempt < 50 && !published.some(params => params.uri === uri); attempt++) await new Promise(resolvePromise => setTimeout(resolvePromise, 20));
  const [diagnostic] = published.find(params => params.uri === uri).diagnostics;
  assert.equal(diagnostic.code, 'E_PARSE_UNCLOSED_BLOCK');
  assert.deepEqual(diagnostic.range.start, { line: 5, character: 0 });
});
