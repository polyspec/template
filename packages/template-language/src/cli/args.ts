// Command line arguments of template-fmt and of the conformance command template-language. Both parse with
// node:util parseArgs.
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

/** What the command does with each input. */
export type Mode = 'print' | 'write' | 'check';

/** Parsed command line of template-fmt. `paths` is empty when the input is standard input. */
export interface Arguments {
  mode: Mode;
  help: boolean;
  delimiters: string | undefined;
  /** The indent unit, or null for --indent none. */
  indent: string | null;
  templateBlocks: 'indent' | 'flat';
  paths: string[];
}

export const USAGE = `usage: template-fmt [--write | --check] [--delimiters OC] [--indent N|tab|none]
                    [--template-blocks indent|flat] [PATH ...]

Formats the whitespace inside template tags and indents lines by the nesting of HTML
elements and template blocks. No other text outside tags is changed.

  PATH              a .tpl file, or a directory that is searched for .tpl files;
                    "-" or no PATH reads standard input and writes standard output
  --write           rewrite every file that is not formatted
  --check           change nothing; list every file that is not formatted
  --delimiters OC   open and close delimiter characters (default "{}")
  --indent N|tab|none
                    indent unit: N spaces (1 to 8), a tab, or none to keep every
                    line's indentation (default 2)
  --template-blocks indent|flat
                    indent: template blocks add a level like HTML elements (default);
                    flat: they add none
  --help            print this text

Without --write or --check, exactly one file or standard input is formatted to standard output.

Exit status: 0 success; 1 --check found a file that is not formatted;
2 a file does not parse, its formatted AST differs, its HTML structure is not balanced,
or the arguments are invalid.
`;

/** The options of the format command of the conformance contract (CNF-4), which template-fmt also takes. */
export const FORMAT_OPTIONS = {
  delimiters: { type: 'string' },
  indent: { type: 'string' },
} as const satisfies ParseArgsOptionsConfig;

const FMT_OPTIONS = {
  ...FORMAT_OPTIONS,
  write: { type: 'boolean', default: false },
  check: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  'template-blocks': { type: 'string', default: 'indent' },
} as const satisfies ParseArgsOptionsConfig;

/**
 * Parses `argv` with parseArgs (strict, with operands), or returns the message of its usage error. Errors other than
 * those of parseArgs propagate.
 */
export function readCommandLine<const O extends ParseArgsOptionsConfig>(argv: readonly string[], options: O) {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], options, strict: true, allowPositionals: true });
  } catch (error) {
    if (error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS_')) return error.message;
    throw error;
  }
  return { values: parsed.values, positionals: parsed.positionals };
}

/** Parses the arguments of template-fmt, or returns an error message. */
export function parseArguments(argv: readonly string[]): Arguments | string {
  const parsed = readCommandLine(argv, FMT_OPTIONS);
  if (typeof parsed === 'string') return parsed;
  const { values, positionals } = parsed;
  if (values.write && values.check) return '--write and --check cannot be combined';
  const shared = formatOptions(values);
  if (typeof shared === 'string') return shared;
  const templateBlocks = values['template-blocks'];
  if (templateBlocks !== 'indent' && templateBlocks !== 'flat') return '--template-blocks requires indent or flat';
  return { mode: values.write ? 'write' : values.check ? 'check' : 'print', help: values.help, ...shared, templateBlocks, paths: positionals };
}

/** The indent unit and delimiters of the values of FORMAT_OPTIONS, or the message of an invalid value. */
export function formatOptions(values: { indent?: string | undefined; delimiters?: string | undefined }): { indent: string | null; delimiters: string | undefined } | string {
  const indent = values.indent === undefined ? '  ' : indentUnit(values.indent);
  if (indent === undefined) return '--indent requires a number from 1 to 8, tab or none';
  if (values.delimiters !== undefined && values.delimiters.length !== 2) return '--delimiters requires two characters';
  return { indent, delimiters: values.delimiters };
}

/** The indent unit of an --indent value: `N` (1 to 8 spaces), `tab`, or `none` (null); undefined for any other value. */
function indentUnit(value: string): string | null | undefined {
  if (value === 'none') return null;
  if (value === 'tab') return '\t';
  if (/^[1-8]$/.test(value)) return ' '.repeat(Number(value));
  return undefined;
}
