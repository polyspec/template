# Lexical rules

[한국어](lexical.ko.md).

This document defines how a template source is divided into text, tags and comments, and which whitespace the division removes. Tag bodies are defined in `grammar.md`. Expression tokens are defined in `expressions.md`. Error objects and positions are defined in `errors.md`.

## 1. Source

**LEX-1** A template source is a byte sequence encoded in UTF-8. A byte sequence that is not valid UTF-8 is rejected with `E_LEX_INVALID_UTF8`. The reported position is the first invalid byte.

**LEX-2** A byte order mark (`EF BB BF`) at the start of the source is removed before any other processing. The mark is not text. Byte offsets in positions and AST spans count from the first byte after the mark.

**LEX-3** The line terminators are `\n` and `\r\n`. A `\r\n` pair is one terminator. A terminator inside text is kept in the output exactly as written. Line numbers count terminators from 1.

**LEX-4** A source is a sequence of text segments, tags and comments. Every byte outside a tag and outside a comment is text. Text is output without change, except for the removal defined by LEX-14 and the escape defined by LEX-9.

## 2. Tag start

**LEX-5** A tag starts at a `{` in the sigil form: `{`, then zero or more horizontal whitespace characters (space U+0020 or tab U+0009), then a sigil. The sigils are `=`, `@`, `?#`, `?`, `:?`, `:`, `/`, `+`, `#`, `*` and `%`. A sigil is matched by its longest form: `?#` is matched before `?`, and `:?` is matched before `:`. Two sigils require more context: `/` starts a tag only when it is followed by horizontal whitespace and the close delimiter, and `@` starts a tag only when it is followed by horizontal whitespace, an identifier, horizontal whitespace and `=`. A `{` whose `/` or `@` lacks that context is text.

**LEX-6** A tag starts at a `{` in the assignment form: `{`, then immediately an identifier (`[A-Za-z_][A-Za-z0-9_]*`), then zero or more horizontal whitespace characters, then an assignment operator. The assignment operators are `=` not followed by `=` or `>`, `+=`, `-=`, `*=`, `/=`, `%=`, `++` and `--`. No whitespace is allowed between `{` and the identifier. A reserved word (`true`, `false`, `null`, `in`) matches the identifier pattern, so the tag starts; `grammar.md` then rejects the assignment.

**LEX-7** A `{` that satisfies neither LEX-5 nor LEX-6 is text. A line terminator between `{` and the sigil prevents the sigil form. The following braces are text:

```
{ debug: true }
{}
${name}
{a:1}
{
  color: red;
}
{ x = 1 }
function f() { return 1; }
{/* comment */}
{/re/.test(s)}
.a { @media (max-width: 600px) { color: red } }
```

The following braces start a tag:

```
{= title}
{=title}
{ = title }
{@ item = items}
{? item.index_ == 0}
{:? item.last_}
{:}
{/}
{ /}
{+ parts/head.tpl}
{# footer.tpl year}
{?# contents}
{* note *}
{count = 0}
{count += 1}
{count++}
```

The following braces start a tag whose body is an error. A `\{` escape (LEX-9) keeps them as text:

```
class A { #count = 0 }
{= }
```

**LEX-8** After a tag has started, the tag body must satisfy `grammar.md`. A body that does not satisfy the grammar is an error. A tag is never reinterpreted as text.

## 3. Escape

**LEX-9** The sequence `\{` is an escape only when the `{` would start a tag by LEX-5 or LEX-6. The escape outputs `{` and the following characters are text. At every other position `\{` is two text characters. No other escape exists in text.

```
\{= title}
```

outputs

```
{= title}
```

The sequence `\\{/}` outputs `\{/}`: the first `\` is text, and `\{` is an escape because `{/}` would start a close tag.

## 4. Tag end

**LEX-10** A tag in the sigil form with the sigil `*` is a comment. A comment ends at the first `*}` after the opening `*`. The content between is not interpreted, produces no output and has no node in the AST. A comment does not nest. A comment that does not end before the end of the source is rejected with `E_PARSE_UNTERMINATED_COMMENT`.

```
{* removed *}
{**}
{*
multi-line
*}
```

**LEX-11** Every other tag ends at the first `}` that is outside a string literal of the tag body and that the tag body grammar of `grammar.md` does not accept at that position. With the default delimiters no grammar rule accepts `}`, so the tag ends at the first `}` outside a string literal. With a close delimiter that the grammar uses, for example `]`, a `]` that closes an open `[` belongs to the body and the next `]` ends the tag: `[= a[0]]` is one echo tag. A string literal starts at `'` or `"` and ends at the same unescaped quote character; the escape rules of string literals are defined in `expressions.md`. A tag whose body reaches the end of the source without a closing `}` is rejected with `E_PARSE_UNTERMINATED_TAG`. A string literal that reaches the end of the source is rejected with `E_PARSE_UNTERMINATED_STRING`.

```
{= "}"}
{= 'a' + "b"}
```

**LEX-12** Horizontal whitespace is allowed between the sigil and the body, inside the body where `expressions.md` allows it, and before the closing `}`. The tag `{ /}` and the tag `{/ }` are both close tags.

**LEX-13** A tag with the sigil `=` is an echo tag. Every other tag, including a comment, is a non-echo tag.

## 5. Standalone lines

**LEX-14** A line group is the smallest set of consecutive source lines such that every tag or comment that starts on a line of the group also ends on a line of the group. A line that contains no tag is a line group of one line. A line group is standalone when all of the following hold:

