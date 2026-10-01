{* SYNTAX TEST "text.html.polyspec-template" "every tag kind has its own scope"
{= title | upper}
{* <- meta.template.echo.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.echo.polyspec-template keyword.operator.echo.polyspec-template
{* ^^^^^ meta.template.echo.polyspec-template variable.other.readwrite.polyspec-template
{*       ^ meta.template.echo.polyspec-template keyword.operator.pipe.polyspec-template
{*         ^^^^^ meta.template.echo.polyspec-template support.function.filter.polyspec-template
{*              ^ meta.template.echo.polyspec-template punctuation.definition.tag.end.polyspec-template
{= json(state) | raw}
{* <- meta.template.echo.raw.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.echo.raw.polyspec-template keyword.operator.echo.raw.polyspec-template
{* ^^^^ meta.template.echo.raw.polyspec-template entity.name.function.polyspec-template
{*               ^^^ meta.template.echo.raw.polyspec-template support.function.filter.raw.polyspec-template
{? level == 1}
{* <- meta.template.if.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.if.polyspec-template keyword.control.if.polyspec-template
{* ^^^^^ meta.template.if.polyspec-template variable.other.readwrite.polyspec-template
{*       ^^ meta.template.if.polyspec-template keyword.operator.comparison.polyspec-template
{*          ^ meta.template.if.polyspec-template constant.numeric.polyspec-template
{:? level == 2}
{* <- meta.template.elseif.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~-- meta.template.elseif.polyspec-template keyword.control.elseif.polyspec-template
{*  ^^^^^ meta.template.elseif.polyspec-template variable.other.readwrite.polyspec-template
{:}
{* <- meta.template.else.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.else.polyspec-template keyword.control.else.polyspec-template
{*<~~- meta.template.else.polyspec-template punctuation.definition.tag.end.polyspec-template
{/}
{* <- meta.template.end.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.end.polyspec-template keyword.control.end.polyspec-template
{*<~~- meta.template.end.polyspec-template punctuation.definition.tag.end.polyspec-template
{@ row = rows | slice(0, 10)}
{* <- meta.template.loop.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.loop.polyspec-template keyword.control.loop.polyspec-template
{* ^^^ meta.template.loop.polyspec-template variable.other.loop.polyspec-template
{*     ^ meta.template.loop.polyspec-template keyword.operator.assignment.polyspec-template
{*       ^^^^ meta.template.loop.polyspec-template variable.other.readwrite.polyspec-template
{*              ^^^^^ meta.template.loop.polyspec-template support.function.filter.polyspec-template
{*                    ^ meta.template.loop.polyspec-template constant.numeric.polyspec-template
{:total = 0}
{* <- meta.template.assignment.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.assignment.polyspec-template keyword.control.assignment.polyspec-template
{*^^^^^ meta.template.assignment.polyspec-template variable.other.assignment.polyspec-template
{*      ^ meta.template.assignment.polyspec-template keyword.operator.assignment.polyspec-template
{*        ^ meta.template.assignment.polyspec-template constant.numeric.polyspec-template
{:total += item.price}{:i++}
{*      ^^ meta.template.assignment.polyspec-template keyword.operator.assignment.polyspec-template
{*                      ^ meta.template.assignment.polyspec-template variable.other.assignment.polyspec-template
{*                       ^^ meta.template.assignment.polyspec-template keyword.operator.assignment.polyspec-template
{ :total = 0}{@row=rows}
{* <- meta.template.assignment.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*^ meta.template.assignment.polyspec-template keyword.control.assignment.polyspec-template
{* ^^^^^ meta.template.assignment.polyspec-template variable.other.assignment.polyspec-template
{*       ^ meta.template.assignment.polyspec-template keyword.operator.assignment.polyspec-template
{*            ^ meta.template.loop.polyspec-template keyword.control.loop.polyspec-template
{*             ^^^ meta.template.loop.polyspec-template variable.other.loop.polyspec-template
{*                ^ meta.template.loop.polyspec-template keyword.operator.assignment.polyspec-template
{+ parts/head.tpl}{+ 'a b.tpl'}
{* <- meta.template.include.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.include.polyspec-template keyword.control.include.polyspec-template
{* ^^^^^^^^^^^^^^ meta.template.include.polyspec-template string.unquoted.path.polyspec-template
{*                   ^^^^^^^^^ meta.template.include.polyspec-template string.quoted.single.path.polyspec-template
{# head parts/head.tpl title no:item.index_}
{* <- meta.template.block.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.block.polyspec-template keyword.control.block.polyspec-template
{* ^^^^ meta.template.block.polyspec-template entity.name.section.block.polyspec-template
{*      ^^^^^^^^^^^^^^ meta.template.block.polyspec-template string.unquoted.path.polyspec-template
{*                     ^^^^^ meta.template.block.polyspec-template variable.parameter.scope.polyspec-template
{*                           ^^ meta.template.block.polyspec-template variable.parameter.scope.polyspec-template
{*                             ^ meta.template.block.polyspec-template punctuation.separator.key-value.polyspec-template
{*                              ^^^^ meta.template.block.polyspec-template variable.other.loop.polyspec-template
{*                                   ^^^^^^ meta.template.block.polyspec-template variable.language.loop-meta.polyspec-template
{# parts/card.tpl item}
{* ^^^^^^^^^^^^^^ meta.template.block.polyspec-template string.unquoted.path.polyspec-template - entity.name.section.block.polyspec-template
{?# contents}
{* <- meta.template.ifblock.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~-- meta.template.ifblock.polyspec-template keyword.control.ifblock.polyspec-template
{*  ^^^^^^^^ meta.template.ifblock.polyspec-template entity.name.section.block.polyspec-template
{/}
{* note {= not_an_echo} *}
{* <---------------------- comment.block.polyspec-template - meta.template.echo.polyspec-template
{*
multi-line {= x}
{* <---------------- comment.block.polyspec-template - meta.template.echo.polyspec-template
*}
<p>after</p>
{* <- meta.tag.structure.p.start.html - comment.block.polyspec-template
{% delimiter ;;}
{* <- meta.template.directive.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*<~- meta.template.directive.polyspec-template keyword.control.directive.polyspec-template
{* ^^^^^^^^^ meta.template.directive.polyspec-template keyword.control.directive.polyspec-template
{*           ^^ meta.template.directive.polyspec-template constant.other.delimiter.polyspec-template
