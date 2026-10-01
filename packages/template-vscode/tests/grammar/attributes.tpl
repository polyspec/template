{* SYNTAX TEST "text.html.polyspec-template" "tags inside and between HTML attributes"
<tr id="post-{= post.id}"{? post.id == highlight} class="new"{/}>
{*<~- meta.tag.structure.tr.start.html entity.name.tag.html
{*  ^^ meta.tag.structure.tr.start.html entity.other.attribute-name.html
{*      ^^^^^ string.quoted.double.html - meta.template.echo.polyspec-template
{*           ^ string.quoted.double.html meta.template.echo.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*              ^^^^ string.quoted.double.html meta.template.echo.polyspec-template variable.other.readwrite.polyspec-template
{*                   ^^ string.quoted.double.html meta.template.echo.polyspec-template variable.other.property.polyspec-template
{*                     ^ string.quoted.double.html meta.template.echo.polyspec-template punctuation.definition.tag.end.polyspec-template
{*                      ^ string.quoted.double.html punctuation.definition.string.end.html
{*                       ^ meta.tag.structure.tr.start.html meta.template.if.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*                        ^ meta.tag.structure.tr.start.html meta.template.if.polyspec-template keyword.control.if.polyspec-template
{*                                  ^^ meta.template.if.polyspec-template keyword.operator.comparison.polyspec-template
{*                                                ^^^^^ meta.tag.structure.tr.start.html entity.other.attribute-name.html
{*                                                       ^^^ meta.tag.structure.tr.start.html string.quoted.double.html
{*                                                           ^ meta.tag.structure.tr.start.html meta.template.end.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*                                                            ^ meta.tag.structure.tr.start.html meta.template.end.polyspec-template keyword.control.end.polyspec-template
{*                                                              ^ meta.tag.structure.tr.start.html punctuation.definition.tag.end.html
<button class="chip{? sort == 'title'} current{/}" hy-set='sort="title"'>Title</button>
{*                 ^ string.quoted.double.html meta.template.if.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*                            ^^^^^^^ string.quoted.double.html meta.template.if.polyspec-template string.quoted.single.polyspec-template
{*                                    ^^^^^^^^ string.quoted.double.html - meta.template.if.polyspec-template
{*                                            ^^^ string.quoted.double.html meta.template.end.polyspec-template
{*                                                 ^^^^^^ entity.other.attribute-name.html
{*                                                         ^^^^^^^^^^^^^ string.quoted.single.html - meta.template.wrapped.polyspec-template punctuation.definition.tag.begin.polyspec-template
<button hy-set="large={? large}false{:}true{/}">Size</button>
{*                    ^ string.quoted.double.html meta.template.if.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*                       ^^^^^ string.quoted.double.html meta.template.if.polyspec-template variable.other.readwrite.polyspec-template
{*                            ^ string.quoted.double.html meta.template.if.polyspec-template punctuation.definition.tag.end.polyspec-template
{*                             ^^^^^ string.quoted.double.html - meta.template.if.polyspec-template
{*                                  ^^^ string.quoted.double.html meta.template.else.polyspec-template
{*                                     ^^^^ string.quoted.double.html - meta.template.else.polyspec-template
{*                                         ^^^ string.quoted.double.html meta.template.end.polyspec-template
{*                                            ^ string.quoted.double.html punctuation.definition.string.end.html
<a href="/board?page={= n}"{? n == page} class="current"{/}>{= n}</a>
{*                   ^^^^^ string.quoted.double.html meta.template.echo.polyspec-template
{*                         ^ meta.template.if.polyspec-template punctuation.definition.tag.begin.polyspec-template
{*                                       ^^^^^ entity.other.attribute-name.html
{*                                                          ^^^^^ meta.template.echo.polyspec-template
{*                                                               ^^^^ meta.tag.inline.a.end.html
<input value="{{= value}}" data-x='{{= y}}'>
{*           ^ meta.template.wrapped.polyspec-template punctuation.definition.wrapper.begin.polyspec-template
{*              ^ meta.template.wrapped.polyspec-template meta.template.echo.polyspec-template keyword.operator.echo.polyspec-template
{*                       ^ meta.template.wrapped.polyspec-template punctuation.definition.wrapper.end.polyspec-template
{*                                ^ meta.template.wrapped.polyspec-template punctuation.definition.wrapper.begin.polyspec-template
{*                                        ^ meta.template.wrapped.polyspec-template punctuation.definition.wrapper.end.polyspec-template
{*                                         ^ punctuation.definition.tag.end.html
