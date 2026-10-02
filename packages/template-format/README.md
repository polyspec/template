# @polyspec/template-format

[한국어](README.ko.md).

Formatter for template sources. It normalizes whitespace inside template tags and indents lines by the nesting of HTML elements and template blocks; it changes no other text outside tags. It parses the source and the result with `@polyspec/template` and returns the result only when both ASTs are equal without their `span` fields and the indentation of lines. `indent: null` keeps the indentation.

## Library

```ts
import { format } from '@polyspec/template-format';

const result = format('<p>{=title|upper}</p>', { name: 'page.tpl' });
if (result.ok) console.log(result.text);
else console.error(`${result.error.line}:${result.error.col}: ${result.error.code}`);
```

`templateStructure(source, options)` returns the parse error with string positions, or the block constructs (opening, branch and close tags) that editors use for diagnostics, matching tags and folding.

Options of `format()`: `name` (template name in errors), `delimiters` (two characters, default `{}`) and `range` (`{ start, end }` string indexes; only tags completely inside the range are formatted).

## Command line

```sh
template-fmt page.tpl
template-fmt --check templates
template-fmt --write templates
template-fmt < page.tpl
```

Exit status 0 means success, 1 means that `--check` found a file that is not formatted, and 2 means that a file does not parse, a formatted AST differs or the arguments are invalid.

The formatting style, the safety invariant and the command line are described in [Formatter and VS Code extension](../../docs/operations/editor-tools.md).
