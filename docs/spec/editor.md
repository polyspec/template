<!-- doc-id: docs-spec-editor -->
# Editor support

[한국어](/ko/spec/editor).

This document defines how editors support templates. A single language service holds every editor rule, and each editor reaches it through a thin adapter. The formatting style and the indentation rule are in [formatting](formatting.md); this document refers to them.

## Layers

Editor rules are defined in [the editor tools document](../operations/editor-tools.md), except the tokens and tags rules below.

- **EDT-8** `tokens` classifies the template part of the text, sorted by position and not overlapping. Text outside tags has no tokens; adapters highlight it as HTML.

| Type | Text |
| --- | --- |
| `delimiter` | open and close delimiters of a tag, including the wrapper of a wrapped tag |
| `keyword` | sigils (`=`, `?`, `:?`, `:`, `@`, `/`, `+`, `#`, `?#`, `%`), `true`, `false`, `null`, `in` and the word `delimiter` of a directive |
| `variable` | a name that is not followed by `(` and not preceded by `.` |
| `property` | a name or index after `.` that is not followed by `(` |
| `function` | a name followed by `(`, and the function after a pipe |
| `string` | string literals, quoted paths and the value of a delimiter directive |
| `number` | number literals |
| `operator` | operators and punctuation inside a tag |
| `comment` | a template comment `{* *}` |
| `path` | an unquoted include path and the unquoted words of a block tag body |

- **EDT-9** `tags` lists the range of every accepted tag except comments. Editors paint these ranges with the tag background: `#16351c` in dark themes and `#e3f6dd` in light themes.
