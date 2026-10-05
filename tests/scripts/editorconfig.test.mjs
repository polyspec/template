// Tests that the tracked text files follow the rules that `.editorconfig` declares for them (T13.1-4): charset,
// end_of_line, insert_final_newline, indent_style and trim_trailing_whitespace, with the sections applied in order and
// `unset` removing a rule. indent_size is not checked: a file can align continuation lines with any number of
// spaces. Git decides which tracked files are text (`git ls-files --eol`); empty files have nothing to check.
// A failure names the file, the line and the rule.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { globExpression } from '../../scripts/owner-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The sections of .editorconfig: a pattern without a slash matches a file name in any directory; one with a slash
// matches the path from the root.
function sections() {
  const result = [];
  for (const line of readFileSync(path.join(ROOT, '.editorconfig'), 'utf8').split('\n')) {
    const header = /^\[(.+)\]$/.exec(line);
    const property = /^([a-z_]+)\s*=\s*(\S+)$/.exec(line);
    if (header) {
      const pattern = header[1].replace(/^\//, '');
      result.push({ pattern, expression: globExpression(pattern.includes('/') ? pattern : `**/${pattern}`), rules: {} });
    } else if (property && result.length) result.at(-1).rules[property[1]] = property[2];
  }
  return result;
}

function rulesOf(file, declared) {
  const rules = {};
  for (const section of declared) if (section.expression.test(file)) Object.assign(rules, section.rules);
  for (const [name, value] of Object.entries(rules)) if (value === 'unset') delete rules[name];
  return rules;
}

// The violations of one file.
export function violations(file, bytes, rules) {
  const found = [];
  let text = bytes.toString('utf8');
  if (rules.charset === 'utf-8' && !Buffer.from(text, 'utf8').equals(bytes)) found.push(`${file}: charset utf-8: the file is not valid UTF-8`);
  if (rules.charset === 'utf-8' && text.startsWith('﻿')) found.push(`${file}: charset utf-8: the file starts with a byte order mark`);
  if (rules.end_of_line === 'lf' && text.includes('\r')) found.push(`${file}:${text.slice(0, text.indexOf('\r')).split('\n').length}: end_of_line lf: the line ends with a carriage return`);
  if (rules.insert_final_newline === 'true' && !text.endsWith('\n')) found.push(`${file}: insert_final_newline true: the file does not end with a newline`);
  text = text.replaceAll('\r', '');
  text.split('\n').forEach((line, index) => {
    if (rules.trim_trailing_whitespace === 'true' && /[ \t]$/.test(line)) found.push(`${file}:${index + 1}: trim_trailing_whitespace true: the line ends with whitespace`);
    if (rules.indent_style === 'space' && line.startsWith('\t')) found.push(`${file}:${index + 1}: indent_style space: the line is indented with a tab`);
    if (rules.indent_style === 'tab' && /^ +\S/.test(line)) found.push(`${file}:${index + 1}: indent_style tab: the line is indented with spaces`);
  });
  return found;
}

test('the tracked text files follow the rules of .editorconfig', () => {
  const listing = spawnSync('git', ['ls-files', '--eol', '-z'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(listing.status, 0, listing.stderr);
  const declared = sections();
  const found = [];
  let checked = 0;
  for (const record of listing.stdout.split('\0').filter(Boolean)) {
    const [meta, file] = record.split('\t');
    if (/\bi\/(-text|none)\b/.test(meta)) continue;
    checked += 1;
    found.push(...violations(file, readFileSync(path.join(ROOT, file)), rulesOf(file, declared)));
  }
  assert.ok(checked > 1000, `checked ${checked} files`);
  assert.deepEqual(found, [], `files that break .editorconfig:\n${found.slice(0, 50).join('\n')}${found.length > 50 ? `\n... ${found.length} in all` : ''}`);
});

test('a violation names the file, the line and the rule', () => {
  const rules = { charset: 'utf-8', end_of_line: 'lf', insert_final_newline: 'true', indent_style: 'space', trim_trailing_whitespace: 'true' };
  assert.deepEqual(violations('a.md', Buffer.from('ok\n\tindented \r\nlast'), rules), [
    'a.md:2: end_of_line lf: the line ends with a carriage return',
    'a.md: insert_final_newline true: the file does not end with a newline',
    'a.md:2: trim_trailing_whitespace true: the line ends with whitespace',
    'a.md:2: indent_style space: the line is indented with a tab',
  ]);
});
