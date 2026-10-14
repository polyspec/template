// Command line interface template-language, the command of the TypeScript formatter in the conformance contract
// (docs/spec/conformance.md, CNF-4):
//   format [--indent none|tab|N] [--delimiters OC] FILE
// It prints the formatted text without adding a newline and exits with status 0, prints a format error as the JSON
// {"reason","code","line","col","message"} on standard error and exits with status 2, and exits with status 1 on a
// usage error.
import { readFileSync } from 'node:fs';
import type { FormatOptions } from '../format.js';
import { FORMAT_OPTIONS, formatOptions, readCommandLine } from './args.js';
import { formatBytes } from './main.js';

const USAGE = 'usage: template-language format [--indent none|tab|N] [--delimiters OC] FILE\n';

/** Runs the command with the given arguments and returns the exit status. */
export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  if (command !== 'format') return usageError('the command format is required');
  const parsed = readCommandLine(rest, FORMAT_OPTIONS);
  if (typeof parsed === 'string') return usageError(parsed);
  const [file, ...extra] = parsed.positionals;
  if (file === undefined || extra.length > 0) return usageError('exactly one FILE is required');
  const values = formatOptions(parsed.values);
  if (typeof values === 'string') return usageError(values);
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error)) throw error;
    return usageError(`cannot read ${file}: ${error.message}`);
  }
  const { indent, delimiters } = values;
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
