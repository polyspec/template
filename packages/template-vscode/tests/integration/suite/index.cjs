// Integration checks that run inside VS Code with the installed extension in an untrusted workspace.
// POLYSPEC_TEMPLATE_EXPECT is `enabled` for the released manifest and `disabled` for a manifest
// without `capabilities`, which VS Code must disable in Restricted Mode.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vscode = require('vscode');

const workspace = join(__dirname, '..', 'workspace');
const extensionId = process.env.POLYSPEC_TEMPLATE_EXTENSION;
const expect = process.env.POLYSPEC_TEMPLATE_EXPECT;

async function open(name) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(join(workspace, name)));
  await vscode.window.showTextDocument(document);
  return document;
}

async function formatEdits(document) {
  const options = { tabSize: 2, insertSpaces: true };
  return (await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', document.uri, options)) ?? [];
}

// Applies text edits to the document text; offsets are taken before any edit is applied.
function applyEdits(document, edits) {
  const sorted = [...edits].sort((left, right) => document.offsetAt(right.range.start) - document.offsetAt(left.range.start));
  let result = document.getText();
  for (const edit of sorted) {
    result = result.slice(0, document.offsetAt(edit.range.start)) + edit.newText + result.slice(document.offsetAt(edit.range.end));
  }
  return result;
}

function scopesOf(tokens, content, scope) {
  return tokens.filter(token => token.c === content && token.t.split(' ').includes(scope));
}

const common = [
  ['workspace trust is enabled and the workspace is not trusted', async () => {
    assert.equal(vscode.workspace.getConfiguration('security.workspace.trust').get('enabled'), true);
    assert.equal(vscode.workspace.isTrusted, false);
  }],
];

const enabled = [
  ['a .tpl document opens with the language polyspec-template', async () => {
    const document = await open('page.tpl');
    assert.equal(document.languageId, 'polyspec-template');
  }],
  ['the installed extension activates without error', async () => {
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, `${extensionId} is not available`);
    assert.ok(!extension.extensionPath.startsWith(join(__dirname, '..', '..', '..')), `${extensionId} is loaded from the source tree`);
    await extension.activate();
    assert.equal(extension.isActive, true);
  }],
  ['the grammar gives a tag inside an attribute value the template scopes', async () => {
    const document = await open('page.tpl');
    const tokens = await vscode.commands.executeCommand('_workbench.captureSyntaxTokens', document.uri);
    const line = tokens.map(token => `${JSON.stringify(token.c)} ${token.t}`).join('\n');
    const echoStart = scopesOf(tokens, '{', 'meta.template.echo.polyspec-template');
    assert.ok(echoStart.length > 0 && echoStart[0].t.split(' ').includes('string.quoted.double.html'), line);
    assert.ok(echoStart[0].t.split(' ').includes('keyword.control.tag.begin.polyspec-template'), line);
    assert.ok(scopesOf(tokens, 'post', 'variable.other.readwrite.polyspec-template').length > 0, line);
    assert.ok(scopesOf(tokens, '?', 'keyword.control.if.polyspec-template').length > 0, line);
    assert.ok(scopesOf(tokens, 'tr', 'entity.name.tag.html').length > 0, line);
  }],
  ['the format provider returns the expected edits', async () => {
    const document = await open('page.tpl');
    const edits = await formatEdits(document);
    assert.ok(edits.length > 0);
    assert.equal(applyEdits(document, edits), readFileSync(join(workspace, 'page.expected.tpl'), 'utf8'));
  }],
  ['the format provider returns no edits for a formatted document', async () => {
    assert.deepEqual(await formatEdits(await open('page.expected.tpl')), []);
  }],
  ['an unclosed if tag produces a diagnostic at the opening tag', async () => {
    const document = await open('broken.tpl');
    let diagnostics = [];
    for (let attempt = 0; attempt < 50 && diagnostics.length === 0; attempt++) {
      diagnostics = vscode.languages.getDiagnostics(document.uri);
      if (diagnostics.length === 0) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(diagnostics.length, 1);
    const [diagnostic] = diagnostics;
    assert.equal(diagnostic.code, 'E_PARSE_UNCLOSED_BLOCK');
    assert.equal(diagnostic.source, 'polyspec-template');
    assert.equal(diagnostic.severity, vscode.DiagnosticSeverity.Error);
    assert.deepEqual([diagnostic.range.start.line, diagnostic.range.start.character], [1, 2]);
    assert.deepEqual(vscode.languages.getDiagnostics(vscode.Uri.file(join(workspace, 'blocks.tpl'))), []);
  }],
  ['document highlights cover the if, else and close tags of one construct', async () => {
    const document = await open('blocks.tpl');
    const highlights = await vscode.commands.executeCommand('vscode.executeDocumentHighlights', document.uri, new vscode.Position(2, 31));
    assert.deepEqual(highlights.map(item => document.getText(item.range)), ['{? item.active}', '{:}', '{/}']);
  }],
  ['folding ranges cover the multi-line loop', async () => {
    const document = await open('blocks.tpl');
    const ranges = await vscode.commands.executeCommand('vscode.executeFoldingRangeProvider', document.uri);
    assert.ok(ranges.some(range => range.start === 1 && range.end === 4), JSON.stringify(ranges));
  }],
  ['Go to Matching Template Tag moves between the tags of one construct', async () => {
    const document = await open('blocks.tpl');
    const editor = vscode.window.activeTextEditor;
    editor.selection = new vscode.Selection(new vscode.Position(1, 0), new vscode.Position(1, 0));
    await vscode.commands.executeCommand('polyspec-template.goToMatchingTag');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [3, 0]);
    await vscode.commands.executeCommand('polyspec-template.goToMatchingTag');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [5, 0]);
    await vscode.commands.executeCommand('polyspec-template.goToMatchingTag');
    assert.deepEqual([editor.selection.active.line, editor.selection.active.character], [1, 0]);
    assert.equal(document.languageId, 'polyspec-template');
  }],
  ['the keybinding of Go to Matching Template Tag is bound to no other default command', async () => {
    const extension = vscode.extensions.getExtension(extensionId);
    const [binding] = extension.packageJSON.contributes.keybindings;
    const key = process.platform === 'darwin' ? binding.mac : binding.key;
    const defaults = await vscode.workspace.openTextDocument(vscode.Uri.parse('vscode://defaultsettings/keybindings.json'));
    const entries = JSON.parse(defaults.getText().replace(/^\s*\/\/.*$/gm, ''));
    assert.ok(entries.some(entry => entry.command === 'editor.action.jumpToBracket'), 'the default keybindings were not read');
    const others = entries.filter(entry => entry.key === key && entry.command !== binding.command && !entry.command.startsWith('-'));
    console.log(`[suite] ${key} is bound by default to: ${JSON.stringify(others.map(entry => entry.command))}`);
    assert.deepEqual(others, []);
  }],
  ['the format provider returns no edits for a document that does not parse', async () => {
    const document = await open('broken.tpl');
    assert.equal(document.languageId, 'polyspec-template');
    assert.deepEqual(await formatEdits(document), []);
  }],
];

const disabled = [
  ['VS Code disables the extension without capabilities in Restricted Mode', async () => {
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension === undefined || !extension.isActive, `${extensionId} is enabled`);
    const document = await open('page.tpl');
    assert.notEqual(document.languageId, 'polyspec-template');
  }],
];

/** Runs every check of the expected mode and fails with the names of the failed checks. */
async function run() {
  console.log(`[suite] VS Code ${vscode.version}, Electron ${process.versions.electron}, Node.js ${process.versions.node}, expect ${expect}`);
  const checks = [...common, ...(expect === 'enabled' ? enabled : expect === 'disabled' ? disabled : [])];
  assert.ok(checks.length > common.length, `unknown POLYSPEC_TEMPLATE_EXPECT ${expect}`);
  const failures = [];
  for (const [name, check] of checks) {
    try {
      await check();
      console.log(`[suite] ok - ${name}`);
    } catch (error) {
      failures.push(name);
      console.log(`[suite] not ok - ${name}\n${error && error.stack ? error.stack : error}`);
    }
  }
  console.log(`[suite] ${checks.length - failures.length} of ${checks.length} checks passed`);
  if (failures.length) throw new Error(`failed: ${failures.join('; ')}`);
}

module.exports = { run };
