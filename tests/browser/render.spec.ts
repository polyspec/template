// Renders fixture cases in Chromium with the browser build and compares with the expected files.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    /** Renders the browser cases in the page; index.html defines it. */
    renderCases?: (items: unknown) => Promise<unknown>;
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const casesDir = join(root, 'tests', 'cases');
const CASE_FILES = new Set(['case.json', 'data.json', 'define.json', 'env.json', 'options.json']);

interface BrowserCase {
  id: string;
  templates: Record<string, string>;
  data: string;
  // JSON text, read by the template's JSON parser in the page, as the command line programs read their files
  define?: string;
  env?: string;
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
      if (define !== undefined) item.define = define;
      if (env !== undefined) item.env = env;
      if (options) {
        const parsed: unknown = JSON.parse(options);
        const delimiters: unknown = typeof parsed === 'object' && parsed !== null && 'delimiters' in parsed ? parsed.delimiters : undefined;
        if (typeof delimiters !== 'string') throw new Error(`${item.id}/options.json names no delimiters string`);
        item.delimiters = delimiters;
      }
      const html = read('expected.html');
      const error = read('expected.error.json');
      if (html !== undefined) item.expectedHtml = html;
      if (error !== undefined) item.expectedError = JSON.parse(error);
      cases.push(item);
    }
  }
  return cases.sort((a, b) => a.id.localeCompare(b.id));
}

/** The result of one case in the page: its output, or the object of its error. */
interface RenderResult {
  id: string;
  html?: string;
  error?: unknown;
}

function isRenderResult(value: unknown): value is RenderResult {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && typeof value.id === 'string' && (!('html' in value) || value.html === undefined || typeof value.html === 'string');
}

test('renders every fixture case in the browser', async ({ page, baseURL }) => {
  expect(baseURL, 'TEMPLATE_BROWSER_URL names the static server; run the browser test with tests/browser/run.mts').toBeTruthy();
  const cases = loadCases();
  await page.goto('/tests/browser/index.html');
  // index.html defines renderCases on the window of the page (declared above as optional, since only the page has it),
  // so the function is checked before the call and its result is checked below.
  const rendered: unknown = await page.evaluate(async items => {
    if (window.renderCases === undefined) throw new Error('index.html defines no renderCases function on the window');
    return window.renderCases(items);
  }, cases);
  if (!Array.isArray(rendered) || !rendered.every(isRenderResult)) throw new Error(`renderCases returned no list of results: ${JSON.stringify(rendered)}`);
  const results: RenderResult[] = rendered;
  expect(results).toHaveLength(cases.length);
  const failures: string[] = [];
  for (const [index, item] of cases.entries()) {
    const result = results[index];
    if (result === undefined) throw new Error(`no result for ${item.id}`);
    if (item.expectedError !== undefined) {
      if (JSON.stringify(result.error) !== JSON.stringify(item.expectedError)) failures.push(`${item.id}: expected error ${JSON.stringify(item.expectedError)}, got ${JSON.stringify(result)}`);
    } else if (result.html !== item.expectedHtml) {
      failures.push(`${item.id}: html differs: ${JSON.stringify(result.error ?? result.html?.slice(0, 80))}`);
    }
  }
  expect(failures).toEqual([]);
});
