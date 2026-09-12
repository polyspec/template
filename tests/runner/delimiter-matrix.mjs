#!/usr/bin/env node
// Exercises every valid ASCII delimiter pair through every language CLI.
// This is deliberately data-driven: a new delimiter character cannot be
// accepted by one implementation accidentally while another rejects it.
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invoke, prepare, selectLanguages } from './drivers.mjs';

const delimiterChars = [];
for (let code = 0x21; code < 0x7f; code++) {
  const char = String.fromCharCode(code);
  if (!/[A-Za-z0-9_\\]/.test(char)) delimiterChars.push(char);
}

const languages = selectLanguages(process.env.DELIMITER_MATRIX_LANGS ?? 'ts,go,rust,php');
for (const language of languages) prepare(language);

const root = realpathSync(mkdtempSync(join(tmpdir(), 'template-delimiter-matrix-')));
const input = join(root, 'input.tpl');
const failures = [];
const quoted = [
  ['{}', '{:a="}{}{}"}|{=a}', '|}{}{}'],
  ['[}', '[:a="}{}{}"}|[=a}', '|}{}{}'],
  [';;', ';:a="2;;22";|;=a;', '|2;;22'],
  ['<>', '<:a=">{}<">|<=a>', '|&gt;{}&lt;'],
  ['!"', `!:a='x{}'"R!=a"E`, 'LRx{}E'],
  ['{}', `{:a="x\\\"}{}{}"}|{=a}`, '|x&quot;}{}{}'],
];

try {
  for (const open of delimiterChars) {
    for (const close of delimiterChars) {
      const source = `L${open}:a=1${close}R${open}=a${close}E`;
      writeFileSync(input, source);
      for (const language of languages) {
        const result = invoke(language, ['render', 'input.tpl', '--root', root, '--delimiters', `${open}${close}`], root);
        if (result.status !== 0 || result.stdout !== 'LR1E') {
          failures.push(`${language} ${JSON.stringify(open + close)}: status=${result.status}, output=${JSON.stringify(result.stdout)}, error=${result.stderr.trim()}`);
        }
      }
    }
  }

  for (const [pair, source, expected] of quoted) {
    writeFileSync(input, source);
    for (const language of languages) {
      const result = invoke(language, ['render', 'input.tpl', '--root', root, '--delimiters', pair], root);
      if (result.status !== 0 || result.stdout !== expected) {
        failures.push(`${language} quoted ${JSON.stringify(pair)}: status=${result.status}, output=${JSON.stringify(result.stdout)}, error=${result.stderr.trim()}`);
      }
    }
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

const pairCount = delimiterChars.length ** 2;
if (failures.length) {
  process.stderr.write(`${failures.length} delimiter matrix failures out of ${pairCount * languages.length + quoted.length * languages.length}\n`);
  for (const failure of failures.slice(0, 40)) process.stderr.write(`${failure}\n`);
  process.exit(1);
}
process.stdout.write(`${pairCount * languages.length + quoted.length * languages.length} delimiter matrix checks passed (${pairCount} pairs, ${languages.length} languages)\n`);
