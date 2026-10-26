// The plan pages must compile as Vue templates after Markdown renders their inline source examples.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { compile } from '@vue/compiler-dom';
// Load the build-time renderer without importing VitePress client declarations
// into the Node-only infrastructure typecheck.
const rendererModule: string = 'vitepress';
const rendererApi: unknown = await import(rendererModule);
assert.ok(typeof rendererApi === 'object' && rendererApi !== null && 'createMarkdownRenderer' in rendererApi);
assert.equal(typeof rendererApi.createMarkdownRenderer, 'function');
if (typeof rendererApi.createMarkdownRenderer !== 'function') throw new TypeError('VitePress must export createMarkdownRenderer');

const root = fileURLToPath(new URL('../../', import.meta.url));
const markdown: unknown = await Reflect.apply(rendererApi.createMarkdownRenderer, rendererApi, [`${root}docs`]);
assert.ok(typeof markdown === 'object' && markdown !== null && 'render' in markdown);
if (typeof markdown.render !== 'function') throw new TypeError('VitePress renderer must export render');
const render = markdown.render;
const files = execFileSync('git', ['ls-files', '-z', '--', 'docs/plans/**/*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

for (const file of files) {
  test(`${file} contains valid template markup`, { timeout: 5000 }, () => {
    const failures: string[] = [];
    const html: unknown = Reflect.apply(render, markdown, [readFileSync(new URL(file, new URL('../../', import.meta.url)), 'utf8')]);
    assert.equal(typeof html, 'string');
    if (typeof html !== 'string') throw new TypeError('VitePress must render a string');
    compile(html, { onError: error => failures.push(`${error.loc?.start.line}: ${error.message}`) });
    assert.deepEqual(failures, [], `${file}: inline source must be code, and HTML tags must close`);
  });
}
