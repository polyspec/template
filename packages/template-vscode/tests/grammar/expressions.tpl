{* SYNTAX TEST "text.html.polyspec-template" "expression tokens inside tags"
{= "a\n\"b" + 'c' ?? null}
{* ^ meta.template.echo.polyspec-template string.quoted.double.polyspec-template punctuation.definition.string.begin.polyspec-template
{*   ^^ string.quoted.double.polyspec-template constant.character.escape.polyspec-template
{*     ^^ string.quoted.double.polyspec-template constant.character.escape.polyspec-template
{*          ^ keyword.operator.arithmetic.polyspec-template
{*            ^^^ string.quoted.single.polyspec-template
{*                ^^ keyword.operator.coalesce.polyspec-template
{*                   ^^^^ constant.language.polyspec-template
{= 1.5e3 * -x % 2 >= 10 && !done || a != b}
{* ^^^^^ constant.numeric.polyspec-template
{*       ^ keyword.operator.arithmetic.polyspec-template
{*         ^ keyword.operator.arithmetic.polyspec-template
{*            ^ keyword.operator.arithmetic.polyspec-template
{*                ^^ keyword.operator.relational.polyspec-template
{*                      ^^ keyword.operator.logical.polyspec-template
{*                         ^ keyword.operator.logical.polyspec-template
{*                               ^^ keyword.operator.logical.polyspec-template
{*                                    ^^ keyword.operator.comparison.polyspec-template
{= 'k' in m ? a : b ?: c}
{*     ^^ keyword.operator.word.in.polyspec-template
{*          ^ keyword.operator.ternary.polyspec-template
{*              ^ keyword.operator.ternary.polyspec-template
{*                  ^^ keyword.operator.elvis.polyspec-template
{= cart.total(2) + Order::sum(items.0, row.index_, list[i])}
{* ^^^^ variable.other.readwrite.polyspec-template
{*     ^ punctuation.accessor.polyspec-template
{*      ^^^^^ entity.name.function.member.polyspec-template
{*           ^ punctuation.section.parens.begin.polyspec-template
{*                 ^^^^^ entity.name.type.class.polyspec-template
{*                      ^^ punctuation.separator.namespace.polyspec-template
{*                        ^^^ entity.name.function.polyspec-template
{*                                 ^ punctuation.accessor.polyspec-template
{*                                  ^ variable.other.property.polyspec-template
{*                                     ^^^ variable.other.loop.polyspec-template
{*                                         ^^^^^^ variable.language.loop-meta.polyspec-template
{*                                                     ^ punctuation.section.brackets.begin.polyspec-template
{= ['a' => 1, ...rest] | join(', ') | upper}
{* ^ punctuation.section.brackets.begin.polyspec-template
{*      ^^ keyword.operator.key-value.polyspec-template
{*          ^ punctuation.separator.comma.polyspec-template
{*            ^^^ keyword.operator.spread.polyspec-template
{*                     ^ keyword.operator.pipe.polyspec-template
{*                       ^^^^ support.function.filter.polyspec-template
{*                                    ^^^^^ support.function.filter.polyspec-template
{= "}" + x}
{*  ^ string.quoted.double.polyspec-template - keyword.control.tag.end.polyspec-template
{*       ^ meta.template.echo.polyspec-template variable.other.readwrite.polyspec-template
