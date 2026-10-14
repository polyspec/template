<!-- doc-id: docs-spec-formatting -->
# Formatting

[한국어](/ko/spec/formatting).

This document defines the tokens of a template and the formatter: the formatting style inside tags, the indentation of lines, the parts that the formatter keeps and the safety invariant. Every implementation provides both through the commands `tokens` and `format` of the conformance contract (CNF-4), and the conformance cases compare their results (CNF-2, CNF-9). The command line tool `template-fmt`, the language server and the editor adapters are described in [Formatter, language server and editors](../operations/editor-tools.md).

## Tokens

**FMT-1** The tokens of a template are the result of analyzing it: every part of every tag that the parser accepts, classified with the types of EDT-8 ([editor support](editor.md)), sorted by position and not overlapping. Text outside tags has no tokens. Every implementation computes the same tokens for the same source and delimiters.

**FMT-2** A token is `[start, end, type]`. `start` and `end` are UTF-8 byte offsets of the source, counted from the first byte after a byte order mark as AST spans count them (LEX-2, AST-2). A source that does not parse has no tokens; the command `tokens` reports the parser error.

## Formatting style

**FMT-3** The formatter changes only the whitespace inside tags (FMT-4 to FMT-6) and the spaces and tabs at the start of lines (FMT-9 to FMT-12). It changes no other text outside tags.

**FMT-4** Each tag kind has one formatted form:

| Tag | Formatted form |
| --- | --- |
| echo | `{= expr}` |
| if, else-if, else, close | `{? expr}`, `{:? expr}`, `{:}`, `{/}` |
| loop | `{@ name = expr}` |
| assignment | `{:name = expr}`, `{:name += expr}`, `{:name++}` |
| include | `{+ path}` |
| block | `{# id path name name:value}` |
| if-block | `{?# id}` |

No whitespace stands between the open delimiter and the sigil or before the close delimiter, and one space follows the sigil when the tag has a body.

**FMT-5** Inside an expression:

- One space around binary operators, `?` and `:` of the ternary, `?:`, `??`, `in`, `=>` and the pipe `|`.
- One space after `,`; no space before `,`.
- No space after `(`, `[`, `...` and unary `!` and `-`; no space before `)` and `]`.
- No space between a function or method name and `(`, between an operand and an index `[`, and around `::` of a class call.
- Accessors (`.name`, `.0`) stay attached to the left operand.

**FMT-6** A block tag body keeps its words and replaces each run of whitespace between them with one space.

**FMT-7** The formatter keeps these parts as written:

- text outside tags, including whitespace and line terminators, except the indentation of lines;
- comments `{* ... *}` and the delimiter directive `{% delimiter ..}`;
- a tag whose body contains a line terminator;
- the wrapper of a wrapped tag and the whitespace between the wrapper and the doubled delimiters;
- string literals, number literals and the characters of an include path;
- a byte order mark at the start of the source.

**FMT-8** The formatter reads tags with the engine delimiters (LEX-22) and follows a `{% delimiter ..}` directive for the tags after it.

## Indentation

**FMT-9** The option `indent` is the indent unit: a run of spaces or one tab, two spaces by default. The formatter sets the indentation of each line to the indent unit repeated by the line's depth. `indent: null` keeps the indentation of every line, so only the whitespace inside tags changes. The option `templateBlocks` is `indent` (default) or `flat`.

```
<div class="board-list">
  <h2>{= t["list.heading"]}</h2>
  {? length(p.props.posts) == 0}
    <p>{= t["list.empty"]}</p>
  {:}
    <ul>
      {@ post = p.props.posts}
        <li><a href="{= post.href}">{= post.title}</a></li>
      {/}
    </ul>
  {/}
</div>
```

**FMT-10** The depth of a line is the number of HTML elements and template blocks that are open where the line starts. A template block is an if, loop or if-block tag up to its close tag.

- A line whose first non-blank text is an HTML end tag, a template close tag `{/}` or a branch tag `{:}` or `{:? }` gets one level less.
- With `templateBlocks: 'flat'` template blocks add no level: their tags and the lines inside them get the depth of the HTML elements alone. With `'indent'` they count like elements.
- A line inside an HTML start tag that spans lines gets one level more than the tag; a line that starts inside a quoted attribute value keeps its indentation.
- Void elements (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`) and start tags that end with `/>` open no element.

**FMT-11** The formatter keeps the indentation of lines that start inside `<pre>`, `<textarea>`, `<script>`, `<style>`, an HTML comment or a tag, including the line of the end tag. It does not read HTML tags inside `<script>`, `<style>` and `<textarea>`. A blank line becomes empty. The text of a line after its indentation does not change; the formatter never moves an element to another line.

**FMT-12** Indentation needs a balanced HTML structure. When an end tag does not match the open element, an element is not closed at the end of the template, or the HTML elements that are open differ between the branches of a template block or between its start and its close tag, the formatter returns the error `html` at the tag where the structure fails and changes nothing. With `indent: null` the structure is not read.

Spaces and tabs at the start of a line are part of the rendered output, except on a line that holds only a block tag, which the renderer removes with its whitespace. Indentation therefore changes the whitespace at the start of rendered lines; browsers do not display it, except inside `<pre>` and `<textarea>`, which the formatter keeps, and inside elements whose CSS `white-space` keeps spaces.

## Safety invariant

**FMT-13** The formatter parses the source, formats each tag from the parser's tag body and tokens, and parses the result again. It returns the result only when both ASTs are equal after every `span` field is removed and, when the indentation changes, after the spaces and tabs at the start of every line of text are removed. Otherwise it returns an error and the caller keeps the source.

**FMT-14** The result of the formatter is the formatted text or an error with `reason`, `code`, `line`, `col` and `message`:

| Reason | Condition | `code`, `line`, `col` |
| --- | --- | --- |
| `parse` | the source does not parse | the parser error |
| `invariant` | the formatted text does not parse or parses to a different AST | `null`, the first change |
| `html` | the HTML structure is not balanced (FMT-12) | `null`, the tag where the structure fails |

`line` and `col` are 1-based; `col` counts bytes as parser errors do (ERR-1). When nothing changes, the text is the source.

**FMT-15** Formatting is idempotent: formatting a formatted text with the same options returns the same text.
