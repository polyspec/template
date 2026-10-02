# Polyspec Template for VS Code

[한국어](README.ko.md).

Language support for `.tpl` template files:

- syntax highlighting of template tags in HTML text, attribute values, CSS, JavaScript and HTML comments, with HTML, CSS and JavaScript highlighting kept around the tags;
- a scope for each tag kind and for the tokens of expressions;
- comment toggling with `{* *}` and bracket pairs for the delimiters;
- parse diagnostics at the parser position, highlights of the tags of one block construct, folding of multi-line constructs and the command Go to Matching Template Tag (`Cmd+Alt+\` on macOS, `Ctrl+Alt+\` on Windows and Linux), all computed by the template parser;
- document and range formatting with `@polyspec/template-format`, which changes whitespace inside tags and the indentation of lines with the editor indent unit, and returns no edits when the formatted AST would differ from the source AST or the HTML structure is not balanced. The setting `polyspec-template.format.templateBlocks` (`indent` or `flat`) sets whether template blocks add an indentation level.

## Workspace trust

The extension declares full support for untrusted and virtual workspaces. It only reads the text of open documents and runs no code, task or tool of the workspace, so Restricted Mode needs no limit. Without this declaration VS Code disables the extension, including the grammar, in an untrusted folder.

## Limits

The extension checks only the template tags. It does not check that HTML elements are balanced across template branches, for example a `<div>` opened in `{? a}` and closed after `{/}`; HTML structure is left to the HTML features of VS Code.

## Build and install

```sh
make vscode-package
make vscode-install
```

The grammar uses the default delimiters `{` and `}`. Scopes, formatting rules and limits are described in [Formatter and VS Code extension](https://github.com/polyspec/template/blob/main/docs/operations/editor-tools.md).