- the group contains at least one tag or comment;
- the group contains no echo tag;
- every byte of the group outside tags and comments is a space, a tab or a line terminator.

For a standalone line group, every byte outside tags and comments is removed from the output, including the line terminator that ends the last line of the group. The tags of the group are processed as usual. The line terminator that ends the line before the group is kept.

```
<ul>
{@ item = items}
  <li>{= item}</li>
{/}
</ul>
```

with `items` equal to `["a", "b"]` outputs

```
<ul>
  <li>a</li>
  <li>b</li>
</ul>
```

An echo tag keeps its line:

```
<p>
{= title}
</p>
```

outputs

```
<p>
Title
</p>
```

Two tags on one line form one standalone group:

```
{@ a = x}{@ b = y}
{= b}
{/}{/}
```

A tag that spans lines forms a group with every line it covers:

```
{*
  note
*}
text
```

outputs

```
text
```

**LEX-15** A tag or comment on a line that is not standalone is replaced by its output, and every other byte of the line is kept.

```
<span>{? on}on{:}off{/}</span>
```

with `on` equal to `true` outputs

```
<span>on</span>
```

## 6. Positions

**LEX-16** A position is a byte offset into the source after the removal in LEX-2. A span is a pair `[start, end)` of byte offsets. A text node covers the bytes it was produced from, before the removal in LEX-14. The line and column of a position are defined in `errors.md`.

## 7. Wrapped tags

**LEX-17** A wrapped tag is a tag whose body is enclosed in a doubled open delimiter and a doubled close delimiter, and which is enclosed in a wrapper pair. The wrapper pairs are `"` and `"`, `'` and `'`, `/*` and `*/`, and `<!--` and `-->`. A wrapped tag has the form: wrapper opener, optional horizontal whitespace, &#123;&#123;, tag body, &#125;&#125;, optional horizontal whitespace, wrapper closer. The tag body is a tag body by LEX-5, LEX-6 and `grammar.md`, where the second `{` takes the role of the `{` in LEX-5 and LEX-6. The whole wrapped tag, including the wrapper, is replaced by the output of the tag. The wrapper is not text.

```
var page = "{{= json(page)}}";
/* {{= theme.css}} */
<!-- {{# content}} -->
```

with `page` equal to `{"id": 7}` outputs, for the first line:

```
var page = {"id":7};
```

**LEX-18** &#123;&#123; starts a wrapped tag only when a wrapper opener precedes it with at most horizontal whitespace between, and the second `{` satisfies LEX-5 or LEX-6. In every other position the first `{` of &#123;&#123; is text by LEX-7, and the second `{` is examined on its own.

```
{{ msg }}
"{{ msg }}"
"{= name}"
```

The first line is text: the first `{` is followed by `{`, and the second `{` is followed by a space and `m`. The second line is text for the same reason. The third line is an echo tag inside a quoted string; the quotes are text and remain in the output.

**LEX-19** The body of a wrapped tag ends at the doubled close delimiter that LEX-11 selects for the body when the doubled close delimiter is read as one closing unit; for a comment, at the first *&#125;&#125;. The &#125;&#125; must be followed by optional horizontal whitespace and the wrapper closer that matches the wrapper opener. A wrapped tag whose body reaches the end of the source is rejected with `E_PARSE_UNTERMINATED_TAG`. A wrapped tag whose &#125;&#125; is not followed by its wrapper closer is rejected with `E_PARSE_INVALID_WRAPPER` at the wrapper opener. For LEX-14, a wrapped tag is one tag and the wrapper bytes belong to it.

## 8. Delimiters

**LEX-20** The open delimiter and the close delimiter are the characters `{` and `}` unless an engine option or a directive selects other characters. Every rule in this document and in `grammar.md` that names `{` applies to the open delimiter, and every rule that names `}` applies to the close delimiter. The doubled forms of LEX-17 are the open delimiter written twice and the close delimiter written twice. The escape of LEX-9 is `\` followed by the open delimiter.

**LEX-21** A delimiter is one ASCII character that is not a letter, a digit, `_`, `\`, a space or a control character. The open delimiter and the close delimiter may be the same character. A close delimiter that the expression grammar uses as an operator or bracket ends a tag only where LEX-11 selects it; an operator that equals the close delimiter cannot be written inside a tag of that file, because LEX-11 ends the tag at its first occurrence that the grammar does not accept.

**LEX-22** The engine option `delimiters` selects the delimiters for every template the engine parses. Its value is a string of two characters: the open delimiter followed by the close delimiter. The default is `{}`.

**LEX-23** A directive tag selects the delimiters for the rest of the file that contains it. Its body is the sigil `%`, the word `delimiter`, and a string of two characters. The directive is written with the delimiters in effect before it. The directive is valid only as the first tag of the file, preceded by whitespace only; a directive at any other position is rejected with `E_PARSE_INVALID_DIRECTIVE`. A directive whose characters do not satisfy LEX-21, or whose body has any other form, is rejected with `E_PARSE_INVALID_DIRECTIVE`. The directive is a non-echo tag, produces no output and has no node in the AST.

```
{% delimiter ;;}
<p>;= title;</p>
;@ item = items;
<li>;= item;</li>
;/;
var page = ";;= json(page);;";
```

with `title` equal to `T`, `items` equal to `["a"]` and `page` equal to `{"id": 7}` outputs

```
<p>T</p>
<li>a</li>
var page = {"id":7};
```
