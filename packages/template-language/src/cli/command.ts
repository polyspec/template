// Command line interface template-language, the command of the TypeScript formatter in the conformance contract
// (docs/spec/conformance.md, CNF-4):
//   format FILE [--indent none|tab|N] [--delimiters OC]
// It prints the formatted text without adding a newline and exits with status 0, prints a format error as the JSON
// {"reason","code","line","col","message"} on standard error and exits with status 2, and exits with status 1 on a
// usage error.
import { readFileSync } from 'node:fs';
import type { FormatOptions } from '../format.js';
import { DELIMITERS_MESSAGE, delimitersArgument, indentUnit } from './args.js';
import { formatBytes } from './main.js';

const USAGE = 'usage: template-language format FILE [--indent none|tab|N] [--delimiters OC]\n';

/** Runs the command with the given arguments and returns the exit status. */
export function main(argv: readonly string[]): number {
  const [command, file, ...rest] = argv;
  if (command !== 'format' || file === undefined) return usageError('the command format and FILE are required');
  let indent: string | null = '  ';
  let delimiters: string | undefined;
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] as string;
    const value = rest[index + 1];
    if (flag === '--indent') {
      const unit = value === 'none' ? null : indentUnit(value);
      if (unit === undefined) return usageError('--indent requires a number from 1 to 8, tab or none');
      indent = unit;
    } else if (flag === '--delimiters') {
      const pair = delimitersArgument(value);
      if (pair === null) return usageError(DELIMITERS_MESSAGE);
      delimiters = pair;
    } else {
      return usageError(`unknown option ${flag}`);
    }
  }
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(file);
  } catch {
    return usageError(`cannot read ${file}`);
  }
  const options: FormatOptions = delimiters === undefined ? { indent } : { indent, delimiters };
  const result = formatBytes(bytes, file, options);
  if (!result.ok) {
    const { reason, code, line, col, message } = result.error;
    process.stderr.write(JSON.stringify({ reason, code, line, col, message }));
    return 2;
  }
  process.stdout.write(result.text);
  return 0;
}

function usageError(message: string): number {
  process.stderr.write(`template-language: ${message}\n${USAGE}`);
  return 1;
}
