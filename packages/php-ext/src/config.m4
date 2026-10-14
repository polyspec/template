PHP_ARG_ENABLE([polyspec-template], [whether to enable polyspec_template],
  [AS_HELP_STRING([--enable-polyspec-template], [Enable the polyspec_template native template engine])], [yes])

if test "$PHP_POLYSPEC_TEMPLATE" != "no"; then
  PHP_NEW_EXTENSION([polyspec_template], [polyspec_template.c pt_core.c pt_parse.c pt_ast.c pt_json.c pt_functions.c pt_bind.c pt_render.c], [$ext_shared])
  PHP_ADD_EXTENSION_DEP([polyspec_template], [json])
  PHP_ADD_EXTENSION_DEP([polyspec_template], [spl])
fi
