// Command line interface template-fmt: prints, rewrites or checks formatted templates.
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parse, TemplateError } from '@polyspec/template';
import { format, type FormatResult } from '../format.js';
import { parseArguments, USAGE } from './args.js';
import { collectFiles } from './files.js';

const STDIN_NAME = '<stdin>';

/** Runs the command with the given arguments and returns the exit status. */
export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArguments(argv);
  if (typeof parsed === 'string') return usageError(parsed);
  if (parsed.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const { mode, delimiters, paths } = parsed;
  const stdin = paths.length === 0 || (paths.length === 1 && paths[0] === '-');
  if (!stdin && paths.includes('-')) return usageError('"-" cannot be combined with other paths');

  if (stdin) {
    if (mode === 'write') return usageError('--write requires a path');
    const result = formatBytes(await readStdin(), STDIN_NAME, delimiters);
    if (!result.ok) return reportFailure(STDIN_NAME, result);
    if (mode === 'check') {
      if (!result.changed) return 0;
      process.stdout.write(`${STDIN_NAME}\n`);
      return 1;
    }
    process.stdout.write(result.text);
    return 0;
  }

  let files: string[];
  try {
    if (mode === 'print' && (paths.length !== 1 || statSync(paths[0] as string).isDirectory())) {
      return usageError('several files or a directory require --write or --check');
    }
    files = collectFiles(paths);
  } catch (error) {
    process.stderr.write(`template-fmt: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  let failed = false;
  let unformatted = false;
  for (const file of files) {
    const result = formatBytes(readFileSync(file), file, delimiters);
    if (!result.ok) {
      reportFailure(file, result);
      failed = true;
      continue;
    }
    if (mode === 'print') {
      process.stdout.write(result.text);
      continue;
    }
    if (!result.changed) continue;
    unformatted = true;
    if (mode === 'write') writeFileSync(file, result.text);
    process.stdout.write(`${file}\n`);
  }
  if (failed) return 2;
  return mode === 'check' && unformatted ? 1 : 0;
}

function usageError(message: string): number {
  process.stderr.write(`template-fmt: ${message}\n${USAGE}`);
  return 2;
}

// Decodes UTF-8 and formats. Invalid UTF-8 is reported with the parser's E_LEX_INVALID_UTF8 position.
function formatBytes(bytes: Uint8Array, name: string, delimiters: string | undefined): FormatResult {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    try {
      parse(bytes, name);
    } catch (error) {
      if (error instanceof TemplateError) {
        return { ok: false, error: { reason: 'parse', code: error.code, line: error.line, col: error.col, message: error.message } };
      }
    }
    return { ok: false, error: { reason: 'parse', code: 'E_LEX_INVALID_UTF8', line: 0, col: 0, message: 'invalid UTF-8' } };
  }
  return format(source, delimiters === undefined ? { name } : { name, delimiters });
}

function reportFailure(path: string, result: Extract<FormatResult, { ok: false }>): number {
  const { error } = result;
  const label = error.reason === 'parse' ? error.code ?? 'parse error' : 'formatted AST differs';
  process.stderr.write(`${path}:${error.line}:${error.col}: ${label}: ${error.message}\n`);
  return 2;
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
