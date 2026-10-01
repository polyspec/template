{* SYNTAX TEST "text.html.polyspec-template" "CSS, JavaScript and HTML comments keep their highlighting around tags"
<style>
.card { color: {= theme.color}; margin: 0 }
{* <-- source.css entity.other.attribute-name.class.css
{*      ^^^^^ source.css support.type.property-name.css
{*             ^ source.css meta.template.echo.polyspec-template keyword.control.tag.begin.polyspec-template
{*                ^^^^^ source.css meta.template.echo.polyspec-template variable.other.readwrite.polyspec-template
{*                            ^ source.css punctuation.terminator.rule.css
{*                              ^^^^^^ source.css support.type.property-name.css
/* {{= theme.css | raw}} */
{* <-- source.css meta.template.wrapped.polyspec-template punctuation.definition.wrapper.begin.polyspec-template
{*  ^ source.css meta.template.wrapped.polyspec-template meta.template.echo.raw.polyspec-template keyword.control.tag.begin.polyspec-template
{*                       ^^ source.css meta.template.wrapped.polyspec-template punctuation.definition.wrapper.end.polyspec-template
.after { display: none }
{* <------ source.css entity.other.attribute-name.class.css
</style>
<script>
var page = "{{= json(page) | raw}}";
{* <--- source.js storage.type.js
{*         ^ source.js meta.template.wrapped.polyspec-template punctuation.definition.wrapper.begin.polyspec-template
{*              ^^^^ source.js meta.template.echo.raw.polyspec-template entity.name.function.polyspec-template
{*                                ^ source.js meta.template.wrapped.polyspec-template punctuation.definition.wrapper.end.polyspec-template
{*                                 ^ source.js punctuation.terminator.statement.js
const label = "x{= a}y"; if (ready) { start({= n}); }
{* <----- source.js storage.type.js
{*            ^^ source.js string.quoted.double.js
{*              ^ source.js string.quoted.double.js meta.template.echo.polyspec-template keyword.control.tag.begin.polyspec-template
{*                    ^ source.js string.quoted.double.js punctuation.definition.string.end.js
{*                       ^^ source.js keyword.control.conditional.js
{*                                          ^ source.js meta.template.echo.polyspec-template keyword.control.tag.begin.polyspec-template
{*                                               ^ source.js meta.brace.round.js
</script>
<!-- {{# content}} -->
{* <--- meta.template.wrapped.polyspec-template punctuation.definition.wrapper.begin.polyspec-template
{*    ^ meta.template.wrapped.polyspec-template meta.template.block.polyspec-template keyword.control.tag.begin.polyspec-template
{*       ^^^^^^^ meta.template.block.polyspec-template entity.name.type.block.polyspec-template
{*                 ^^^ meta.template.wrapped.polyspec-template punctuation.definition.wrapper.end.polyspec-template
<!-- note {= x} -->
{* <--- comment.block.html punctuation.definition.comment.html
{*        ^ comment.block.html meta.template.echo.polyspec-template keyword.control.tag.begin.polyspec-template
{*              ^^^ comment.block.html punctuation.definition.comment.html
<p class="a">{= text}</p>
{*<~- meta.tag.structure.p.start.html entity.name.tag.html
{* ^^^^^ meta.tag.structure.p.start.html entity.other.attribute-name.html
{*           ^ meta.template.echo.polyspec-template keyword.control.tag.begin.polyspec-template
{*                   ^^ meta.tag.structure.p.end.html punctuation.definition.tag.begin.html
