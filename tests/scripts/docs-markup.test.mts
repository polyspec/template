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
const { createMarkdownRenderer } = await import(rendererModule) as {
  createMarkdownRenderer(root: string): Promise<{ render(source: string): string }>;
};

const root = fileURLToPath(new URL('../../', import.meta.url));
const markdown = await createMarkdownRenderer(`${root}docs`);
const files = execFileSync('git', ['ls-files', '-z', '--', 'docs/plans/**/*.md'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

for (const file of files) {
  test(`${file} contains valid template markup`, { timeout: 5000 }, () => {
    const failures: string[] = [];
    const html = markdown.render(readFileSync(new URL(file, new URL('../../', import.meta.url)), 'utf8'));
    compile(html, { onError: error => failures.push(`${error.loc?.start.line}: ${error.message}`) });
    assert.deepEqual(failures, [], `${file}: inline source must be code, and HTML tags must close`);
  });
}
