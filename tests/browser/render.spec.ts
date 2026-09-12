// Renders fixture cases in Chromium with the browser build and compares with the expected files.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const casesDir = join(root, 'tests', 'cases');
const CASE_FILES = new Set(['case.json', 'data.json', 'define.json', 'env.json', 'options.json']);

interface BrowserCase {
  id: string;
  templates: Record<string, string>;
  data: string;
  define?: unknown;
  env?: unknown;
  delimiters?: string;
  expectedHtml?: string;
  expectedError?: unknown;
}

function collectTemplates(dir: string, prefix: string, into: Record<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectTemplates(path, `${prefix}${entry.name}/`, into);
    else if (!CASE_FILES.has(entry.name) && !entry.name.startsWith('expected.')) into[`${prefix}${entry.name}`] = readFileSync(path, 'utf8');
  }
}

function loadCases(): BrowserCase[] {
  const cases: BrowserCase[] = [];
  for (const group of readdirSync(casesDir, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const entry of readdirSync(join(casesDir, group.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(casesDir, group.name, entry.name);
      const inputBytes = readFileSync(join(dir, 'input.tpl'));
      // Cases with invalid UTF-8 or a BOM depend on byte input and are covered by the CLI suite.
      if (inputBytes.includes(0xff) || (inputBytes[0] === 0xef && inputBytes[1] === 0xbb)) continue;
      const templates: Record<string, string> = {};
      collectTemplates(dir, '', templates);
      const read = (name: string): string | undefined => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : undefined);
      const dataText = read('data.json');
      if (dataText !== undefined && dataText.includes('\uFFFD')) continue;
      const options = read('options.json');
      const item: BrowserCase = { id: `${group.name}/${entry.name}`, templates, data: dataText ?? '{}' };
      const define = read('define.json');
      const env = read('env.json');
      if (define) item.define = JSON.parse(define);
      if (env) item.env = JSON.parse(env);
      if (options) item.delimiters = (JSON.parse(options) as { delimiters?: string }).delimiters;
      const html = read('expected.html');
      const error = read('expected.error.json');
      if (html !== undefined) item.expectedHtml = html;
      if (error !== undefined) item.expectedError = JSON.parse(error);
      cases.push(item);
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

test('renders every fixture case in the browser', async ({ page }) => {
  const cases = loadCases();
  await page.goto('/tests/browser/index.html');
  const results = (await page.evaluate(async items => (window as unknown as { renderCases: (c: unknown) => Promise<unknown> }).renderCases(items), cases)) as {
    id: string;
    html?: string;
    error?: unknown;
  }[];
  expect(results).toHaveLength(cases.length);
  const failures: string[] = [];
  for (const [index, item] of cases.entries()) {
    const result = results[index] as { id: string; html?: string; error?: unknown };
    if (item.expectedError !== undefined) {
      if (JSON.stringify(result.error) !== JSON.stringify(item.expectedError)) failures.push(`${item.id}: expected error ${JSON.stringify(item.expectedError)}, got ${JSON.stringify(result)}`);
    } else if (result.html !== item.expectedHtml) {
      failures.push(`${item.id}: html differs: ${JSON.stringify(result.error ?? result.html?.slice(0, 80))}`);
    }
  }
  expect(failures).toEqual([]);
});
