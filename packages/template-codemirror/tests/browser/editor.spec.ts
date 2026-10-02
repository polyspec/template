// The template extension in Chromium: typing indentation, token classes, tag backgrounds, diagnostics and formatting.
import { expect, test, type Page } from '@playwright/test';
import { pageScript } from './setup.js';

async function mount(page: Page, doc: string, dark: boolean): Promise<void> {
  await page.setContent('<!doctype html><html><body><div id="editor"></div></body></html>');
  await page.addScriptTag({ path: pageScript });
  await page.evaluate(([text, mode]) => window.mount(text, mode), [doc, dark] as const);
}

function color(page: Page, selector: string, property: 'color' | 'background-color'): Promise<string> {
  return page.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test('indents typed lines', async ({ page }) => {
  await mount(page, '', false);
  await page.keyboard.type('<ul>');
  await page.keyboard.press('Enter');
  await page.keyboard.type('{@ x = xs}');
  await page.keyboard.press('Enter');
  const lines = (await page.evaluate(() => window.text())).split('\n');
  expect(lines.slice(0, 3)).toEqual(['<ul>', '  {@ x = xs}', '    ']);
});

test('marks tokens and paints the tag background', async ({ page }) => {
  await mount(page, '<a href="{= item.url}">{@ x = xs}{/}</a>\n', false);
  await expect(page.locator('.cm-template-tag')).toHaveCount(3);
  await expect(page.locator('.cm-template-keyword').first()).toHaveText('=');
  await expect(page.locator('.cm-template-variable').first()).toHaveText('item');
  await expect(page.locator('.cm-template-property').first()).toHaveText('.url');
  // The token inside the attribute value keeps the template color over the HTML string color.
  expect(await color(page, '.cm-template-variable', 'color')).toBe('rgb(149, 56, 0)');
  expect(await color(page, '.cm-template-tag', 'background-color')).toBe('rgb(227, 246, 221)');
  await mount(page, '<p>{= x}</p>\n', true);
  expect(await color(page, '.cm-template-tag', 'background-color')).toBe('rgb(22, 53, 28)');
  expect(await color(page, '.cm-template-variable', 'color')).toBe('rgb(255, 166, 87)');
});

test('reports an unclosed block', async ({ page }) => {
  await mount(page, '<ul>\n{@ x = xs}\n</ul>\n', false);
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);
  expect(await page.evaluate(() => window.diagnostics())).toEqual(['E_PARSE_UNCLOSED_BLOCK: block is not closed before the end of the file']);
});

test('formats with Shift-Alt-f', async ({ page }) => {
  await mount(page, '<ul>\n{@ x = xs}\n<li>{=x}</li>\n{/}\n</ul>\n', false);
  await page.keyboard.press('Shift+Alt+KeyF');
  expect(await page.evaluate(() => window.text())).toBe('<ul>\n  {@ x = xs}\n    <li>{= x}</li>\n  {/}\n</ul>\n');
});

test('keeps a text that does not parse on Shift-Alt-f', async ({ page }) => {
  await mount(page, '<ul>\n{@ x = xs}\n</ul>\n', false);
  await page.keyboard.press('Shift+Alt+KeyF');
  expect(await page.evaluate(() => window.text())).toBe('<ul>\n{@ x = xs}\n</ul>\n');
});
