# @polyspec/template-lsp

[한국어](README.ko.md).

Language Server Protocol server for template sources over standard input and output. It converts the results of `openDocument()` of `@polyspec/template-language` to protocol positions and contains no template rule.

```sh
template-lsp --stdio
```

The server provides published diagnostics, semantic tokens, folding ranges, document highlights, document and range formatting, on-type indentation after `\n`, `>` and `}`, and the requests `polyspec-template/tagRanges` and `polyspec-template/matchingTag`. It reads the setting `polyspec-template.format.templateBlocks` (`indent` or `flat`) with `workspace/configuration`.

The package entry exports the method names and the parameter and result types of the custom requests for clients:

```ts
import { MATCHING_TAG_METHOD, TAG_RANGES_METHOD, type MatchingTagParams } from '@polyspec/template-lsp';
```

The capabilities and the request shapes are defined in [editor support](../../docs/spec/editor.md) (EDT-14); the command and its verification are described in [Formatter, language server and editors](../../docs/operations/editor-tools.md).
