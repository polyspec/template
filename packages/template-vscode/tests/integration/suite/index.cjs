// Integration checks that run inside VS Code with the installed extension in an untrusted workspace.
// POLYSPEC_TEMPLATE_EXPECT is `enabled` for the released manifest and `disabled` for a manifest
// without `capabilities`, which VS Code must disable in Restricted Mode.
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const vscode = require('vscode');

const { bounded, eventually, textBecomes } = require('./wait.cjs');

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

// Opens an untitled template document in an editor with the cursor at a position.
async function untitled(content, line, character) {
  const document = await vscode.workspace.openTextDocument({ language: 'polyspec-template', content });
  const editor = await vscode.window.showTextDocument(document);
  editor.options = { tabSize: 2, insertSpaces: true };
  editor.selection = new vscode.Selection(new vscode.Position(line, character), new vscode.Position(line, character));
  return editor;
}

// Types into `editor`: the command `type` types into the focused editor, so it waits until `editor` is the active one.
async function typeInto(editor, text) {
  await eventually(() => vscode.window.activeTextEditor?.document === editor.document, () => `the editor of ${editor.document.uri} to be active; the active editor shows ${vscode.window.activeTextEditor?.document.uri ?? 'no document'}`);
  await vscode.commands.executeCommand('type', { text });
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
  ['the extension starts the bundled language server', async () => {
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(existsSync(join(extension.extensionPath, 'dist', 'server.cjs')));
    assert.equal(typeof extension.exports.tagRanges, 'function');
  }],
  ['tag backgrounds cover every tag except comments and the tags accepted before a parse error', async () => {
    const api = vscode.extensions.getExtension(extensionId).exports;
    const blocks = await open('blocks.tpl');
    const ranges = await eventually(() => api.tagRanges(blocks), () => 'the tag ranges of blocks.tpl');
    assert.deepEqual(ranges.map(range => blocks.getText(range)), ['{@ item = items}', '{? item.active}', '{:}', '{/}', '{= item.name}', '{:}', '{/}']);
    const broken = await open('broken.tpl');
    assert.deepEqual((await eventually(() => api.tagRanges(broken), () => 'the tag ranges of broken.tpl')).map(range => broken.getText(range)), ['{? a}']);
  }],
  ['semantic tokens of the server classify the template tags', async () => {
    const document = await open('blocks.tpl');
    const legend = await eventually(() => vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', document.uri), () => 'the semantic token legend of blocks.tpl');
    const tokens = await eventually(() => vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', document.uri), () => 'the semantic tokens of blocks.tpl');
    const decoded = [];
    let line = 0;
    let character = 0;
    for (let index = 0; index < tokens.data.length; index += 5) {
      const [deltaLine, deltaStart, length, type] = tokens.data.slice(index, index + 4);
      line += deltaLine;
      character = deltaLine === 0 ? character + deltaStart : deltaStart;
      decoded.push([document.getText(new vscode.Range(line, character, line, character + length)), legend.tokenTypes[type]]);
    }
    assert.deepEqual(decoded.slice(0, 6), [['{', 'delimiter'], ['@', 'keyword'], ['item', 'variable'], ['=', 'operator'], ['items', 'variable'], ['}', 'delimiter']]);
  }],
  ['format on type is enabled for the language and indents a line after } and after Enter', async () => {
    assert.equal(vscode.workspace.getConfiguration('editor', { languageId: 'polyspec-template' }).get('formatOnType'), true);
    const closing = await untitled('<ul>\n', 1, 0);
    await typeInto(closing, '{@ x = xs}');
    await textBecomes(closing.document, '<ul>\n  {@ x = xs}');
    assert.equal(closing.document.getText(), '<ul>\n  {@ x = xs}');
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    const enter = await untitled('<ul>\n  {@ x = xs}<li>{= x}</li>\n  {/}\n</ul>', 1, 12);
    await typeInto(enter, '\n');
    const expected = '<ul>\n  {@ x = xs}\n    <li>{= x}</li>\n  {/}\n</ul>';
    await textBecomes(enter.document, expected);
    assert.equal(enter.document.getText(), expected);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
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

/**
 * Runs every check of the expected mode with its own time limit, prints each check when it starts
 * and when it ends with its elapsed time, and fails with the names of the failed checks.
 */
async function run() {
  console.log(`[suite] VS Code ${vscode.version}, Electron ${process.versions.electron}, Node.js ${process.versions.node}, expect ${expect}`);
  const checks = [...common, ...(expect === 'enabled' ? enabled : expect === 'disabled' ? disabled : [])];
  assert.ok(checks.length > common.length, `unknown POLYSPEC_TEMPLATE_EXPECT ${expect}`);
  const failures = [];
  for (const [name, check] of checks) {
    console.log(`[suite] start - ${name}`);
    const started = Date.now();
    try {
      await bounded(name, check);
      console.log(`[suite] ok - ${name} (${Date.now() - started} ms)`);
    } catch (error) {
      failures.push(name);
      console.log(`[suite] not ok - ${name} (${Date.now() - started} ms)\n${error && error.stack ? error.stack : error}`);
    }
  }
  console.log(`[suite] ${checks.length - failures.length} of ${checks.length} checks passed`);
  if (failures.length) throw new Error(`failed: ${failures.join('; ')}`);
}

module.exports = { run };
