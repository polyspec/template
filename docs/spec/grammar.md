# Tag grammar

[한국어](grammar.ko.md).

This document defines the body of every tag and the structure of blocks. Tag boundaries are defined in `lexical.md`. Expressions are defined in `expressions.md`. The evaluation of each tag is defined in `runtime.md`. AST nodes are defined in `ast.md`.

## 1. Template

**GRM-1** A template is a sequence of text, tags and comments.

```ebnf
template   = { text | tag | wrapped | comment } ;
tag        = "{" HWS sigil_body HWS "}" | "{" assign HWS "}" ;
wrapped    = wrap_open HWS "{{" HWS sigil_body HWS "}}" HWS wrap_close
           | wrap_open HWS "{{" assign HWS "}}" HWS wrap_close ;
comment    = "{" HWS "*" { any } "*}" ;
wrap_open  = '"' | "'" | "/*" | "<!--" ;
wrap_close = '"' | "'" | "*/" | "-->" ;
HWS        = { " " | "\t" } ;
```

`any` is any byte sequence that does not contain `*}`. A wrapped tag is defined in `lexical.md`; its body follows the same rules as a tag body.

## 2. Tag bodies

**GRM-2** A tag body is one of the following forms. `expression` and `postfix` are defined in `expressions.md`. `IDENT` is `[A-Za-z_][A-Za-z0-9_]*`. `STRING` is a string literal as defined in `expressions.md`.

```ebnf
body       = sigil_body | assign ;
sigil_body = echo | loop | if | elseif | else | close | include | block | ifblock | directive ;
echo       = "=" expression ;
loop       = "@" IDENT HWS "=" expression ;
if         = "?" expression ;
elseif     = ":?" expression ;
else       = ":" ;
close      = "/" ;
include    = "+" path ;
block      = "#" [ IDENT ] [ path ] { scope_item } ;
scope_item = IDENT [ ":" postfix ] ;
ifblock    = "?#" IDENT ;
assign     = IDENT HWS ( "=" expression
                       | ( "+=" | "-=" | "*=" | "/=" | "%=" ) expression
                       | "++" | "--" ) ;
directive  = "%" HWS "delimiter" HWS DELIMS ;
path       = STRING | BARE_PATH ;
BARE_PATH  = { "A".."Z" | "a".."z" | "0".."9" | "_" | "." | "/" | "-" } ;
DELIMS     = DELIM DELIM ;
```

`DELIM` is one character allowed as a delimiter by `lexical.md`.

**GRM-3** A `BARE_PATH` contains no whitespace, consists only of the characters listed in GRM-2, and contains at least one `.` or one `/`. A token in a path position that is neither a `STRING` nor a `BARE_PATH` is rejected with `E_PARSE_INVALID_PATH`.

```
{+ parts/head.tpl}
{+ ../footer.tpl}
{+ "notes"}
{+ 'a b.tpl'}
{+ notes}
```

The last tag is rejected with `E_PARSE_INVALID_PATH` because `notes` contains neither `.` nor `/`.

**GRM-4** A path is resolved against the directory of the template that contains the tag. A path that starts with `/` is resolved against the loader root. The segments `.` and `..` are normalized. A path whose normalized form leaves the loader root is rejected with `E_LOAD_OUTSIDE_ROOT`. Resolution is defined in `runtime.md`.

**GRM-5** In the sigil forms, whitespace between the sigil and the first token of the body is optional. In the assignment form, the identifier follows `{` without whitespace, as defined in `lexical.md`.

## 3. Echo

**GRM-6** An echo tag is `=` followed by one expression. The value of the expression is output as defined in `runtime.md`.

```
{= title}
{= item.price | number}
{= json(state) | raw}
```

## 4. Loop

**GRM-7** A loop tag is `@`, an identifier, `=` and one expression. The identifier is the loop variable. A reserved word (`true`, `false`, `null`, `in`) as the loop variable is rejected with `E_PARSE_RESERVED_NAME`. A loop tag opens a block.

```
{@ item = items}
{@ row = rows | slice(0, 10)}
```

**GRM-8** Inside a loop block, at most one `{:}` tag at the top level of the block starts the empty branch. The empty branch is evaluated when the loop body runs zero times, as defined in `runtime.md`.

```
{@ item = items}
<li>{= item}</li>
{:}
<li>none</li>
{/}
```

## 5. Conditional

**GRM-9** An if tag is `?` followed by one expression. An if tag opens a block.

**GRM-10** Inside an if block, zero or more `{:? expression}` tags at the top level of the block start further branches, and at most one `{:}` tag starts the else branch. The tags are ordered: every `{:?}` tag comes before the `{:}` tag.

```
{? level == 1}
one
{:? level == 2}
two
{:}
other
{/}
```

## 6. Close

**GRM-11** The close tag `{/}` closes the innermost open block. The close tag has no body after `/`.

## 7. Include

