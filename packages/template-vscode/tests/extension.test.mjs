// Extension manifest and bundled formatting providers, run against a minimal stand-in for the vscode module.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

class Position {
  constructor(offset, line = 0) {
    this.offset = offset;
    this.line = line;
  }
}
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}
const providers = {};
const warnings = [];
const diagnostics = new Map();
const settings = { 'format.templateBlocks': 'indent' };
const SPACES = { tabSize: 2, insertSpaces: true };
const decorationTypes = [];
const disposable = { dispose() {} };
const vscode = {
  Range,
  Selection: Range,
  TextEdit: { replace: (range, newText) => ({ range, newText }) },
  Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
  DiagnosticSeverity: { Error: 0 },
  DocumentHighlight: class { constructor(range, kind) { Object.assign(this, { range, kind }); } },
  DocumentHighlightKind: { Text: 0 },
  FoldingRange: class { constructor(start, end, kind) { Object.assign(this, { start, end, kind }); } },
  FoldingRangeKind: { Region: 3 },
  DecorationRangeBehavior: { ClosedClosed: 1 },
  window: {
    createOutputChannel: () => ({ warn: message => warnings.push(message), dispose() {} }),
    createTextEditorDecorationType: options => {
      decorationTypes.push(options);
      return { options, dispose() {} };
    },
    visibleTextEditors: [],
    onDidChangeVisibleTextEditors: listener => {
      providers.visible = listener;
      return disposable;
    },
  },
  workspace: {
    getConfiguration: section => ({ get: (key, fallback) => (section === 'polyspec-template' && key in settings ? settings[key] : fallback) }),
    textDocuments: [],
    onDidOpenTextDocument: listener => {
      providers.open = listener;
      return disposable;
    },
    onDidChangeTextDocument: () => disposable,
    onDidCloseTextDocument: () => disposable,
  },
  commands: {
    registerTextEditorCommand: (command, callback) => {
      providers.command = { command, callback };
      return disposable;
    },
  },
  languages: {
    createDiagnosticCollection: () => ({ set: (uri, list) => diagnostics.set(uri, list), delete: uri => diagnostics.delete(uri), dispose() {} }),
    registerDocumentHighlightProvider: (language, provider) => {
      providers.highlight = { language, provider };
      return disposable;
    },
    registerFoldingRangeProvider: (language, provider) => {
      providers.folding = { language, provider };
      return disposable;
    },
    registerDocumentFormattingEditProvider: (language, provider) => {
      providers.document = { language, provider };
      return { dispose() {} };
    },
    registerDocumentRangeFormattingEditProvider: (language, provider) => {
      providers.range = { language, provider };
      return { dispose() {} };
    },
  },
};

function documentOf(text) {
  return {
    getText: () => text,
    languageId: 'polyspec-template',
    uri: { fsPath: '/work/page.tpl' },
    offsetAt: position => position.offset,
    positionAt: offset => new Position(offset, text.slice(0, offset).split('\n').length - 1),
  };
}

const load = Module._load;
Module._load = function loadWithVscode(request, ...rest) {
  return request === 'vscode' ? vscode : load.call(this, request, ...rest);
};
const extension = createRequire(import.meta.url)(join(root, manifest.main));
Module._load = load;
const context = { subscriptions: [] };
extension.activate(context);

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

test('manifest contributes the templateBlocks formatting setting', () => {
  const setting = manifest.contributes.configuration.properties['polyspec-template.format.templateBlocks'];
  assert.deepEqual(setting.enum, ['indent', 'flat']);
  assert.equal(setting.default, 'indent');
});

test('manifest supports untrusted and virtual workspaces and declares no Node.js engine', () => {
  assert.deepEqual(manifest.capabilities, { untrustedWorkspaces: { supported: true }, virtualWorkspaces: true });
  assert.deepEqual(Object.keys(manifest.engines), ['vscode']);
});

