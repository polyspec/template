{* SYNTAX TEST "text.html.polyspec-template" "braces that do not start a tag stay text"
<p>{ debug: true } {} ${name} {{ msg }} {/* comment */} { x = 1 } {@media}</p>
{*  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ - keyword.control.tag.begin.polyspec-template meta.template.echo.polyspec-template meta.template.else.polyspec-template meta.template.end.polyspec-template meta.template.loop.polyspec-template
\{= title} \\{/}
{* <- constant.character.escape.polyspec-template
{*^^^^^^^^ - keyword.control.tag.begin.polyspec-template
{*         ^ - constant.character.escape.polyspec-template
{*          ^^ constant.character.escape.polyspec-template
{*            ^^ - meta.template.end.polyspec-template
"{= name}" "{{ msg }}"
{* <- - meta.template.wrapped.polyspec-template
{*<~- meta.template.echo.polyspec-template keyword.control.tag.begin.polyspec-template
{*          ^^^^^^^^^ - meta.template.wrapped.polyspec-template keyword.control.tag.begin.polyspec-template