**GRM-12** An include tag is `+` followed by one path. The template at the path is rendered at the position of the tag with the scope of the including template, as defined in `runtime.md`.

```
{+ parts/head.tpl}
```

## 8. Block

**GRM-13** A block tag is `#` followed by, in this order: an optional block identifier, an optional path, and zero or more scope items. The first token decides its role: an `IDENT` is the block identifier; a `STRING` or `BARE_PATH` is the path. When the first token is the block identifier, the second token may be the path. Every following token is a scope item.

**GRM-14** A scope item is `IDENT` or `IDENT:postfix`. The form `IDENT` is equivalent to `IDENT:IDENT`. The `postfix` is a postfix expression as defined in `expressions.md` and contains no whitespace. The identifier is the name visible inside the block; the postfix is the value.

**GRM-15** A block tag with two paths, a scope item without an identifier, or any other token order is rejected with `E_PARSE_INVALID_BLOCK_TAG`.

The following block tags are valid:

```
{# contents}
{# contents menus}
{# head parts/head.tpl}
{# head "parts/head.tpl" title}
{# parts/card.tpl item no:item.index_}
{# ../footer.tpl year:date(now(), "Y") links}
```

Their meanings are, in order: render the registered definition `contents`; render the registered definition `contents` with `menus` bound to `menus`; register `head` as `parts/head.tpl` and render it; the same with `title` bound to `title`; render `parts/card.tpl` with `item` bound to `item` and `no` bound to `item.index_`; render `../footer.tpl` with `year` bound to the call result and `links` bound to `links`. Registration and rendering are defined in `runtime.md`.

The following block tags are rejected with `E_PARSE_INVALID_BLOCK_TAG`:

```
{# a.tpl b.tpl}
{# :item}
{#}
```

## 9. If-block

**GRM-16** An if-block tag is `?#` followed by one identifier. An if-block tag opens a block. Inside an if-block, at most one `{:}` tag at the top level of the block starts the else branch; a `{:?}` tag is rejected with `E_PARSE_ELSEIF_NOT_IN_IF`. The block body is evaluated when a block with the identifier is registered, as defined in `runtime.md`.

```
{?# contents}
<main>{# contents}</main>
{:}
<main class="empty"></main>
{/}
```

## 10. Assignment

**GRM-17** An assignment tag is an identifier followed by `=` and one expression, by one of `+=`, `-=`, `*=`, `/=`, `%=` and one expression, or by `++` or `--`. A reserved word as the identifier is rejected with `E_PARSE_RESERVED_NAME`. The forms are equivalent to the following assignments:

```
{n += e}   is   {n = n + e}
{n -= e}   is   {n = n - e}
{n *= e}   is   {n = n * e}
{n /= e}   is   {n = n / e}
{n %= e}   is   {n = n % e}
{n++}      is   {n = n + 1}
{n--}      is   {n = n - 1}
```

The AST contains only the expanded form, as defined in `ast.md`.

```
{total = 0}
{total += item.price}
{i++}
```

## 11. Directive

**GRM-24** A directive tag is `%`, the word `delimiter` and two delimiter characters. Its position, effect and errors are defined in `lexical.md`. A directive tag has no node in the AST.

```
{% delimiter ;;}
{% delimiter [] }
```

## 12. Block structure

**GRM-18** The tags loop, if and if-block open a block. The tag `{/}` closes the innermost open block. Blocks nest. A `{/}` tag while no block is open is rejected with `E_PARSE_UNEXPECTED_CLOSE`.

**GRM-19** A block that is still open at the end of the source is rejected with `E_PARSE_UNCLOSED_BLOCK`. The reported position is the opening tag.

**GRM-20** Blocks balance within one source. An included template cannot open a block that the including template closes, and cannot close a block that the including template opened.

**GRM-21** A `{:? expression}` tag outside every block is rejected with `E_PARSE_ELSE_OUTSIDE_BLOCK`. A `{:? expression}` tag whose innermost open block is a loop or an if-block is rejected with `E_PARSE_ELSEIF_NOT_IN_IF`.

**GRM-22** A `{:}` tag outside every block is rejected with `E_PARSE_ELSE_OUTSIDE_BLOCK`. A second `{:}` tag in the same block is rejected with `E_PARSE_DUPLICATE_ELSE`. A `{:?}` tag after the `{:}` tag of the same block is rejected with `E_PARSE_ELSEIF_AFTER_ELSE`.

**GRM-23** A tag body that satisfies none of the forms in GRM-2 is rejected with `E_PARSE_UNEXPECTED_TOKEN`. The reported position is the first token that does not match.

The following source is rejected with `E_PARSE_UNCLOSED_BLOCK` at line 1:

```
{? a}
<p>a</p>
```

The following source is rejected with `E_PARSE_ELSEIF_NOT_IN_IF` at line 2:

```
{@ item = items}
{:? item}
{/}
```