test('the bundle does not load the workspace packages at run time', () => {
  const bundle = readFileSync(join(root, manifest.main), 'utf8');
  assert.deepEqual([...new Set(bundle.match(/require\("[^"]+"\)/g))], ['require("vscode")']);
  assert.ok(existsSync(join(root, manifest.main)));
});

test('activate registers formatting, diagnostics, tag backgrounds, highlights, folding and the matching tag command', () => {
  assert.equal(decorationTypes.length, 1);
  assert.equal(providers.document.language, 'polyspec-template');
  assert.equal(providers.range.language, 'polyspec-template');
  assert.equal(providers.highlight.language, 'polyspec-template');
  assert.equal(providers.folding.language, 'polyspec-template');
  assert.equal(providers.command.command, 'polyspec-template.goToMatchingTag');
  const [command] = manifest.contributes.commands;
  assert.equal(command.command, providers.command.command);
  const [keybinding] = manifest.contributes.keybindings;
  assert.equal(keybinding.command, command.command);
});

test('diagnostics report the parse error with its code and range and clear it when the document parses', () => {
  const broken = documentOf('<p>\n  {? a}\n</p>');
  providers.open(broken);
  const [diagnostic] = diagnostics.get(broken.uri);
  assert.equal(diagnostic.code, 'E_PARSE_UNCLOSED_BLOCK');
  assert.equal(diagnostic.source, 'polyspec-template');
  assert.deepEqual([diagnostic.range.start.offset, diagnostic.range.start.line], [6, 1]);
  const fixed = { ...documentOf('{? a}x{/}'), uri: broken.uri };
  providers.open(fixed);
  assert.deepEqual(diagnostics.get(broken.uri), []);
});

test('highlights cover every tag of the construct under the cursor', () => {
  const text = '{? a}x{:? b}y{:}z{/}';
  const highlights = providers.highlight.provider.provideDocumentHighlights(documentOf(text), new Position(14));
  assert.deepEqual(highlights.map(item => text.slice(item.range.start.offset, item.range.end.offset)), ['{? a}', '{:? b}', '{:}', '{/}']);
});

test('folding ranges cover multi-line constructs up to the line before the close tag', () => {
  const text = '{@ x = xs}\n{? x}\na\n{/}\n{/}\n{? y}b{/}\n';
  const ranges = providers.folding.provider.provideFoldingRanges(documentOf(text));
  assert.deepEqual(ranges.map(range => [range.start, range.end]), [[0, 3], [1, 2]]);
});

test('the matching tag command cycles through the tags and starts from the enclosing construct', () => {
  const move = (text, offset) => {
    const editor = { document: documentOf(text), selection: { active: new Position(offset) }, revealRange() {} };
    providers.command.callback(editor);
    return editor.selection.start?.offset ?? null;
  };
  const text = '{? a}x{:}yy{/}';
  assert.equal(move(text, 0), 6);
  assert.equal(move(text, 7), 11);
  assert.equal(move(text, 13), 0);
  assert.equal(move(text, 9), 11);
  assert.equal(move('plain', 2), null);
});

test('tag backgrounds cover every tag except comments, with a light and a dark color', () => {
  const [type] = decorationTypes;
  assert.deepEqual(type.dark, { backgroundColor: '#16351c' });
  assert.deepEqual(type.light, { backgroundColor: '#e3f6dd' });
  const text = '<p class="{= c}">{* note *}{? a}{= b | raw}{/}</p>';
  const painted = [];
  const editor = { document: documentOf(text), setDecorations: (decoration, ranges) => painted.push({ decoration, ranges }) };
  vscode.window.visibleTextEditors = [editor];
  providers.visible([editor]);
  assert.equal(painted.length, 1);
  assert.equal(painted[0].decoration.options, type);
  assert.deepEqual(painted[0].ranges.map(range => text.slice(range.start.offset, range.end.offset)), ['{= c}', '{? a}', '{= b | raw}', '{/}']);
});

test('tag backgrounds stay unchanged while the document does not parse', () => {
  const painted = [];
  const editor = { document: documentOf('{? a}'), setDecorations: () => painted.push(true) };
  vscode.window.visibleTextEditors = [editor];
  providers.visible([editor]);
  assert.deepEqual(painted, []);
  vscode.window.visibleTextEditors = [];
});

test('document formatting replaces the document with the formatted text', () => {
  const text = '<p>{=a}</p>\n';
  const edits = providers.document.provider.provideDocumentFormattingEdits(documentOf(text), SPACES);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].newText, '<p>{= a}</p>\n');
  assert.equal(edits[0].range.start.offset, 0);
  assert.equal(edits[0].range.end.offset, text.length);
});

test('document formatting returns no edits for a formatted document', () => {
  assert.deepEqual(providers.document.provider.provideDocumentFormattingEdits(documentOf('<p>{= a}</p>'), SPACES), []);
});

test('document formatting returns no edits and logs the position for a source that does not parse', () => {
  assert.deepEqual(providers.document.provider.provideDocumentFormattingEdits(documentOf('{? a}'), SPACES), []);
  assert.match(warnings.at(-1), /^\/work\/page\.tpl:1:1: E_PARSE_UNCLOSED_BLOCK: /);
});

test('document formatting indents with the editor indent unit and the templateBlocks setting', () => {
  const text = '<ul>\n{@ x = xs}\n<li>{= x}</li>\n{/}\n</ul>';
  const format = options => providers.document.provider.provideDocumentFormattingEdits(documentOf(text), options)[0].newText;
  assert.equal(format(SPACES), '<ul>\n  {@ x = xs}\n    <li>{= x}</li>\n  {/}\n</ul>');
  assert.equal(format({ tabSize: 4, insertSpaces: false }), '<ul>\n\t{@ x = xs}\n\t\t<li>{= x}</li>\n\t{/}\n</ul>');
  settings['format.templateBlocks'] = 'flat';
  try {
    assert.equal(format({ tabSize: 4, insertSpaces: true }), '<ul>\n    {@ x = xs}\n    <li>{= x}</li>\n    {/}\n</ul>');
  } finally {
    settings['format.templateBlocks'] = 'indent';
  }
});

test('document formatting returns no edits and logs an HTML structure that is not balanced', () => {
  assert.deepEqual(providers.document.provider.provideDocumentFormattingEdits(documentOf('<div>\n<p>a</div>'), SPACES), []);
  assert.match(warnings.at(-1), /^\/work\/page\.tpl:2:5: HTML structure: the end tag <\/div> does not match the open element <p>; no edits returned$/);
});

test('range formatting formats only the tags inside the range', () => {
  const text = '{=a}{=b}';
  const edits = providers.range.provider.provideDocumentRangeFormattingEdits(documentOf(text), new Range(new Position(4), new Position(8)), SPACES);
  assert.equal(edits[0].newText, '{=a}{= b}');
});
