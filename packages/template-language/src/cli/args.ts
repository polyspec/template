// Command line arguments of template-fmt.

/** What the command does with each input. */
export type Mode = 'print' | 'write' | 'check';

/** Parsed command line. `paths` is empty when the input is standard input. */
export interface Arguments {
  mode: Mode;
  help: boolean;
  delimiters: string | undefined;
  /** The indent unit, or null for --indent keep. */
  indent: string | null;
  templateBlocks: 'indent' | 'flat';
  paths: string[];
}

export const USAGE = `usage: template-fmt [--write | --check] [--delimiters OC] [--indent N|tab|keep]
                    [--template-blocks indent|flat] [PATH ...]

Formats the whitespace inside template tags and indents lines by the nesting of HTML
elements and template blocks. No other text outside tags is changed.

  PATH              a .tpl file, or a directory that is searched for .tpl files;
                    "-" or no PATH reads standard input and writes standard output
  --write           rewrite every file that is not formatted
  --check           change nothing; list every file that is not formatted
  --delimiters OC   open and close delimiter characters (default "{}")
  --indent N|tab|keep
                    indent unit: N spaces (1 to 8), a tab, or keep every line's
                    indentation (default 2)
  --template-blocks indent|flat
                    indent: template blocks add a level like HTML elements (default);
                    flat: they add none
  --help            print this text

Without --write or --check, exactly one file or standard input is formatted to standard output.

Exit status: 0 success; 1 --check found a file that is not formatted;
2 a file does not parse, its formatted AST differs, its HTML structure is not balanced,
or the arguments are invalid.
`;

/** Parses the arguments, or returns an error message. */
export function parseArguments(argv: readonly string[]): Arguments | string {
  const result: Arguments = { mode: 'print', help: false, delimiters: undefined, indent: '  ', templateBlocks: 'indent', paths: [] };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index] as string;
    switch (argument) {
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--write':
      case '--check': {
        const mode = argument === '--write' ? 'write' : 'check';
        if (result.mode !== 'print' && result.mode !== mode) return '--write and --check cannot be combined';
        result.mode = mode;
        break;
      }
      case '--delimiters': {
        const value = argv[index + 1];
        if (value === undefined || value.length !== 2) return '--delimiters requires two characters';
        result.delimiters = value;
        index++;
        break;
      }
      case '--indent': {
        const value = argv[index + 1];
        if (value === 'keep') result.indent = null;
        else if (value === 'tab') result.indent = '\t';
        else if (value !== undefined && /^[1-8]$/.test(value)) result.indent = ' '.repeat(Number(value));
        else return '--indent requires a number from 1 to 8, tab or keep';
        index++;
        break;
      }
      case '--template-blocks': {
        const value = argv[index + 1];
        if (value !== 'indent' && value !== 'flat') return '--template-blocks requires indent or flat';
        result.templateBlocks = value;
        index++;
        break;
      }
      default:
        if (argument.startsWith('--')) return `unknown option ${argument}`;
        result.paths.push(argument);
    }
  }
  return result;
}
