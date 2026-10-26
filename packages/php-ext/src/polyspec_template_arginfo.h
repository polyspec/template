/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: 05aa61b7c9b7b23be260d02b0cc6af032dc42715 */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Loader_LoaderInterface_load, 0, 1, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Loader_ArrayLoader___construct, 0, 0, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, sources, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Loader_ArrayLoader_set, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_MASK(0, value, MAY_BE_STRING|MAY_BE_ARRAY, NULL)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Loader_ArrayLoader_load arginfo_class_Polyspec_Template_Loader_LoaderInterface_load

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Loader_FilesystemLoader___construct, 0, 0, 1)
	ZEND_ARG_TYPE_INFO(0, root, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Loader_FilesystemLoader_load arginfo_class_Polyspec_Template_Loader_LoaderInterface_load

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Loader_Path_resolve, 0, 2, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, current, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, path, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeServices_limits, 0, 0, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeServices_hostFunction, 0, 1, IS_CALLABLE, 1)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeServices_classFunction, 0, 2, IS_CALLABLE, 1)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeEnvironment___construct, 0, 0, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, limits, IS_ARRAY, 0, "[]")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, hostFunctions, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_register, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_limits arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_hostFunction arginfo_class_Polyspec_Template_Render_RuntimeServices_hostFunction

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_registerClass, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_classFunction arginfo_class_Polyspec_Template_Render_RuntimeServices_classFunction

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Render_Frame___construct, 0, 0, 3)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, lines, IS_ARRAY, 1)
	ZEND_ARG_OBJ_INFO(0, context, Polyspec\\Template\\Value\\MapValue, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Render_Scope___construct, 0, 0, 0)
	ZEND_ARG_OBJ_INFO_WITH_DEFAULT_VALUE(0, locals, Polyspec\\Template\\Value\\MapValue, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Scope_lookup, 0, 2, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Render_Scope_loopMeta arginfo_class_Polyspec_Template_Loader_LoaderInterface_load

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Render_Context___construct, 0, 0, 4)
	ZEND_ARG_OBJ_INFO(0, services, Polyspec\\Template\\Render\\RuntimeServices, 0)
	ZEND_ARG_OBJ_INFO(0, rootData, Polyspec\\Template\\Value\\MapValue, 0)
	ZEND_ARG_TYPE_INFO(0, env, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, entryName, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Context_write, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Context_output, 0, 0, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Context_at, 0, 2, IS_VOID, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Render_Context_fail, 0, 4, Polyspec\\Template\\TemplateError, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 1)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Context_enter, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 1)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Context_leave, 0, 0, IS_VOID, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings___construct, 0, 0, 1)
	ZEND_ARG_OBJ_INFO(0, context, Polyspec\\Template\\Render\\Context, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_truthy, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_unary, 0, 4, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, operator, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, operand, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_binary, 0, 5, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, operator, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, left, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, right, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_stringify, 0, 3, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Render_RuntimeBindings_escape arginfo_class_Polyspec_Template_Render_RuntimeBindings_stringify

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_number, 0, 3, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_finite, 0, 3, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_equal, 0, 3, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, left, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, right, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, strict, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_compare, 0, 4, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, left, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, right, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_member, 0, 4, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, container, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_memberCall, 0, 5, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, container, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, args, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_classCall, 0, 5, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, args, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_index, 0, 4, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, container, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_depth, 0, 3, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_entries, 0, 3, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Render_RuntimeBindings_listSpread arginfo_class_Polyspec_Template_Render_RuntimeBindings_entries

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_mapSpread, 0, 3, Polyspec\\Template\\Value\\MapValue, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_call, 0, 4, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, args, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_limit, 0, 4, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, kind, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, count, IS_LONG, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Render_RuntimeBindings_error, 0, 4, Polyspec\\Template\\TemplateError, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Render_Evaluator___construct arginfo_class_Polyspec_Template_Render_RuntimeBindings___construct

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Evaluator_evaluate, 0, 2, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, expr, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_OBJ_INFO_WITH_DEFAULT_VALUE(0, scope, Polyspec\\Template\\Render\\Scope, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Render_Renderer___construct, 0, 0, 2)
	ZEND_ARG_OBJ_INFO(0, context, Polyspec\\Template\\Render\\Context, 0)
	ZEND_ARG_OBJ_INFO(0, program, Polyspec\\Template\\AstProgram, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Render_Renderer_renderNodes, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, nodes, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, frame, Polyspec\\Template\\Render\\Frame, 0)
	ZEND_ARG_OBJ_INFO(0, scope, Polyspec\\Template\\Render\\Scope, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_TemplateError___construct, 0, 0, 7)
	ZEND_ARG_TYPE_INFO(0, errorCode, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, errorLine, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, errorCol, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, end, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_TemplateError_at, 0, 6, Polyspec\\Template\\TemplateError, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, lines, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, start, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, end, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_TemplateError_withoutPosition, 0, 3, Polyspec\\Template\\TemplateError, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_TemplateError_toArray arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_AstDecodeError___construct, 0, 0, 2)
	ZEND_ARG_TYPE_INFO(0, path, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, reason, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstDecoder_decode, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, json, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Program_prepare, 0, 1, Polyspec\\Template\\PreparedRender, 0)
	ZEND_ARG_TYPE_MASK(0, target, MAY_BE_STRING|MAY_BE_ARRAY, NULL)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, assign, IS_MIXED, 0, "[]")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Program_render, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_MASK(0, target, MAY_BE_STRING|MAY_BE_ARRAY, NULL)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, assign, IS_MIXED, 0, "[]")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_PreparedRender___construct, 0, 0, 2)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, execution, Polyspec\\Template\\PreparedExecution, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_PreparedRender_render arginfo_class_Polyspec_Template_Render_Context_output

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Engine___construct, 0, 0, 1)
	ZEND_ARG_OBJ_INFO(0, program, Polyspec\\Template\\Program, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Engine_prepare arginfo_class_Polyspec_Template_Program_prepare

#define arginfo_class_Polyspec_Template_Engine_render arginfo_class_Polyspec_Template_Program_render

#define arginfo_class_Polyspec_Template_PreparedExecution_render arginfo_class_Polyspec_Template_Render_Context_output

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_AstPreparedExecution___construct, 0, 0, 6)
	ZEND_ARG_OBJ_INFO(0, engine, Polyspec\\Template\\AstProgram, 0)
	ZEND_ARG_OBJ_INFO(0, rootData, Polyspec\\Template\\Value\\MapValue, 0)
	ZEND_ARG_TYPE_INFO(0, registry, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, env, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, targetName, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstPreparedExecution_render arginfo_class_Polyspec_Template_Render_Context_output

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_AstProgram___construct, 0, 0, 0)
	ZEND_ARG_OBJ_INFO_WITH_DEFAULT_VALUE(0, loader, Polyspec\\Template\\Loader\\LoaderInterface, 1, "null")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstProgram_decodeTemplate arginfo_class_Polyspec_Template_AstDecoder_decode

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_loadArtifact, 0, 1, Polyspec\\Template\\AstProgram, 0)
	ZEND_ARG_TYPE_INFO(0, directory, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_loadOrRefresh, 0, 3, Polyspec\\Template\\AstProgram, 0)
	ZEND_ARG_TYPE_INFO(0, directory, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, refresh, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, build, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_parse, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstProgram_analyze arginfo_class_Polyspec_Template_AstProgram_parse

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_register, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, fn, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_registerClass, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, fn, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstProgram_hostFunction arginfo_class_Polyspec_Template_Render_RuntimeServices_hostFunction

#define arginfo_class_Polyspec_Template_AstProgram_classFunction arginfo_class_Polyspec_Template_Render_RuntimeServices_classFunction

#define arginfo_class_Polyspec_Template_AstProgram_limits arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_loadTemplate, 0, 3, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, from, Polyspec\\Template\\Render\\Frame, 1)
	ZEND_ARG_TYPE_INFO(0, span, IS_ARRAY, 1)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstProgram_prepare arginfo_class_Polyspec_Template_Program_prepare

#define arginfo_class_Polyspec_Template_AstProgram_render arginfo_class_Polyspec_Template_Program_render

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_BoundMap___construct, 0, 0, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_BoundMap___clone arginfo_class_Polyspec_Template_Render_Context_leave

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_BoundMap___unserialize, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_BoundMap_bind, 0, 1, Polyspec\\Template\\BoundMap, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_BoundMap_merge, 0, 2, Polyspec\\Template\\BoundMap, 0)
	ZEND_ARG_TYPE_INFO(0, first, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, second, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_PageCache___construct, 0, 0, 0)
	ZEND_ARG_OBJ_INFO_WITH_DEFAULT_VALUE(0, clock, Closure, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_PageCache_get, 0, 1, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_PageCache_set, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, html, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, ttl, IS_DOUBLE, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_PageCache_getOrSet, 0, 3, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, ttl, IS_DOUBLE, 1)
	ZEND_ARG_OBJ_INFO(0, render, Closure, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_PageCache_delete, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_PageCache_clear arginfo_class_Polyspec_Template_Render_Context_leave

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Source___construct, 0, 0, 2)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Source_fromBytes, 0, 2, Polyspec\\Template\\Source, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, bytes, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Source_lineIndex, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Source_position, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, lines, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Source_length, 0, 0, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Utf8_isValid, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, bytes, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Utf8_firstInvalid, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, bytes, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Utf8_chr, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Utf8_codePoints arginfo_class_Polyspec_Template_Source_lineIndex

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Utf8_length, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Escape_html, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_InternalBoundary_run, 0, 2, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
	ZEND_ARG_OBJ_INFO(0, operation, Closure, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Value_SafeString___construct, 0, 0, 1)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Value_BindError___construct, 0, 0, 2)
	ZEND_ARG_TYPE_INFO(0, errorCode, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_MapValue_set, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_MapValue_has, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_MapValue_get, 0, 1, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, key, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_MapValue_remove arginfo_class_Polyspec_Template_PageCache_delete

#define arginfo_class_Polyspec_Template_Value_MapValue_count arginfo_class_Polyspec_Template_Source_length

#define arginfo_class_Polyspec_Template_Value_MapValue_keys arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Value_MapValue_values arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Value_MapValue_entries arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Value_MapValue_copy, 0, 0, Polyspec\\Template\\Value\\MapValue, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Bind_value, 0, 1, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, input, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Bind_checkFloat, 0, 1, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Bind_checkLevel, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, level, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Bind_depthWithin, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, limit, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Bind_publicProperties, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, object, IS_OBJECT, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Value_Bind_map, 0, 1, Polyspec\\Template\\Value\\MapValue, 0)
	ZEND_ARG_TYPE_INFO(0, input, IS_MIXED, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_Bind_data arginfo_class_Polyspec_Template_Value_Bind_value

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Json_parse, 0, 1, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, bytes, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_typeOf, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_Value_isString arginfo_class_Polyspec_Template_Render_RuntimeBindings_truthy

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_textOf, 0, 1, IS_STRING, 0)
	ZEND_ARG_OBJ_TYPE_MASK(0, value, Polyspec\\Template\\Value\\SafeString, MAY_BE_STRING, NULL)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_Value_isNumber arginfo_class_Polyspec_Template_Render_RuntimeBindings_truthy

#define arginfo_class_Polyspec_Template_Value_Value_isTruthy arginfo_class_Polyspec_Template_Render_RuntimeBindings_truthy

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_stringify, 0, 1, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_parseNumericString, 0, 1, IS_DOUBLE, 1)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_compareCodePoints, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, a, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, b, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_looseEquals, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, a, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, b, IS_MIXED, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_Value_strictEquals arginfo_class_Polyspec_Template_Value_Value_looseEquals

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Value_compare, 0, 2, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(0, a, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, b, IS_MIXED, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_Value_isCollection arginfo_class_Polyspec_Template_Render_RuntimeBindings_truthy

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Number_toText, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Number_shortestDigits, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Value_Number_positional arginfo_class_Polyspec_Template_Value_Number_shortestDigits

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Number_roundDecimal, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, decimals, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Number_format, 0, 4, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, decimals, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, dec, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, thousands, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Number_round, 0, 2, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, decimals, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_Number_isInteger, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_DOUBLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_HostArgument_of, 0, 1, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Value_HostArgument_list, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, args, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Functions_FunctionError___construct arginfo_class_Polyspec_Template_Value_BindError___construct

#define arginfo_class_Polyspec_Template_Functions_FunctionGroup_table arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Functions_Helpers_typeError, 0, 1, Polyspec\\Template\\Functions\\FunctionError, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Helpers_string, 0, 2, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Helpers_list, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Helpers_toNumber, 0, 1, IS_DOUBLE, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Functions_Helpers_number arginfo_class_Polyspec_Template_Functions_Helpers_toNumber

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Helpers_integer, 0, 1, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Functions_Helpers_stringify arginfo_class_Polyspec_Template_Value_Value_typeOf

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Functions_Helpers_safe, 0, 1, Polyspec\\Template\\Value\\SafeString, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Functions_Strings_table arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Functions_Numbers_table arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Functions_Encoding_toJson arginfo_class_Polyspec_Template_Value_Value_typeOf

#define arginfo_class_Polyspec_Template_Functions_Encoding_percentEncode arginfo_class_Polyspec_Template_Escape_html

#define arginfo_class_Polyspec_Template_Functions_Encoding_table arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Functions_Collection_table arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Dates_parseOffset, 0, 1, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Dates_daysFromCivil, 0, 3, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, year, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, month, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, day, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Dates_civilFromDays, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, days, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Dates_toUnixSeconds, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, envOffset, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Dates_format, 0, 3, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, seconds, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, format, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, offset, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Functions_Dates_table arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Functions_Registry_builtins arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Functions_Registry_isBuiltin, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Format_FormatError___construct, 0, 0, 5)
	ZEND_ARG_TYPE_INFO(0, reason, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, line, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, col, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Format_FormatError_toArray arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Format_FormatResult___construct, 0, 0, 3)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, changed, _IS_BOOL, 0)
	ZEND_ARG_OBJ_INFO(0, error, Polyspec\\Template\\Format\\FormatError, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Format_FormatResult_text, 0, 2, Polyspec\\Template\\Format\\FormatResult, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, changed, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Format_FormatResult_error, 0, 1, Polyspec\\Template\\Format\\FormatResult, 0)
	ZEND_ARG_OBJ_INFO(0, error, Polyspec\\Template\\Format\\FormatError, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Format_Expression_join, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, tokens, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Format_Invariant_withoutSpans arginfo_class_Polyspec_Template_Value_HostArgument_of

#define arginfo_class_Polyspec_Template_Format_Invariant_withoutLineIndentation arginfo_class_Polyspec_Template_Value_HostArgument_of

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Format_Invariant_sameTree, 0, 2, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, left, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, right, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Format_Indent___construct, 0, 0, 3)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, tags, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, counted, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Format_Indent_edits, 0, 5, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, tags, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, unit, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, templateBlocks, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, range, IS_ARRAY, 1)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Format_Analyzer_analyze, 0, 3, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, options, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Format_Analyzer_parse arginfo_class_Polyspec_Template_Format_Analyzer_analyze

#define arginfo_class_Polyspec_Template_Format_PackageAnalyzer_analyze arginfo_class_Polyspec_Template_Format_Analyzer_analyze

#define arginfo_class_Polyspec_Template_Format_PackageAnalyzer_parse arginfo_class_Polyspec_Template_Format_Analyzer_analyze

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Format_Body_format, 0, 5, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, kind, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, bodyStart, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, bodyEnd, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, tokens, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Format_Formatter_format, 0, 1, Polyspec\\Template\\Format\\FormatResult, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
	ZEND_ARG_OBJ_INFO_WITH_DEFAULT_VALUE(0, analyzer, Polyspec\\Template\\Format\\Analyzer, 0, "new Polyspec\\Template\\Format\\PackageAnalyzer()")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Expr_Token___construct, 0, 0, 4)
	ZEND_ARG_TYPE_INFO(0, type, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, start, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, end, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, decoded, IS_STRING, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Expr_Lexer___construct, 0, 0, 6)
	ZEND_ARG_OBJ_INFO(0, source, Polyspec\\Template\\Source, 0)
	ZEND_ARG_TYPE_INFO(0, start, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, close, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, closeCount, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, openIndex, IS_LONG, 1)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Expr_Lexer_error, 0, 4, Polyspec\\Template\\TemplateError, 0)
	ZEND_ARG_TYPE_INFO(0, code, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, start, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, end, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Expr_Lexer_peek, 0, 0, Polyspec\\Template\\Expr\\Token, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Expr_Lexer_next arginfo_class_Polyspec_Template_Expr_Lexer_peek

#define arginfo_class_Polyspec_Template_Expr_Lexer_consumed arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

#define arginfo_class_Polyspec_Template_Expr_Lexer_consumedEnd arginfo_class_Polyspec_Template_Source_length

#define arginfo_class_Polyspec_Template_Expr_Lexer_text arginfo_class_Polyspec_Template_Render_Context_output

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Expr_Lexer_stringLiteral, 0, 3, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, source, Polyspec\\Template\\Source, 0)
	ZEND_ARG_TYPE_INFO(0, start, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Expr_Parser___construct arginfo_class_Polyspec_Template_Expr_Lexer___construct

#define arginfo_class_Polyspec_Template_Expr_Parser_peek arginfo_class_Polyspec_Template_Expr_Lexer_peek

#define arginfo_class_Polyspec_Template_Expr_Parser_next arginfo_class_Polyspec_Template_Expr_Lexer_peek

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Expr_Parser_unexpected, 0, 1, Polyspec\\Template\\TemplateError, 0)
	ZEND_ARG_OBJ_INFO(0, token, Polyspec\\Template\\Expr\\Token, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Expr_Parser_expect, 0, 1, Polyspec\\Template\\Expr\\Token, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Expr_Parser_expectClose arginfo_class_Polyspec_Template_Source_length

#define arginfo_class_Polyspec_Template_Expr_Parser_parseExpression arginfo_class_Polyspec_Template_Render_RuntimeServices_limits

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Expr_Parser_parsePostfix, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, adjacentOnly, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Ast_isLoopMetaField arginfo_class_Polyspec_Template_Functions_Registry_isBuiltin

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Ast_node, 0, 4, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, type, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, fields, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, start, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, end, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Ast_toJson, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, node, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Scanner_skipHorizontalSpace, 0, 2, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Scanner_isHorizontalSpace, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, char, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Scanner_sigilAfter, 0, 2, IS_STRING, 1)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, open, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Scanner_startsTag, 0, 3, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, open, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, close, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Scanner_wrappedTagAt, 0, 4, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
	ZEND_ARG_TYPE_INFO(0, open, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, close, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Parser_Scanner_isDelimiterChar arginfo_class_Polyspec_Template_Parser_Scanner_isHorizontalSpace

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Scanner_parseDelimiters, 0, 1, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, value, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Standalone_ranges, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, tags, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Parser_Parser___construct, 0, 0, 1)
	ZEND_ARG_OBJ_INFO(0, source, Polyspec\\Template\\Source, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, open, IS_STRING, 0, "\'{\'")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, close, IS_STRING, 0, "\'}\'")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_Parser_parse, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_OBJ_INFO(0, source, Polyspec\\Template\\Source, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, open, IS_STRING, 0, "\'{\'")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, close, IS_STRING, 0, "\'}\'")
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Parser_Parser_analyze arginfo_class_Polyspec_Template_Parser_Parser_parse

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Parser_BlockTag___construct, 0, 0, 4)
	ZEND_ARG_OBJ_INFO(0, source, Polyspec\\Template\\Source, 0)
	ZEND_ARG_TYPE_INFO(0, template, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, close, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, closeCount, IS_LONG, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Parser_BlockTag_readIncludePath, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, index, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Parser_BlockTag_readBlockBody arginfo_class_Polyspec_Template_Parser_BlockTag_readIncludePath

ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, __construct);
ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, set);
ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, load);
ZEND_METHOD(Polyspec_Template_Loader_FilesystemLoader, __construct);
ZEND_METHOD(Polyspec_Template_Loader_FilesystemLoader, load);
ZEND_METHOD(Polyspec_Template_Loader_Path, resolve);
ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, __construct);
ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, register);
ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, limits);
ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, hostFunction);
ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, registerClass);
ZEND_METHOD(Polyspec_Template_Render_RuntimeEnvironment, classFunction);
ZEND_METHOD(Polyspec_Template_Render_Frame, __construct);
ZEND_METHOD(Polyspec_Template_Render_Scope, __construct);
ZEND_METHOD(Polyspec_Template_Render_Scope, lookup);
ZEND_METHOD(Polyspec_Template_Render_Scope, loopMeta);
ZEND_METHOD(Polyspec_Template_Render_Context, __construct);
ZEND_METHOD(Polyspec_Template_Render_Context, write);
ZEND_METHOD(Polyspec_Template_Render_Context, output);
ZEND_METHOD(Polyspec_Template_Render_Context, at);
ZEND_METHOD(Polyspec_Template_Render_Context, fail);
ZEND_METHOD(Polyspec_Template_Render_Context, enter);
ZEND_METHOD(Polyspec_Template_Render_Context, leave);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, __construct);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, truthy);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, unary);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, binary);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, stringify);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, escape);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, number);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, finite);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, equal);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, compare);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, member);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, memberCall);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, classCall);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, index);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, depth);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, entries);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, listSpread);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, mapSpread);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, call);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, limit);
ZEND_METHOD(Polyspec_Template_Render_RuntimeBindings, error);
ZEND_METHOD(Polyspec_Template_Render_Evaluator, __construct);
ZEND_METHOD(Polyspec_Template_Render_Evaluator, evaluate);
ZEND_METHOD(Polyspec_Template_Render_Renderer, __construct);
ZEND_METHOD(Polyspec_Template_Render_Renderer, renderNodes);
ZEND_METHOD(Polyspec_Template_TemplateError, __construct);
ZEND_METHOD(Polyspec_Template_TemplateError, at);
ZEND_METHOD(Polyspec_Template_TemplateError, withoutPosition);
ZEND_METHOD(Polyspec_Template_TemplateError, toArray);
ZEND_METHOD(Polyspec_Template_AstDecodeError, __construct);
ZEND_METHOD(Polyspec_Template_AstDecoder, decode);
ZEND_METHOD(Polyspec_Template_PreparedRender, __construct);
ZEND_METHOD(Polyspec_Template_PreparedRender, render);
ZEND_METHOD(Polyspec_Template_Engine, __construct);
ZEND_METHOD(Polyspec_Template_Engine, prepare);
ZEND_METHOD(Polyspec_Template_Engine, render);
ZEND_METHOD(Polyspec_Template_AstPreparedExecution, __construct);
ZEND_METHOD(Polyspec_Template_AstPreparedExecution, render);
ZEND_METHOD(Polyspec_Template_AstProgram, __construct);
ZEND_METHOD(Polyspec_Template_AstProgram, decodeTemplate);
ZEND_METHOD(Polyspec_Template_AstProgram, loadArtifact);
ZEND_METHOD(Polyspec_Template_AstProgram, loadOrRefresh);
ZEND_METHOD(Polyspec_Template_AstProgram, parse);
ZEND_METHOD(Polyspec_Template_AstProgram, analyze);
ZEND_METHOD(Polyspec_Template_AstProgram, register);
ZEND_METHOD(Polyspec_Template_AstProgram, registerClass);
ZEND_METHOD(Polyspec_Template_AstProgram, hostFunction);
ZEND_METHOD(Polyspec_Template_AstProgram, classFunction);
ZEND_METHOD(Polyspec_Template_AstProgram, limits);
ZEND_METHOD(Polyspec_Template_AstProgram, loadTemplate);
ZEND_METHOD(Polyspec_Template_AstProgram, prepare);
ZEND_METHOD(Polyspec_Template_AstProgram, render);
ZEND_METHOD(Polyspec_Template_BoundMap, __construct);
ZEND_METHOD(Polyspec_Template_BoundMap, __clone);
ZEND_METHOD(Polyspec_Template_BoundMap, __unserialize);
ZEND_METHOD(Polyspec_Template_BoundMap, bind);
ZEND_METHOD(Polyspec_Template_BoundMap, merge);
ZEND_METHOD(Polyspec_Template_PageCache, __construct);
ZEND_METHOD(Polyspec_Template_PageCache, get);
ZEND_METHOD(Polyspec_Template_PageCache, set);
ZEND_METHOD(Polyspec_Template_PageCache, getOrSet);
ZEND_METHOD(Polyspec_Template_PageCache, delete);
ZEND_METHOD(Polyspec_Template_PageCache, clear);
ZEND_METHOD(Polyspec_Template_Source, __construct);
ZEND_METHOD(Polyspec_Template_Source, fromBytes);
ZEND_METHOD(Polyspec_Template_Source, lineIndex);
ZEND_METHOD(Polyspec_Template_Source, position);
ZEND_METHOD(Polyspec_Template_Source, length);
ZEND_METHOD(Polyspec_Template_Utf8, isValid);
ZEND_METHOD(Polyspec_Template_Utf8, firstInvalid);
ZEND_METHOD(Polyspec_Template_Utf8, chr);
ZEND_METHOD(Polyspec_Template_Utf8, codePoints);
ZEND_METHOD(Polyspec_Template_Utf8, length);
ZEND_METHOD(Polyspec_Template_Escape, html);
ZEND_METHOD(Polyspec_Template_InternalBoundary, run);
ZEND_METHOD(Polyspec_Template_Value_SafeString, __construct);
ZEND_METHOD(Polyspec_Template_Value_BindError, __construct);
ZEND_METHOD(Polyspec_Template_Value_MapValue, set);
ZEND_METHOD(Polyspec_Template_Value_MapValue, has);
ZEND_METHOD(Polyspec_Template_Value_MapValue, get);
ZEND_METHOD(Polyspec_Template_Value_MapValue, remove);
ZEND_METHOD(Polyspec_Template_Value_MapValue, count);
ZEND_METHOD(Polyspec_Template_Value_MapValue, keys);
ZEND_METHOD(Polyspec_Template_Value_MapValue, values);
ZEND_METHOD(Polyspec_Template_Value_MapValue, entries);
ZEND_METHOD(Polyspec_Template_Value_MapValue, copy);
ZEND_METHOD(Polyspec_Template_Value_Bind, value);
ZEND_METHOD(Polyspec_Template_Value_Bind, checkFloat);
ZEND_METHOD(Polyspec_Template_Value_Bind, checkLevel);
ZEND_METHOD(Polyspec_Template_Value_Bind, depthWithin);
ZEND_METHOD(Polyspec_Template_Value_Bind, publicProperties);
ZEND_METHOD(Polyspec_Template_Value_Bind, map);
ZEND_METHOD(Polyspec_Template_Value_Bind, data);
ZEND_METHOD(Polyspec_Template_Value_Json, parse);
ZEND_METHOD(Polyspec_Template_Value_Value, typeOf);
ZEND_METHOD(Polyspec_Template_Value_Value, isString);
ZEND_METHOD(Polyspec_Template_Value_Value, textOf);
ZEND_METHOD(Polyspec_Template_Value_Value, isNumber);
ZEND_METHOD(Polyspec_Template_Value_Value, isTruthy);
ZEND_METHOD(Polyspec_Template_Value_Value, stringify);
ZEND_METHOD(Polyspec_Template_Value_Value, parseNumericString);
ZEND_METHOD(Polyspec_Template_Value_Value, compareCodePoints);
ZEND_METHOD(Polyspec_Template_Value_Value, looseEquals);
ZEND_METHOD(Polyspec_Template_Value_Value, strictEquals);
ZEND_METHOD(Polyspec_Template_Value_Value, compare);
ZEND_METHOD(Polyspec_Template_Value_Value, isCollection);
ZEND_METHOD(Polyspec_Template_Value_Number, toText);
ZEND_METHOD(Polyspec_Template_Value_Number, shortestDigits);
ZEND_METHOD(Polyspec_Template_Value_Number, positional);
ZEND_METHOD(Polyspec_Template_Value_Number, roundDecimal);
ZEND_METHOD(Polyspec_Template_Value_Number, format);
ZEND_METHOD(Polyspec_Template_Value_Number, round);
ZEND_METHOD(Polyspec_Template_Value_Number, isInteger);
ZEND_METHOD(Polyspec_Template_Value_HostArgument, of);
ZEND_METHOD(Polyspec_Template_Value_HostArgument, list);
ZEND_METHOD(Polyspec_Template_Functions_FunctionError, __construct);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, typeError);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, string);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, list);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, toNumber);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, number);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, integer);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, stringify);
ZEND_METHOD(Polyspec_Template_Functions_Helpers, safe);
ZEND_METHOD(Polyspec_Template_Functions_Strings, table);
ZEND_METHOD(Polyspec_Template_Functions_Numbers, table);
ZEND_METHOD(Polyspec_Template_Functions_Encoding, toJson);
ZEND_METHOD(Polyspec_Template_Functions_Encoding, percentEncode);
ZEND_METHOD(Polyspec_Template_Functions_Encoding, table);
ZEND_METHOD(Polyspec_Template_Functions_Collection, table);
ZEND_METHOD(Polyspec_Template_Functions_Dates, parseOffset);
ZEND_METHOD(Polyspec_Template_Functions_Dates, daysFromCivil);
ZEND_METHOD(Polyspec_Template_Functions_Dates, civilFromDays);
ZEND_METHOD(Polyspec_Template_Functions_Dates, toUnixSeconds);
ZEND_METHOD(Polyspec_Template_Functions_Dates, format);
ZEND_METHOD(Polyspec_Template_Functions_Dates, table);
ZEND_METHOD(Polyspec_Template_Functions_Registry, builtins);
ZEND_METHOD(Polyspec_Template_Functions_Registry, isBuiltin);
ZEND_METHOD(Polyspec_Template_Format_FormatError, __construct);
ZEND_METHOD(Polyspec_Template_Format_FormatError, toArray);
ZEND_METHOD(Polyspec_Template_Format_FormatResult, __construct);
ZEND_METHOD(Polyspec_Template_Format_FormatResult, text);
ZEND_METHOD(Polyspec_Template_Format_FormatResult, error);
ZEND_METHOD(Polyspec_Template_Format_Expression, join);
ZEND_METHOD(Polyspec_Template_Format_Invariant, withoutSpans);
ZEND_METHOD(Polyspec_Template_Format_Invariant, withoutLineIndentation);
ZEND_METHOD(Polyspec_Template_Format_Invariant, sameTree);
ZEND_METHOD(Polyspec_Template_Format_Indent, __construct);
ZEND_METHOD(Polyspec_Template_Format_Indent, edits);
ZEND_METHOD(Polyspec_Template_Format_PackageAnalyzer, analyze);
ZEND_METHOD(Polyspec_Template_Format_PackageAnalyzer, parse);
ZEND_METHOD(Polyspec_Template_Format_Body, format);
ZEND_METHOD(Polyspec_Template_Format_Formatter, format);
ZEND_METHOD(Polyspec_Template_Expr_Token, __construct);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, __construct);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, error);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, peek);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, next);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, consumed);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, consumedEnd);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, text);
ZEND_METHOD(Polyspec_Template_Expr_Lexer, stringLiteral);
ZEND_METHOD(Polyspec_Template_Expr_Parser, __construct);
ZEND_METHOD(Polyspec_Template_Expr_Parser, peek);
ZEND_METHOD(Polyspec_Template_Expr_Parser, next);
ZEND_METHOD(Polyspec_Template_Expr_Parser, unexpected);
ZEND_METHOD(Polyspec_Template_Expr_Parser, expect);
ZEND_METHOD(Polyspec_Template_Expr_Parser, expectClose);
ZEND_METHOD(Polyspec_Template_Expr_Parser, parseExpression);
ZEND_METHOD(Polyspec_Template_Expr_Parser, parsePostfix);
ZEND_METHOD(Polyspec_Template_Ast, isLoopMetaField);
ZEND_METHOD(Polyspec_Template_Ast, node);
ZEND_METHOD(Polyspec_Template_Ast, toJson);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, skipHorizontalSpace);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, isHorizontalSpace);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, sigilAfter);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, startsTag);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, wrappedTagAt);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, isDelimiterChar);
ZEND_METHOD(Polyspec_Template_Parser_Scanner, parseDelimiters);
ZEND_METHOD(Polyspec_Template_Parser_Standalone, ranges);
ZEND_METHOD(Polyspec_Template_Parser_Parser, __construct);
ZEND_METHOD(Polyspec_Template_Parser_Parser, parse);
ZEND_METHOD(Polyspec_Template_Parser_Parser, analyze);
ZEND_METHOD(Polyspec_Template_Parser_BlockTag, __construct);
ZEND_METHOD(Polyspec_Template_Parser_BlockTag, readIncludePath);
ZEND_METHOD(Polyspec_Template_Parser_BlockTag, readBlockBody);

static const zend_function_entry class_Polyspec_Template_Loader_LoaderInterface_methods[] = {
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("load", NULL, arginfo_class_Polyspec_Template_Loader_LoaderInterface_load, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("load", NULL, arginfo_class_Polyspec_Template_Loader_LoaderInterface_load, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Loader_ArrayLoader_methods[] = {
	ZEND_ME(Polyspec_Template_Loader_ArrayLoader, __construct, arginfo_class_Polyspec_Template_Loader_ArrayLoader___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Loader_ArrayLoader, set, arginfo_class_Polyspec_Template_Loader_ArrayLoader_set, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Loader_ArrayLoader, load, arginfo_class_Polyspec_Template_Loader_ArrayLoader_load, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Loader_FilesystemLoader_methods[] = {
	ZEND_ME(Polyspec_Template_Loader_FilesystemLoader, __construct, arginfo_class_Polyspec_Template_Loader_FilesystemLoader___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Loader_FilesystemLoader, load, arginfo_class_Polyspec_Template_Loader_FilesystemLoader_load, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Loader_Path_methods[] = {
	ZEND_ME(Polyspec_Template_Loader_Path, resolve, arginfo_class_Polyspec_Template_Loader_Path_resolve, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_RuntimeServices_methods[] = {
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("limits", NULL, arginfo_class_Polyspec_Template_Render_RuntimeServices_limits, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("limits", NULL, arginfo_class_Polyspec_Template_Render_RuntimeServices_limits, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("hostFunction", NULL, arginfo_class_Polyspec_Template_Render_RuntimeServices_hostFunction, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("hostFunction", NULL, arginfo_class_Polyspec_Template_Render_RuntimeServices_hostFunction, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("classFunction", NULL, arginfo_class_Polyspec_Template_Render_RuntimeServices_classFunction, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("classFunction", NULL, arginfo_class_Polyspec_Template_Render_RuntimeServices_classFunction, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_RuntimeEnvironment_methods[] = {
	ZEND_ME(Polyspec_Template_Render_RuntimeEnvironment, __construct, arginfo_class_Polyspec_Template_Render_RuntimeEnvironment___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeEnvironment, register, arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_register, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeEnvironment, limits, arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_limits, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeEnvironment, hostFunction, arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_hostFunction, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeEnvironment, registerClass, arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_registerClass, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeEnvironment, classFunction, arginfo_class_Polyspec_Template_Render_RuntimeEnvironment_classFunction, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_Frame_methods[] = {
	ZEND_ME(Polyspec_Template_Render_Frame, __construct, arginfo_class_Polyspec_Template_Render_Frame___construct, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_Scope_methods[] = {
	ZEND_ME(Polyspec_Template_Render_Scope, __construct, arginfo_class_Polyspec_Template_Render_Scope___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Scope, lookup, arginfo_class_Polyspec_Template_Render_Scope_lookup, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Scope, loopMeta, arginfo_class_Polyspec_Template_Render_Scope_loopMeta, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_Context_methods[] = {
	ZEND_ME(Polyspec_Template_Render_Context, __construct, arginfo_class_Polyspec_Template_Render_Context___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Context, write, arginfo_class_Polyspec_Template_Render_Context_write, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Context, output, arginfo_class_Polyspec_Template_Render_Context_output, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Context, at, arginfo_class_Polyspec_Template_Render_Context_at, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Context, fail, arginfo_class_Polyspec_Template_Render_Context_fail, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Context, enter, arginfo_class_Polyspec_Template_Render_Context_enter, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Context, leave, arginfo_class_Polyspec_Template_Render_Context_leave, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_RuntimeBindings_methods[] = {
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, __construct, arginfo_class_Polyspec_Template_Render_RuntimeBindings___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, truthy, arginfo_class_Polyspec_Template_Render_RuntimeBindings_truthy, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, unary, arginfo_class_Polyspec_Template_Render_RuntimeBindings_unary, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, binary, arginfo_class_Polyspec_Template_Render_RuntimeBindings_binary, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, stringify, arginfo_class_Polyspec_Template_Render_RuntimeBindings_stringify, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, escape, arginfo_class_Polyspec_Template_Render_RuntimeBindings_escape, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, number, arginfo_class_Polyspec_Template_Render_RuntimeBindings_number, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, finite, arginfo_class_Polyspec_Template_Render_RuntimeBindings_finite, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, equal, arginfo_class_Polyspec_Template_Render_RuntimeBindings_equal, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, compare, arginfo_class_Polyspec_Template_Render_RuntimeBindings_compare, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, member, arginfo_class_Polyspec_Template_Render_RuntimeBindings_member, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, memberCall, arginfo_class_Polyspec_Template_Render_RuntimeBindings_memberCall, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, classCall, arginfo_class_Polyspec_Template_Render_RuntimeBindings_classCall, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, index, arginfo_class_Polyspec_Template_Render_RuntimeBindings_index, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, depth, arginfo_class_Polyspec_Template_Render_RuntimeBindings_depth, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, entries, arginfo_class_Polyspec_Template_Render_RuntimeBindings_entries, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, listSpread, arginfo_class_Polyspec_Template_Render_RuntimeBindings_listSpread, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, mapSpread, arginfo_class_Polyspec_Template_Render_RuntimeBindings_mapSpread, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, call, arginfo_class_Polyspec_Template_Render_RuntimeBindings_call, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, limit, arginfo_class_Polyspec_Template_Render_RuntimeBindings_limit, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_RuntimeBindings, error, arginfo_class_Polyspec_Template_Render_RuntimeBindings_error, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_Evaluator_methods[] = {
	ZEND_ME(Polyspec_Template_Render_Evaluator, __construct, arginfo_class_Polyspec_Template_Render_Evaluator___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Evaluator, evaluate, arginfo_class_Polyspec_Template_Render_Evaluator_evaluate, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Render_Renderer_methods[] = {
	ZEND_ME(Polyspec_Template_Render_Renderer, __construct, arginfo_class_Polyspec_Template_Render_Renderer___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Render_Renderer, renderNodes, arginfo_class_Polyspec_Template_Render_Renderer_renderNodes, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_TemplateError_methods[] = {
	ZEND_ME(Polyspec_Template_TemplateError, __construct, arginfo_class_Polyspec_Template_TemplateError___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_TemplateError, at, arginfo_class_Polyspec_Template_TemplateError_at, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_TemplateError, withoutPosition, arginfo_class_Polyspec_Template_TemplateError_withoutPosition, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_TemplateError, toArray, arginfo_class_Polyspec_Template_TemplateError_toArray, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_AstDecodeError_methods[] = {
	ZEND_ME(Polyspec_Template_AstDecodeError, __construct, arginfo_class_Polyspec_Template_AstDecodeError___construct, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_AstDecoder_methods[] = {
	ZEND_ME(Polyspec_Template_AstDecoder, decode, arginfo_class_Polyspec_Template_AstDecoder_decode, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Program_methods[] = {
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("prepare", NULL, arginfo_class_Polyspec_Template_Program_prepare, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("prepare", NULL, arginfo_class_Polyspec_Template_Program_prepare, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("render", NULL, arginfo_class_Polyspec_Template_Program_render, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("render", NULL, arginfo_class_Polyspec_Template_Program_render, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_PreparedRender_methods[] = {
	ZEND_ME(Polyspec_Template_PreparedRender, __construct, arginfo_class_Polyspec_Template_PreparedRender___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_PreparedRender, render, arginfo_class_Polyspec_Template_PreparedRender_render, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Engine_methods[] = {
	ZEND_ME(Polyspec_Template_Engine, __construct, arginfo_class_Polyspec_Template_Engine___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Engine, prepare, arginfo_class_Polyspec_Template_Engine_prepare, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Engine, render, arginfo_class_Polyspec_Template_Engine_render, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_PreparedExecution_methods[] = {
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("render", NULL, arginfo_class_Polyspec_Template_PreparedExecution_render, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("render", NULL, arginfo_class_Polyspec_Template_PreparedExecution_render, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_AstPreparedExecution_methods[] = {
	ZEND_ME(Polyspec_Template_AstPreparedExecution, __construct, arginfo_class_Polyspec_Template_AstPreparedExecution___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstPreparedExecution, render, arginfo_class_Polyspec_Template_AstPreparedExecution_render, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_AstProgram_methods[] = {
	ZEND_ME(Polyspec_Template_AstProgram, __construct, arginfo_class_Polyspec_Template_AstProgram___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, decodeTemplate, arginfo_class_Polyspec_Template_AstProgram_decodeTemplate, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, loadArtifact, arginfo_class_Polyspec_Template_AstProgram_loadArtifact, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, loadOrRefresh, arginfo_class_Polyspec_Template_AstProgram_loadOrRefresh, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, parse, arginfo_class_Polyspec_Template_AstProgram_parse, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, analyze, arginfo_class_Polyspec_Template_AstProgram_analyze, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, register, arginfo_class_Polyspec_Template_AstProgram_register, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, registerClass, arginfo_class_Polyspec_Template_AstProgram_registerClass, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, hostFunction, arginfo_class_Polyspec_Template_AstProgram_hostFunction, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, classFunction, arginfo_class_Polyspec_Template_AstProgram_classFunction, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, limits, arginfo_class_Polyspec_Template_AstProgram_limits, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, loadTemplate, arginfo_class_Polyspec_Template_AstProgram_loadTemplate, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, prepare, arginfo_class_Polyspec_Template_AstProgram_prepare, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, render, arginfo_class_Polyspec_Template_AstProgram_render, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_BoundMap_methods[] = {
	ZEND_ME(Polyspec_Template_BoundMap, __construct, arginfo_class_Polyspec_Template_BoundMap___construct, ZEND_ACC_PRIVATE)
	ZEND_ME(Polyspec_Template_BoundMap, __clone, arginfo_class_Polyspec_Template_BoundMap___clone, ZEND_ACC_PRIVATE)
	ZEND_ME(Polyspec_Template_BoundMap, __unserialize, arginfo_class_Polyspec_Template_BoundMap___unserialize, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_BoundMap, bind, arginfo_class_Polyspec_Template_BoundMap_bind, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_BoundMap, merge, arginfo_class_Polyspec_Template_BoundMap_merge, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_PageCache_methods[] = {
	ZEND_ME(Polyspec_Template_PageCache, __construct, arginfo_class_Polyspec_Template_PageCache___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_PageCache, get, arginfo_class_Polyspec_Template_PageCache_get, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_PageCache, set, arginfo_class_Polyspec_Template_PageCache_set, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_PageCache, getOrSet, arginfo_class_Polyspec_Template_PageCache_getOrSet, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_PageCache, delete, arginfo_class_Polyspec_Template_PageCache_delete, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_PageCache, clear, arginfo_class_Polyspec_Template_PageCache_clear, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Source_methods[] = {
	ZEND_ME(Polyspec_Template_Source, __construct, arginfo_class_Polyspec_Template_Source___construct, ZEND_ACC_PRIVATE)
	ZEND_ME(Polyspec_Template_Source, fromBytes, arginfo_class_Polyspec_Template_Source_fromBytes, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Source, lineIndex, arginfo_class_Polyspec_Template_Source_lineIndex, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Source, position, arginfo_class_Polyspec_Template_Source_position, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Source, length, arginfo_class_Polyspec_Template_Source_length, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Utf8_methods[] = {
	ZEND_ME(Polyspec_Template_Utf8, isValid, arginfo_class_Polyspec_Template_Utf8_isValid, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Utf8, firstInvalid, arginfo_class_Polyspec_Template_Utf8_firstInvalid, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Utf8, chr, arginfo_class_Polyspec_Template_Utf8_chr, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Utf8, codePoints, arginfo_class_Polyspec_Template_Utf8_codePoints, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Utf8, length, arginfo_class_Polyspec_Template_Utf8_length, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Escape_methods[] = {
	ZEND_ME(Polyspec_Template_Escape, html, arginfo_class_Polyspec_Template_Escape_html, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_InternalBoundary_methods[] = {
	ZEND_ME(Polyspec_Template_InternalBoundary, run, arginfo_class_Polyspec_Template_InternalBoundary_run, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_SafeString_methods[] = {
	ZEND_ME(Polyspec_Template_Value_SafeString, __construct, arginfo_class_Polyspec_Template_Value_SafeString___construct, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_BindError_methods[] = {
	ZEND_ME(Polyspec_Template_Value_BindError, __construct, arginfo_class_Polyspec_Template_Value_BindError___construct, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_MapValue_methods[] = {
	ZEND_ME(Polyspec_Template_Value_MapValue, set, arginfo_class_Polyspec_Template_Value_MapValue_set, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, has, arginfo_class_Polyspec_Template_Value_MapValue_has, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, get, arginfo_class_Polyspec_Template_Value_MapValue_get, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, remove, arginfo_class_Polyspec_Template_Value_MapValue_remove, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, count, arginfo_class_Polyspec_Template_Value_MapValue_count, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, keys, arginfo_class_Polyspec_Template_Value_MapValue_keys, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, values, arginfo_class_Polyspec_Template_Value_MapValue_values, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, entries, arginfo_class_Polyspec_Template_Value_MapValue_entries, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Value_MapValue, copy, arginfo_class_Polyspec_Template_Value_MapValue_copy, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_Bind_methods[] = {
	ZEND_ME(Polyspec_Template_Value_Bind, value, arginfo_class_Polyspec_Template_Value_Bind_value, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Bind, checkFloat, arginfo_class_Polyspec_Template_Value_Bind_checkFloat, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Bind, checkLevel, arginfo_class_Polyspec_Template_Value_Bind_checkLevel, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Bind, depthWithin, arginfo_class_Polyspec_Template_Value_Bind_depthWithin, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Bind, publicProperties, arginfo_class_Polyspec_Template_Value_Bind_publicProperties, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Bind, map, arginfo_class_Polyspec_Template_Value_Bind_map, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Bind, data, arginfo_class_Polyspec_Template_Value_Bind_data, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_Json_methods[] = {
	ZEND_ME(Polyspec_Template_Value_Json, parse, arginfo_class_Polyspec_Template_Value_Json_parse, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_Value_methods[] = {
	ZEND_ME(Polyspec_Template_Value_Value, typeOf, arginfo_class_Polyspec_Template_Value_Value_typeOf, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, isString, arginfo_class_Polyspec_Template_Value_Value_isString, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, textOf, arginfo_class_Polyspec_Template_Value_Value_textOf, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, isNumber, arginfo_class_Polyspec_Template_Value_Value_isNumber, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, isTruthy, arginfo_class_Polyspec_Template_Value_Value_isTruthy, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, stringify, arginfo_class_Polyspec_Template_Value_Value_stringify, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, parseNumericString, arginfo_class_Polyspec_Template_Value_Value_parseNumericString, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, compareCodePoints, arginfo_class_Polyspec_Template_Value_Value_compareCodePoints, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, looseEquals, arginfo_class_Polyspec_Template_Value_Value_looseEquals, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, strictEquals, arginfo_class_Polyspec_Template_Value_Value_strictEquals, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, compare, arginfo_class_Polyspec_Template_Value_Value_compare, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Value, isCollection, arginfo_class_Polyspec_Template_Value_Value_isCollection, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_Number_methods[] = {
	ZEND_ME(Polyspec_Template_Value_Number, toText, arginfo_class_Polyspec_Template_Value_Number_toText, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Number, shortestDigits, arginfo_class_Polyspec_Template_Value_Number_shortestDigits, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Number, positional, arginfo_class_Polyspec_Template_Value_Number_positional, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Number, roundDecimal, arginfo_class_Polyspec_Template_Value_Number_roundDecimal, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Number, format, arginfo_class_Polyspec_Template_Value_Number_format, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Number, round, arginfo_class_Polyspec_Template_Value_Number_round, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_Number, isInteger, arginfo_class_Polyspec_Template_Value_Number_isInteger, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Value_HostArgument_methods[] = {
	ZEND_ME(Polyspec_Template_Value_HostArgument, of, arginfo_class_Polyspec_Template_Value_HostArgument_of, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Value_HostArgument, list, arginfo_class_Polyspec_Template_Value_HostArgument_list, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_FunctionError_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_FunctionError, __construct, arginfo_class_Polyspec_Template_Functions_FunctionError___construct, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_FunctionGroup_methods[] = {
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("table", NULL, arginfo_class_Polyspec_Template_Functions_FunctionGroup_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("table", NULL, arginfo_class_Polyspec_Template_Functions_FunctionGroup_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC|ZEND_ACC_ABSTRACT)
#endif
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Helpers_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Helpers, typeError, arginfo_class_Polyspec_Template_Functions_Helpers_typeError, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, string, arginfo_class_Polyspec_Template_Functions_Helpers_string, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, list, arginfo_class_Polyspec_Template_Functions_Helpers_list, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, toNumber, arginfo_class_Polyspec_Template_Functions_Helpers_toNumber, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, number, arginfo_class_Polyspec_Template_Functions_Helpers_number, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, integer, arginfo_class_Polyspec_Template_Functions_Helpers_integer, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, stringify, arginfo_class_Polyspec_Template_Functions_Helpers_stringify, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Helpers, safe, arginfo_class_Polyspec_Template_Functions_Helpers_safe, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Strings_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Strings, table, arginfo_class_Polyspec_Template_Functions_Strings_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Numbers_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Numbers, table, arginfo_class_Polyspec_Template_Functions_Numbers_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Encoding_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Encoding, toJson, arginfo_class_Polyspec_Template_Functions_Encoding_toJson, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Encoding, percentEncode, arginfo_class_Polyspec_Template_Functions_Encoding_percentEncode, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Encoding, table, arginfo_class_Polyspec_Template_Functions_Encoding_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Collection_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Collection, table, arginfo_class_Polyspec_Template_Functions_Collection_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Dates_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Dates, parseOffset, arginfo_class_Polyspec_Template_Functions_Dates_parseOffset, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Dates, daysFromCivil, arginfo_class_Polyspec_Template_Functions_Dates_daysFromCivil, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Dates, civilFromDays, arginfo_class_Polyspec_Template_Functions_Dates_civilFromDays, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Dates, toUnixSeconds, arginfo_class_Polyspec_Template_Functions_Dates_toUnixSeconds, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Dates, format, arginfo_class_Polyspec_Template_Functions_Dates_format, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Dates, table, arginfo_class_Polyspec_Template_Functions_Dates_table, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Functions_Registry_methods[] = {
	ZEND_ME(Polyspec_Template_Functions_Registry, builtins, arginfo_class_Polyspec_Template_Functions_Registry_builtins, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Functions_Registry, isBuiltin, arginfo_class_Polyspec_Template_Functions_Registry_isBuiltin, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_FormatError_methods[] = {
	ZEND_ME(Polyspec_Template_Format_FormatError, __construct, arginfo_class_Polyspec_Template_Format_FormatError___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Format_FormatError, toArray, arginfo_class_Polyspec_Template_Format_FormatError_toArray, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_FormatResult_methods[] = {
	ZEND_ME(Polyspec_Template_Format_FormatResult, __construct, arginfo_class_Polyspec_Template_Format_FormatResult___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Format_FormatResult, text, arginfo_class_Polyspec_Template_Format_FormatResult_text, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Format_FormatResult, error, arginfo_class_Polyspec_Template_Format_FormatResult_error, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_Expression_methods[] = {
	ZEND_ME(Polyspec_Template_Format_Expression, join, arginfo_class_Polyspec_Template_Format_Expression_join, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_Invariant_methods[] = {
	ZEND_ME(Polyspec_Template_Format_Invariant, withoutSpans, arginfo_class_Polyspec_Template_Format_Invariant_withoutSpans, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Format_Invariant, withoutLineIndentation, arginfo_class_Polyspec_Template_Format_Invariant_withoutLineIndentation, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Format_Invariant, sameTree, arginfo_class_Polyspec_Template_Format_Invariant_sameTree, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_Indent_methods[] = {
	ZEND_ME(Polyspec_Template_Format_Indent, __construct, arginfo_class_Polyspec_Template_Format_Indent___construct, ZEND_ACC_PRIVATE)
	ZEND_ME(Polyspec_Template_Format_Indent, edits, arginfo_class_Polyspec_Template_Format_Indent_edits, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_Analyzer_methods[] = {
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("analyze", NULL, arginfo_class_Polyspec_Template_Format_Analyzer_analyze, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("analyze", NULL, arginfo_class_Polyspec_Template_Format_Analyzer_analyze, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
#if (PHP_VERSION_ID >= 80400)
	ZEND_RAW_FENTRY("parse", NULL, arginfo_class_Polyspec_Template_Format_Analyzer_parse, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT, NULL, NULL)
#else
	ZEND_RAW_FENTRY("parse", NULL, arginfo_class_Polyspec_Template_Format_Analyzer_parse, ZEND_ACC_PUBLIC|ZEND_ACC_ABSTRACT)
#endif
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_PackageAnalyzer_methods[] = {
	ZEND_ME(Polyspec_Template_Format_PackageAnalyzer, analyze, arginfo_class_Polyspec_Template_Format_PackageAnalyzer_analyze, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Format_PackageAnalyzer, parse, arginfo_class_Polyspec_Template_Format_PackageAnalyzer_parse, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_Body_methods[] = {
	ZEND_ME(Polyspec_Template_Format_Body, format, arginfo_class_Polyspec_Template_Format_Body_format, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Format_Formatter_methods[] = {
	ZEND_ME(Polyspec_Template_Format_Formatter, format, arginfo_class_Polyspec_Template_Format_Formatter_format, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Expr_Token_methods[] = {
	ZEND_ME(Polyspec_Template_Expr_Token, __construct, arginfo_class_Polyspec_Template_Expr_Token___construct, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Expr_Lexer_methods[] = {
	ZEND_ME(Polyspec_Template_Expr_Lexer, __construct, arginfo_class_Polyspec_Template_Expr_Lexer___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, error, arginfo_class_Polyspec_Template_Expr_Lexer_error, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, peek, arginfo_class_Polyspec_Template_Expr_Lexer_peek, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, next, arginfo_class_Polyspec_Template_Expr_Lexer_next, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, consumed, arginfo_class_Polyspec_Template_Expr_Lexer_consumed, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, consumedEnd, arginfo_class_Polyspec_Template_Expr_Lexer_consumedEnd, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, text, arginfo_class_Polyspec_Template_Expr_Lexer_text, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Lexer, stringLiteral, arginfo_class_Polyspec_Template_Expr_Lexer_stringLiteral, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Expr_Parser_methods[] = {
	ZEND_ME(Polyspec_Template_Expr_Parser, __construct, arginfo_class_Polyspec_Template_Expr_Parser___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, peek, arginfo_class_Polyspec_Template_Expr_Parser_peek, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, next, arginfo_class_Polyspec_Template_Expr_Parser_next, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, unexpected, arginfo_class_Polyspec_Template_Expr_Parser_unexpected, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, expect, arginfo_class_Polyspec_Template_Expr_Parser_expect, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, expectClose, arginfo_class_Polyspec_Template_Expr_Parser_expectClose, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, parseExpression, arginfo_class_Polyspec_Template_Expr_Parser_parseExpression, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Expr_Parser, parsePostfix, arginfo_class_Polyspec_Template_Expr_Parser_parsePostfix, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Ast_methods[] = {
	ZEND_ME(Polyspec_Template_Ast, isLoopMetaField, arginfo_class_Polyspec_Template_Ast_isLoopMetaField, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Ast, node, arginfo_class_Polyspec_Template_Ast_node, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Ast, toJson, arginfo_class_Polyspec_Template_Ast_toJson, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Parser_Scanner_methods[] = {
	ZEND_ME(Polyspec_Template_Parser_Scanner, skipHorizontalSpace, arginfo_class_Polyspec_Template_Parser_Scanner_skipHorizontalSpace, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Scanner, isHorizontalSpace, arginfo_class_Polyspec_Template_Parser_Scanner_isHorizontalSpace, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Scanner, sigilAfter, arginfo_class_Polyspec_Template_Parser_Scanner_sigilAfter, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Scanner, startsTag, arginfo_class_Polyspec_Template_Parser_Scanner_startsTag, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Scanner, wrappedTagAt, arginfo_class_Polyspec_Template_Parser_Scanner_wrappedTagAt, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Scanner, isDelimiterChar, arginfo_class_Polyspec_Template_Parser_Scanner_isDelimiterChar, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Scanner, parseDelimiters, arginfo_class_Polyspec_Template_Parser_Scanner_parseDelimiters, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Parser_Standalone_methods[] = {
	ZEND_ME(Polyspec_Template_Parser_Standalone, ranges, arginfo_class_Polyspec_Template_Parser_Standalone_ranges, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Parser_Parser_methods[] = {
	ZEND_ME(Polyspec_Template_Parser_Parser, __construct, arginfo_class_Polyspec_Template_Parser_Parser___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Parser_Parser, parse, arginfo_class_Polyspec_Template_Parser_Parser_parse, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Parser_Parser, analyze, arginfo_class_Polyspec_Template_Parser_Parser_analyze, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Parser_BlockTag_methods[] = {
	ZEND_ME(Polyspec_Template_Parser_BlockTag, __construct, arginfo_class_Polyspec_Template_Parser_BlockTag___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Parser_BlockTag, readIncludePath, arginfo_class_Polyspec_Template_Parser_BlockTag_readIncludePath, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Parser_BlockTag, readBlockBody, arginfo_class_Polyspec_Template_Parser_BlockTag_readBlockBody, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static zend_class_entry *register_class_Polyspec_Template_Loader_LoaderInterface(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Loader", "LoaderInterface", class_Polyspec_Template_Loader_LoaderInterface_methods);
	class_entry = zend_register_internal_interface(&ce);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Loader_ArtifactStaleException(zend_class_entry *class_entry_RuntimeException)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Loader", "ArtifactStaleException", NULL);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, class_entry_RuntimeException, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, class_entry_RuntimeException);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Loader_ArrayLoader(zend_class_entry *class_entry_Polyspec_Template_Loader_LoaderInterface)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Loader", "ArrayLoader", class_Polyspec_Template_Loader_ArrayLoader_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Loader_LoaderInterface);

	zval property_entries_default_value;
	ZVAL_EMPTY_ARRAY(&property_entries_default_value);
	zend_string *property_entries_name = zend_string_init("entries", sizeof("entries") - 1, 1);
	zend_declare_typed_property(class_entry, property_entries_name, &property_entries_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_entries_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Loader_FilesystemLoader(zend_class_entry *class_entry_Polyspec_Template_Loader_LoaderInterface)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Loader", "FilesystemLoader", class_Polyspec_Template_Loader_FilesystemLoader_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Loader_LoaderInterface);

	zval property_root_default_value;
	ZVAL_UNDEF(&property_root_default_value);
	zend_string *property_root_name = zend_string_init("root", sizeof("root") - 1, 1);
	zend_declare_typed_property(class_entry, property_root_name, &property_root_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_root_name);

	zval property_files_default_value;
	ZVAL_EMPTY_ARRAY(&property_files_default_value);
	zend_string *property_files_name = zend_string_init("files", sizeof("files") - 1, 1);
	zend_declare_typed_property(class_entry, property_files_name, &property_files_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_files_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Loader_Path(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Loader", "Path", class_Polyspec_Template_Loader_Path_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_RuntimeServices(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "RuntimeServices", class_Polyspec_Template_Render_RuntimeServices_methods);
	class_entry = zend_register_internal_interface(&ce);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_RuntimeEnvironment(zend_class_entry *class_entry_Polyspec_Template_Render_RuntimeServices)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "RuntimeEnvironment", class_Polyspec_Template_Render_RuntimeEnvironment_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Render_RuntimeServices);

	zval property_limits_default_value;
	ZVAL_UNDEF(&property_limits_default_value);
	zend_string *property_limits_name = zend_string_init("limits", sizeof("limits") - 1, 1);
	zend_declare_typed_property(class_entry, property_limits_name, &property_limits_default_value, ZEND_ACC_PRIVATE|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_limits_name);

	zval property_hostFunctions_default_value;
	ZVAL_UNDEF(&property_hostFunctions_default_value);
	zend_string *property_hostFunctions_name = zend_string_init("hostFunctions", sizeof("hostFunctions") - 1, 1);
	zend_declare_typed_property(class_entry, property_hostFunctions_name, &property_hostFunctions_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_hostFunctions_name);

	zval property_classFunctions_default_value;
	ZVAL_UNDEF(&property_classFunctions_default_value);
	zend_string *property_classFunctions_name = zend_string_init("classFunctions", sizeof("classFunctions") - 1, 1);
	zend_declare_typed_property(class_entry, property_classFunctions_name, &property_classFunctions_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_classFunctions_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_Frame(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "Frame", class_Polyspec_Template_Render_Frame_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_name_default_value;
	ZVAL_UNDEF(&property_name_default_value);
	zend_string *property_name_name = zend_string_init("name", sizeof("name") - 1, 1);
	zend_declare_typed_property(class_entry, property_name_name, &property_name_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_name_name);

	zval property_lines_default_value;
	ZVAL_UNDEF(&property_lines_default_value);
	zend_string *property_lines_name = zend_string_init("lines", sizeof("lines") - 1, 1);
	zend_declare_typed_property(class_entry, property_lines_name, &property_lines_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY|MAY_BE_NULL));
	zend_string_release(property_lines_name);

	zval property_context_default_value;
	ZVAL_UNDEF(&property_context_default_value);
	zend_string *property_context_name = zend_string_init("context", sizeof("context") - 1, 1);
	zend_string *property_context_class_Polyspec_Template_Value_MapValue = zend_string_init("Polyspec\\Template\\Value\\MapValue", sizeof("Polyspec\\Template\\Value\\MapValue")-1, 1);
	zend_declare_typed_property(class_entry, property_context_name, &property_context_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_context_class_Polyspec_Template_Value_MapValue, 0, 0));
	zend_string_release(property_context_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_Scope(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "Scope", class_Polyspec_Template_Render_Scope_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_locals_default_value;
	ZVAL_UNDEF(&property_locals_default_value);
	zend_string *property_locals_name = zend_string_init("locals", sizeof("locals") - 1, 1);
	zend_string *property_locals_class_Polyspec_Template_Value_MapValue = zend_string_init("Polyspec\\Template\\Value\\MapValue", sizeof("Polyspec\\Template\\Value\\MapValue")-1, 1);
	zend_declare_typed_property(class_entry, property_locals_name, &property_locals_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_locals_class_Polyspec_Template_Value_MapValue, 0, 0));
	zend_string_release(property_locals_name);

	zval property_loops_default_value;
	ZVAL_UNDEF(&property_loops_default_value);
	zend_string *property_loops_name = zend_string_init("loops", sizeof("loops") - 1, 1);
	zend_string *property_loops_class_ArrayObject = zend_string_init("ArrayObject", sizeof("ArrayObject")-1, 1);
	zend_declare_typed_property(class_entry, property_loops_name, &property_loops_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_loops_class_ArrayObject, 0, 0));
	zend_string_release(property_loops_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_Context(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "Context", class_Polyspec_Template_Render_Context_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_registry_default_value;
	ZVAL_EMPTY_ARRAY(&property_registry_default_value);
	zend_string *property_registry_name = zend_string_init("registry", sizeof("registry") - 1, 1);
	zend_declare_typed_property(class_entry, property_registry_name, &property_registry_default_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_registry_name);

	zval property_chain_default_value;
	ZVAL_EMPTY_ARRAY(&property_chain_default_value);
	zend_string *property_chain_name = zend_string_init("chain", sizeof("chain") - 1, 1);
	zend_declare_typed_property(class_entry, property_chain_name, &property_chain_default_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_chain_name);

	zval property_iterations_default_value;
	ZVAL_LONG(&property_iterations_default_value, 0);
	zend_string *property_iterations_name = zend_string_init("iterations", sizeof("iterations") - 1, 1);
	zend_declare_typed_property(class_entry, property_iterations_name, &property_iterations_default_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_iterations_name);

	zval property_output_default_value;
	ZVAL_EMPTY_STRING(&property_output_default_value);
	zend_string *property_output_name = zend_string_init("output", sizeof("output") - 1, 1);
	zend_declare_typed_property(class_entry, property_output_name, &property_output_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_output_name);

	zval property_outputBytes_default_value;
	ZVAL_LONG(&property_outputBytes_default_value, 0);
	zend_string *property_outputBytes_name = zend_string_init("outputBytes", sizeof("outputBytes") - 1, 1);
	zend_declare_typed_property(class_entry, property_outputBytes_name, &property_outputBytes_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_outputBytes_name);

	zval property_currentFrame_default_value;
	ZVAL_NULL(&property_currentFrame_default_value);
	zend_string *property_currentFrame_name = zend_string_init("currentFrame", sizeof("currentFrame") - 1, 1);
	zend_string *property_currentFrame_class_Polyspec_Template_Render_Frame = zend_string_init("Polyspec\\Template\\Render\\Frame", sizeof("Polyspec\\Template\\Render\\Frame")-1, 1);
	zend_declare_typed_property(class_entry, property_currentFrame_name, &property_currentFrame_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_currentFrame_class_Polyspec_Template_Render_Frame, 0, MAY_BE_NULL));
	zend_string_release(property_currentFrame_name);

	zval property_currentSpan_default_value;
	ZVAL_UNDEF(&property_currentSpan_default_value);
	zend_string *property_currentSpan_name = zend_string_init("currentSpan", sizeof("currentSpan") - 1, 1);
	zend_declare_typed_property(class_entry, property_currentSpan_name, &property_currentSpan_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_currentSpan_name);

	zval property_services_default_value;
	ZVAL_UNDEF(&property_services_default_value);
	zend_string *property_services_name = zend_string_init("services", sizeof("services") - 1, 1);
	zend_string *property_services_class_Polyspec_Template_Render_RuntimeServices = zend_string_init("Polyspec\\Template\\Render\\RuntimeServices", sizeof("Polyspec\\Template\\Render\\RuntimeServices")-1, 1);
	zend_declare_typed_property(class_entry, property_services_name, &property_services_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_services_class_Polyspec_Template_Render_RuntimeServices, 0, 0));
	zend_string_release(property_services_name);

	zval property_rootData_default_value;
	ZVAL_UNDEF(&property_rootData_default_value);
	zend_string *property_rootData_name = zend_string_init("rootData", sizeof("rootData") - 1, 1);
	zend_string *property_rootData_class_Polyspec_Template_Value_MapValue = zend_string_init("Polyspec\\Template\\Value\\MapValue", sizeof("Polyspec\\Template\\Value\\MapValue")-1, 1);
	zend_declare_typed_property(class_entry, property_rootData_name, &property_rootData_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_rootData_class_Polyspec_Template_Value_MapValue, 0, 0));
	zend_string_release(property_rootData_name);

	zval property_env_default_value;
	ZVAL_UNDEF(&property_env_default_value);
	zend_string *property_env_name = zend_string_init("env", sizeof("env") - 1, 1);
	zend_declare_typed_property(class_entry, property_env_name, &property_env_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_env_name);

	zval property_entryName_default_value;
	ZVAL_UNDEF(&property_entryName_default_value);
	zend_string *property_entryName_name = zend_string_init("entryName", sizeof("entryName") - 1, 1);
	zend_declare_typed_property(class_entry, property_entryName_name, &property_entryName_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_entryName_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_RuntimeBindings(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "RuntimeBindings", class_Polyspec_Template_Render_RuntimeBindings_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_Evaluator(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "Evaluator", class_Polyspec_Template_Render_Evaluator_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_runtime_default_value;
	ZVAL_UNDEF(&property_runtime_default_value);
	zend_string *property_runtime_name = zend_string_init("runtime", sizeof("runtime") - 1, 1);
	zend_string *property_runtime_class_Polyspec_Template_Render_RuntimeBindings = zend_string_init("Polyspec\\Template\\Render\\RuntimeBindings", sizeof("Polyspec\\Template\\Render\\RuntimeBindings")-1, 1);
	zend_declare_typed_property(class_entry, property_runtime_name, &property_runtime_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_runtime_class_Polyspec_Template_Render_RuntimeBindings, 0, 0));
	zend_string_release(property_runtime_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Render_Renderer(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Render", "Renderer", class_Polyspec_Template_Render_Renderer_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_ErrorCode(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "ErrorCode", NULL);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval const_E_LEX_INVALID_UTF8_value;
	zend_string *const_E_LEX_INVALID_UTF8_value_str = zend_string_init("E_LEX_INVALID_UTF8", strlen("E_LEX_INVALID_UTF8"), 1);
	ZVAL_STR(&const_E_LEX_INVALID_UTF8_value, const_E_LEX_INVALID_UTF8_value_str);
	zend_string *const_E_LEX_INVALID_UTF8_name = zend_string_init_interned("E_LEX_INVALID_UTF8", sizeof("E_LEX_INVALID_UTF8") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_LEX_INVALID_UTF8_name, &const_E_LEX_INVALID_UTF8_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_LEX_INVALID_UTF8_name, &const_E_LEX_INVALID_UTF8_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_LEX_INVALID_UTF8_name);

	zval const_E_PARSE_UNTERMINATED_TAG_value;
	zend_string *const_E_PARSE_UNTERMINATED_TAG_value_str = zend_string_init("E_PARSE_UNTERMINATED_TAG", strlen("E_PARSE_UNTERMINATED_TAG"), 1);
	ZVAL_STR(&const_E_PARSE_UNTERMINATED_TAG_value, const_E_PARSE_UNTERMINATED_TAG_value_str);
	zend_string *const_E_PARSE_UNTERMINATED_TAG_name = zend_string_init_interned("E_PARSE_UNTERMINATED_TAG", sizeof("E_PARSE_UNTERMINATED_TAG") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_UNTERMINATED_TAG_name, &const_E_PARSE_UNTERMINATED_TAG_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_UNTERMINATED_TAG_name, &const_E_PARSE_UNTERMINATED_TAG_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_UNTERMINATED_TAG_name);

	zval const_E_PARSE_UNTERMINATED_COMMENT_value;
	zend_string *const_E_PARSE_UNTERMINATED_COMMENT_value_str = zend_string_init("E_PARSE_UNTERMINATED_COMMENT", strlen("E_PARSE_UNTERMINATED_COMMENT"), 1);
	ZVAL_STR(&const_E_PARSE_UNTERMINATED_COMMENT_value, const_E_PARSE_UNTERMINATED_COMMENT_value_str);
	zend_string *const_E_PARSE_UNTERMINATED_COMMENT_name = zend_string_init_interned("E_PARSE_UNTERMINATED_COMMENT", sizeof("E_PARSE_UNTERMINATED_COMMENT") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_UNTERMINATED_COMMENT_name, &const_E_PARSE_UNTERMINATED_COMMENT_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_UNTERMINATED_COMMENT_name, &const_E_PARSE_UNTERMINATED_COMMENT_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_UNTERMINATED_COMMENT_name);

	zval const_E_PARSE_UNTERMINATED_STRING_value;
	zend_string *const_E_PARSE_UNTERMINATED_STRING_value_str = zend_string_init("E_PARSE_UNTERMINATED_STRING", strlen("E_PARSE_UNTERMINATED_STRING"), 1);
	ZVAL_STR(&const_E_PARSE_UNTERMINATED_STRING_value, const_E_PARSE_UNTERMINATED_STRING_value_str);
	zend_string *const_E_PARSE_UNTERMINATED_STRING_name = zend_string_init_interned("E_PARSE_UNTERMINATED_STRING", sizeof("E_PARSE_UNTERMINATED_STRING") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_UNTERMINATED_STRING_name, &const_E_PARSE_UNTERMINATED_STRING_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_UNTERMINATED_STRING_name, &const_E_PARSE_UNTERMINATED_STRING_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_UNTERMINATED_STRING_name);

	zval const_E_PARSE_UNEXPECTED_TOKEN_value;
	zend_string *const_E_PARSE_UNEXPECTED_TOKEN_value_str = zend_string_init("E_PARSE_UNEXPECTED_TOKEN", strlen("E_PARSE_UNEXPECTED_TOKEN"), 1);
	ZVAL_STR(&const_E_PARSE_UNEXPECTED_TOKEN_value, const_E_PARSE_UNEXPECTED_TOKEN_value_str);
	zend_string *const_E_PARSE_UNEXPECTED_TOKEN_name = zend_string_init_interned("E_PARSE_UNEXPECTED_TOKEN", sizeof("E_PARSE_UNEXPECTED_TOKEN") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_UNEXPECTED_TOKEN_name, &const_E_PARSE_UNEXPECTED_TOKEN_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_UNEXPECTED_TOKEN_name, &const_E_PARSE_UNEXPECTED_TOKEN_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_UNEXPECTED_TOKEN_name);

	zval const_E_PARSE_INVALID_NUMBER_value;
	zend_string *const_E_PARSE_INVALID_NUMBER_value_str = zend_string_init("E_PARSE_INVALID_NUMBER", strlen("E_PARSE_INVALID_NUMBER"), 1);
	ZVAL_STR(&const_E_PARSE_INVALID_NUMBER_value, const_E_PARSE_INVALID_NUMBER_value_str);
	zend_string *const_E_PARSE_INVALID_NUMBER_name = zend_string_init_interned("E_PARSE_INVALID_NUMBER", sizeof("E_PARSE_INVALID_NUMBER") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_INVALID_NUMBER_name, &const_E_PARSE_INVALID_NUMBER_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_INVALID_NUMBER_name, &const_E_PARSE_INVALID_NUMBER_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_INVALID_NUMBER_name);

	zval const_E_PARSE_INVALID_ESCAPE_value;
	zend_string *const_E_PARSE_INVALID_ESCAPE_value_str = zend_string_init("E_PARSE_INVALID_ESCAPE", strlen("E_PARSE_INVALID_ESCAPE"), 1);
	ZVAL_STR(&const_E_PARSE_INVALID_ESCAPE_value, const_E_PARSE_INVALID_ESCAPE_value_str);
	zend_string *const_E_PARSE_INVALID_ESCAPE_name = zend_string_init_interned("E_PARSE_INVALID_ESCAPE", sizeof("E_PARSE_INVALID_ESCAPE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_INVALID_ESCAPE_name, &const_E_PARSE_INVALID_ESCAPE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_INVALID_ESCAPE_name, &const_E_PARSE_INVALID_ESCAPE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_INVALID_ESCAPE_name);

	zval const_E_PARSE_UNEXPECTED_CLOSE_value;
	zend_string *const_E_PARSE_UNEXPECTED_CLOSE_value_str = zend_string_init("E_PARSE_UNEXPECTED_CLOSE", strlen("E_PARSE_UNEXPECTED_CLOSE"), 1);
	ZVAL_STR(&const_E_PARSE_UNEXPECTED_CLOSE_value, const_E_PARSE_UNEXPECTED_CLOSE_value_str);
	zend_string *const_E_PARSE_UNEXPECTED_CLOSE_name = zend_string_init_interned("E_PARSE_UNEXPECTED_CLOSE", sizeof("E_PARSE_UNEXPECTED_CLOSE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_UNEXPECTED_CLOSE_name, &const_E_PARSE_UNEXPECTED_CLOSE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_UNEXPECTED_CLOSE_name, &const_E_PARSE_UNEXPECTED_CLOSE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_UNEXPECTED_CLOSE_name);

	zval const_E_PARSE_UNCLOSED_BLOCK_value;
	zend_string *const_E_PARSE_UNCLOSED_BLOCK_value_str = zend_string_init("E_PARSE_UNCLOSED_BLOCK", strlen("E_PARSE_UNCLOSED_BLOCK"), 1);
	ZVAL_STR(&const_E_PARSE_UNCLOSED_BLOCK_value, const_E_PARSE_UNCLOSED_BLOCK_value_str);
	zend_string *const_E_PARSE_UNCLOSED_BLOCK_name = zend_string_init_interned("E_PARSE_UNCLOSED_BLOCK", sizeof("E_PARSE_UNCLOSED_BLOCK") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_UNCLOSED_BLOCK_name, &const_E_PARSE_UNCLOSED_BLOCK_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_UNCLOSED_BLOCK_name, &const_E_PARSE_UNCLOSED_BLOCK_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_UNCLOSED_BLOCK_name);

	zval const_E_PARSE_ELSE_OUTSIDE_BLOCK_value;
	zend_string *const_E_PARSE_ELSE_OUTSIDE_BLOCK_value_str = zend_string_init("E_PARSE_ELSE_OUTSIDE_BLOCK", strlen("E_PARSE_ELSE_OUTSIDE_BLOCK"), 1);
	ZVAL_STR(&const_E_PARSE_ELSE_OUTSIDE_BLOCK_value, const_E_PARSE_ELSE_OUTSIDE_BLOCK_value_str);
	zend_string *const_E_PARSE_ELSE_OUTSIDE_BLOCK_name = zend_string_init_interned("E_PARSE_ELSE_OUTSIDE_BLOCK", sizeof("E_PARSE_ELSE_OUTSIDE_BLOCK") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_ELSE_OUTSIDE_BLOCK_name, &const_E_PARSE_ELSE_OUTSIDE_BLOCK_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_ELSE_OUTSIDE_BLOCK_name, &const_E_PARSE_ELSE_OUTSIDE_BLOCK_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_ELSE_OUTSIDE_BLOCK_name);

	zval const_E_PARSE_DUPLICATE_ELSE_value;
	zend_string *const_E_PARSE_DUPLICATE_ELSE_value_str = zend_string_init("E_PARSE_DUPLICATE_ELSE", strlen("E_PARSE_DUPLICATE_ELSE"), 1);
	ZVAL_STR(&const_E_PARSE_DUPLICATE_ELSE_value, const_E_PARSE_DUPLICATE_ELSE_value_str);
	zend_string *const_E_PARSE_DUPLICATE_ELSE_name = zend_string_init_interned("E_PARSE_DUPLICATE_ELSE", sizeof("E_PARSE_DUPLICATE_ELSE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_DUPLICATE_ELSE_name, &const_E_PARSE_DUPLICATE_ELSE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_DUPLICATE_ELSE_name, &const_E_PARSE_DUPLICATE_ELSE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_DUPLICATE_ELSE_name);

	zval const_E_PARSE_ELSEIF_AFTER_ELSE_value;
	zend_string *const_E_PARSE_ELSEIF_AFTER_ELSE_value_str = zend_string_init("E_PARSE_ELSEIF_AFTER_ELSE", strlen("E_PARSE_ELSEIF_AFTER_ELSE"), 1);
	ZVAL_STR(&const_E_PARSE_ELSEIF_AFTER_ELSE_value, const_E_PARSE_ELSEIF_AFTER_ELSE_value_str);
	zend_string *const_E_PARSE_ELSEIF_AFTER_ELSE_name = zend_string_init_interned("E_PARSE_ELSEIF_AFTER_ELSE", sizeof("E_PARSE_ELSEIF_AFTER_ELSE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_ELSEIF_AFTER_ELSE_name, &const_E_PARSE_ELSEIF_AFTER_ELSE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_ELSEIF_AFTER_ELSE_name, &const_E_PARSE_ELSEIF_AFTER_ELSE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_ELSEIF_AFTER_ELSE_name);

	zval const_E_PARSE_ELSEIF_NOT_IN_IF_value;
	zend_string *const_E_PARSE_ELSEIF_NOT_IN_IF_value_str = zend_string_init("E_PARSE_ELSEIF_NOT_IN_IF", strlen("E_PARSE_ELSEIF_NOT_IN_IF"), 1);
	ZVAL_STR(&const_E_PARSE_ELSEIF_NOT_IN_IF_value, const_E_PARSE_ELSEIF_NOT_IN_IF_value_str);
	zend_string *const_E_PARSE_ELSEIF_NOT_IN_IF_name = zend_string_init_interned("E_PARSE_ELSEIF_NOT_IN_IF", sizeof("E_PARSE_ELSEIF_NOT_IN_IF") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_ELSEIF_NOT_IN_IF_name, &const_E_PARSE_ELSEIF_NOT_IN_IF_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_ELSEIF_NOT_IN_IF_name, &const_E_PARSE_ELSEIF_NOT_IN_IF_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_ELSEIF_NOT_IN_IF_name);

	zval const_E_PARSE_RESERVED_NAME_value;
	zend_string *const_E_PARSE_RESERVED_NAME_value_str = zend_string_init("E_PARSE_RESERVED_NAME", strlen("E_PARSE_RESERVED_NAME"), 1);
	ZVAL_STR(&const_E_PARSE_RESERVED_NAME_value, const_E_PARSE_RESERVED_NAME_value_str);
	zend_string *const_E_PARSE_RESERVED_NAME_name = zend_string_init_interned("E_PARSE_RESERVED_NAME", sizeof("E_PARSE_RESERVED_NAME") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_RESERVED_NAME_name, &const_E_PARSE_RESERVED_NAME_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_RESERVED_NAME_name, &const_E_PARSE_RESERVED_NAME_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_RESERVED_NAME_name);

	zval const_E_PARSE_INVALID_PATH_value;
	zend_string *const_E_PARSE_INVALID_PATH_value_str = zend_string_init("E_PARSE_INVALID_PATH", strlen("E_PARSE_INVALID_PATH"), 1);
	ZVAL_STR(&const_E_PARSE_INVALID_PATH_value, const_E_PARSE_INVALID_PATH_value_str);
	zend_string *const_E_PARSE_INVALID_PATH_name = zend_string_init_interned("E_PARSE_INVALID_PATH", sizeof("E_PARSE_INVALID_PATH") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_INVALID_PATH_name, &const_E_PARSE_INVALID_PATH_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_INVALID_PATH_name, &const_E_PARSE_INVALID_PATH_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_INVALID_PATH_name);

	zval const_E_PARSE_INVALID_BLOCK_TAG_value;
	zend_string *const_E_PARSE_INVALID_BLOCK_TAG_value_str = zend_string_init("E_PARSE_INVALID_BLOCK_TAG", strlen("E_PARSE_INVALID_BLOCK_TAG"), 1);
	ZVAL_STR(&const_E_PARSE_INVALID_BLOCK_TAG_value, const_E_PARSE_INVALID_BLOCK_TAG_value_str);
	zend_string *const_E_PARSE_INVALID_BLOCK_TAG_name = zend_string_init_interned("E_PARSE_INVALID_BLOCK_TAG", sizeof("E_PARSE_INVALID_BLOCK_TAG") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_INVALID_BLOCK_TAG_name, &const_E_PARSE_INVALID_BLOCK_TAG_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_INVALID_BLOCK_TAG_name, &const_E_PARSE_INVALID_BLOCK_TAG_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_INVALID_BLOCK_TAG_name);

	zval const_E_PARSE_INVALID_WRAPPER_value;
	zend_string *const_E_PARSE_INVALID_WRAPPER_value_str = zend_string_init("E_PARSE_INVALID_WRAPPER", strlen("E_PARSE_INVALID_WRAPPER"), 1);
	ZVAL_STR(&const_E_PARSE_INVALID_WRAPPER_value, const_E_PARSE_INVALID_WRAPPER_value_str);
	zend_string *const_E_PARSE_INVALID_WRAPPER_name = zend_string_init_interned("E_PARSE_INVALID_WRAPPER", sizeof("E_PARSE_INVALID_WRAPPER") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_INVALID_WRAPPER_name, &const_E_PARSE_INVALID_WRAPPER_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_INVALID_WRAPPER_name, &const_E_PARSE_INVALID_WRAPPER_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_INVALID_WRAPPER_name);

	zval const_E_PARSE_INVALID_DIRECTIVE_value;
	zend_string *const_E_PARSE_INVALID_DIRECTIVE_value_str = zend_string_init("E_PARSE_INVALID_DIRECTIVE", strlen("E_PARSE_INVALID_DIRECTIVE"), 1);
	ZVAL_STR(&const_E_PARSE_INVALID_DIRECTIVE_value, const_E_PARSE_INVALID_DIRECTIVE_value_str);
	zend_string *const_E_PARSE_INVALID_DIRECTIVE_name = zend_string_init_interned("E_PARSE_INVALID_DIRECTIVE", sizeof("E_PARSE_INVALID_DIRECTIVE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_PARSE_INVALID_DIRECTIVE_name, &const_E_PARSE_INVALID_DIRECTIVE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_PARSE_INVALID_DIRECTIVE_name, &const_E_PARSE_INVALID_DIRECTIVE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_PARSE_INVALID_DIRECTIVE_name);

	zval const_E_LOAD_NOT_FOUND_value;
	zend_string *const_E_LOAD_NOT_FOUND_value_str = zend_string_init("E_LOAD_NOT_FOUND", strlen("E_LOAD_NOT_FOUND"), 1);
	ZVAL_STR(&const_E_LOAD_NOT_FOUND_value, const_E_LOAD_NOT_FOUND_value_str);
	zend_string *const_E_LOAD_NOT_FOUND_name = zend_string_init_interned("E_LOAD_NOT_FOUND", sizeof("E_LOAD_NOT_FOUND") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_LOAD_NOT_FOUND_name, &const_E_LOAD_NOT_FOUND_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_LOAD_NOT_FOUND_name, &const_E_LOAD_NOT_FOUND_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_LOAD_NOT_FOUND_name);

	zval const_E_LOAD_CYCLE_value;
	zend_string *const_E_LOAD_CYCLE_value_str = zend_string_init("E_LOAD_CYCLE", strlen("E_LOAD_CYCLE"), 1);
	ZVAL_STR(&const_E_LOAD_CYCLE_value, const_E_LOAD_CYCLE_value_str);
	zend_string *const_E_LOAD_CYCLE_name = zend_string_init_interned("E_LOAD_CYCLE", sizeof("E_LOAD_CYCLE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_LOAD_CYCLE_name, &const_E_LOAD_CYCLE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_LOAD_CYCLE_name, &const_E_LOAD_CYCLE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_LOAD_CYCLE_name);

	zval const_E_LOAD_OUTSIDE_ROOT_value;
	zend_string *const_E_LOAD_OUTSIDE_ROOT_value_str = zend_string_init("E_LOAD_OUTSIDE_ROOT", strlen("E_LOAD_OUTSIDE_ROOT"), 1);
	ZVAL_STR(&const_E_LOAD_OUTSIDE_ROOT_value, const_E_LOAD_OUTSIDE_ROOT_value_str);
	zend_string *const_E_LOAD_OUTSIDE_ROOT_name = zend_string_init_interned("E_LOAD_OUTSIDE_ROOT", sizeof("E_LOAD_OUTSIDE_ROOT") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_LOAD_OUTSIDE_ROOT_name, &const_E_LOAD_OUTSIDE_ROOT_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_LOAD_OUTSIDE_ROOT_name, &const_E_LOAD_OUTSIDE_ROOT_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_LOAD_OUTSIDE_ROOT_name);

	zval const_E_LOAD_FAILED_value;
	zend_string *const_E_LOAD_FAILED_value_str = zend_string_init("E_LOAD_FAILED", strlen("E_LOAD_FAILED"), 1);
	ZVAL_STR(&const_E_LOAD_FAILED_value, const_E_LOAD_FAILED_value_str);
	zend_string *const_E_LOAD_FAILED_name = zend_string_init_interned("E_LOAD_FAILED", sizeof("E_LOAD_FAILED") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_LOAD_FAILED_name, &const_E_LOAD_FAILED_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_LOAD_FAILED_name, &const_E_LOAD_FAILED_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_LOAD_FAILED_name);

	zval const_E_DATA_NUMBER_RANGE_value;
	zend_string *const_E_DATA_NUMBER_RANGE_value_str = zend_string_init("E_DATA_NUMBER_RANGE", strlen("E_DATA_NUMBER_RANGE"), 1);
	ZVAL_STR(&const_E_DATA_NUMBER_RANGE_value, const_E_DATA_NUMBER_RANGE_value_str);
	zend_string *const_E_DATA_NUMBER_RANGE_name = zend_string_init_interned("E_DATA_NUMBER_RANGE", sizeof("E_DATA_NUMBER_RANGE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_DATA_NUMBER_RANGE_name, &const_E_DATA_NUMBER_RANGE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_DATA_NUMBER_RANGE_name, &const_E_DATA_NUMBER_RANGE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_DATA_NUMBER_RANGE_name);

	zval const_E_DATA_NUMBER_NOT_FINITE_value;
	zend_string *const_E_DATA_NUMBER_NOT_FINITE_value_str = zend_string_init("E_DATA_NUMBER_NOT_FINITE", strlen("E_DATA_NUMBER_NOT_FINITE"), 1);
	ZVAL_STR(&const_E_DATA_NUMBER_NOT_FINITE_value, const_E_DATA_NUMBER_NOT_FINITE_value_str);
	zend_string *const_E_DATA_NUMBER_NOT_FINITE_name = zend_string_init_interned("E_DATA_NUMBER_NOT_FINITE", sizeof("E_DATA_NUMBER_NOT_FINITE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_DATA_NUMBER_NOT_FINITE_name, &const_E_DATA_NUMBER_NOT_FINITE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_DATA_NUMBER_NOT_FINITE_name, &const_E_DATA_NUMBER_NOT_FINITE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_DATA_NUMBER_NOT_FINITE_name);

	zval const_E_DATA_INVALID_UTF8_value;
	zend_string *const_E_DATA_INVALID_UTF8_value_str = zend_string_init("E_DATA_INVALID_UTF8", strlen("E_DATA_INVALID_UTF8"), 1);
	ZVAL_STR(&const_E_DATA_INVALID_UTF8_value, const_E_DATA_INVALID_UTF8_value_str);
	zend_string *const_E_DATA_INVALID_UTF8_name = zend_string_init_interned("E_DATA_INVALID_UTF8", sizeof("E_DATA_INVALID_UTF8") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_DATA_INVALID_UTF8_name, &const_E_DATA_INVALID_UTF8_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_DATA_INVALID_UTF8_name, &const_E_DATA_INVALID_UTF8_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_DATA_INVALID_UTF8_name);

	zval const_E_DATA_UNSUPPORTED_TYPE_value;
	zend_string *const_E_DATA_UNSUPPORTED_TYPE_value_str = zend_string_init("E_DATA_UNSUPPORTED_TYPE", strlen("E_DATA_UNSUPPORTED_TYPE"), 1);
	ZVAL_STR(&const_E_DATA_UNSUPPORTED_TYPE_value, const_E_DATA_UNSUPPORTED_TYPE_value_str);
	zend_string *const_E_DATA_UNSUPPORTED_TYPE_name = zend_string_init_interned("E_DATA_UNSUPPORTED_TYPE", sizeof("E_DATA_UNSUPPORTED_TYPE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_DATA_UNSUPPORTED_TYPE_name, &const_E_DATA_UNSUPPORTED_TYPE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_DATA_UNSUPPORTED_TYPE_name, &const_E_DATA_UNSUPPORTED_TYPE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_DATA_UNSUPPORTED_TYPE_name);

	zval const_E_DATA_DEPTH_value;
	zend_string *const_E_DATA_DEPTH_value_str = zend_string_init("E_DATA_DEPTH", strlen("E_DATA_DEPTH"), 1);
	ZVAL_STR(&const_E_DATA_DEPTH_value, const_E_DATA_DEPTH_value_str);
	zend_string *const_E_DATA_DEPTH_name = zend_string_init_interned("E_DATA_DEPTH", sizeof("E_DATA_DEPTH") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_DATA_DEPTH_name, &const_E_DATA_DEPTH_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_DATA_DEPTH_name, &const_E_DATA_DEPTH_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_DATA_DEPTH_name);

	zval const_E_DATA_INVALID_JSON_value;
	zend_string *const_E_DATA_INVALID_JSON_value_str = zend_string_init("E_DATA_INVALID_JSON", strlen("E_DATA_INVALID_JSON"), 1);
	ZVAL_STR(&const_E_DATA_INVALID_JSON_value, const_E_DATA_INVALID_JSON_value_str);
	zend_string *const_E_DATA_INVALID_JSON_name = zend_string_init_interned("E_DATA_INVALID_JSON", sizeof("E_DATA_INVALID_JSON") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_DATA_INVALID_JSON_name, &const_E_DATA_INVALID_JSON_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_DATA_INVALID_JSON_name, &const_E_DATA_INVALID_JSON_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_DATA_INVALID_JSON_name);

	zval const_E_RUNTIME_TYPE_value;
	zend_string *const_E_RUNTIME_TYPE_value_str = zend_string_init("E_RUNTIME_TYPE", strlen("E_RUNTIME_TYPE"), 1);
	ZVAL_STR(&const_E_RUNTIME_TYPE_value, const_E_RUNTIME_TYPE_value_str);
	zend_string *const_E_RUNTIME_TYPE_name = zend_string_init_interned("E_RUNTIME_TYPE", sizeof("E_RUNTIME_TYPE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_TYPE_name, &const_E_RUNTIME_TYPE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_TYPE_name, &const_E_RUNTIME_TYPE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_TYPE_name);

	zval const_E_RUNTIME_COMPARE_value;
	zend_string *const_E_RUNTIME_COMPARE_value_str = zend_string_init("E_RUNTIME_COMPARE", strlen("E_RUNTIME_COMPARE"), 1);
	ZVAL_STR(&const_E_RUNTIME_COMPARE_value, const_E_RUNTIME_COMPARE_value_str);
	zend_string *const_E_RUNTIME_COMPARE_name = zend_string_init_interned("E_RUNTIME_COMPARE", sizeof("E_RUNTIME_COMPARE") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_COMPARE_name, &const_E_RUNTIME_COMPARE_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_COMPARE_name, &const_E_RUNTIME_COMPARE_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_COMPARE_name);

	zval const_E_RUNTIME_DIV_ZERO_value;
	zend_string *const_E_RUNTIME_DIV_ZERO_value_str = zend_string_init("E_RUNTIME_DIV_ZERO", strlen("E_RUNTIME_DIV_ZERO"), 1);
	ZVAL_STR(&const_E_RUNTIME_DIV_ZERO_value, const_E_RUNTIME_DIV_ZERO_value_str);
	zend_string *const_E_RUNTIME_DIV_ZERO_name = zend_string_init_interned("E_RUNTIME_DIV_ZERO", sizeof("E_RUNTIME_DIV_ZERO") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_DIV_ZERO_name, &const_E_RUNTIME_DIV_ZERO_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_DIV_ZERO_name, &const_E_RUNTIME_DIV_ZERO_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_DIV_ZERO_name);

	zval const_E_RUNTIME_STRINGIFY_value;
	zend_string *const_E_RUNTIME_STRINGIFY_value_str = zend_string_init("E_RUNTIME_STRINGIFY", strlen("E_RUNTIME_STRINGIFY"), 1);
	ZVAL_STR(&const_E_RUNTIME_STRINGIFY_value, const_E_RUNTIME_STRINGIFY_value_str);
	zend_string *const_E_RUNTIME_STRINGIFY_name = zend_string_init_interned("E_RUNTIME_STRINGIFY", sizeof("E_RUNTIME_STRINGIFY") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_STRINGIFY_name, &const_E_RUNTIME_STRINGIFY_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_STRINGIFY_name, &const_E_RUNTIME_STRINGIFY_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_STRINGIFY_name);

	zval const_E_RUNTIME_UNKNOWN_FUNCTION_value;
	zend_string *const_E_RUNTIME_UNKNOWN_FUNCTION_value_str = zend_string_init("E_RUNTIME_UNKNOWN_FUNCTION", strlen("E_RUNTIME_UNKNOWN_FUNCTION"), 1);
	ZVAL_STR(&const_E_RUNTIME_UNKNOWN_FUNCTION_value, const_E_RUNTIME_UNKNOWN_FUNCTION_value_str);
	zend_string *const_E_RUNTIME_UNKNOWN_FUNCTION_name = zend_string_init_interned("E_RUNTIME_UNKNOWN_FUNCTION", sizeof("E_RUNTIME_UNKNOWN_FUNCTION") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_UNKNOWN_FUNCTION_name, &const_E_RUNTIME_UNKNOWN_FUNCTION_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_UNKNOWN_FUNCTION_name, &const_E_RUNTIME_UNKNOWN_FUNCTION_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_UNKNOWN_FUNCTION_name);

	zval const_E_RUNTIME_ARITY_value;
	zend_string *const_E_RUNTIME_ARITY_value_str = zend_string_init("E_RUNTIME_ARITY", strlen("E_RUNTIME_ARITY"), 1);
	ZVAL_STR(&const_E_RUNTIME_ARITY_value, const_E_RUNTIME_ARITY_value_str);
	zend_string *const_E_RUNTIME_ARITY_name = zend_string_init_interned("E_RUNTIME_ARITY", sizeof("E_RUNTIME_ARITY") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_ARITY_name, &const_E_RUNTIME_ARITY_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_ARITY_name, &const_E_RUNTIME_ARITY_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_ARITY_name);

	zval const_E_RUNTIME_HOST_FUNCTION_value;
	zend_string *const_E_RUNTIME_HOST_FUNCTION_value_str = zend_string_init("E_RUNTIME_HOST_FUNCTION", strlen("E_RUNTIME_HOST_FUNCTION"), 1);
	ZVAL_STR(&const_E_RUNTIME_HOST_FUNCTION_value, const_E_RUNTIME_HOST_FUNCTION_value_str);
	zend_string *const_E_RUNTIME_HOST_FUNCTION_name = zend_string_init_interned("E_RUNTIME_HOST_FUNCTION", sizeof("E_RUNTIME_HOST_FUNCTION") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_HOST_FUNCTION_name, &const_E_RUNTIME_HOST_FUNCTION_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_HOST_FUNCTION_name, &const_E_RUNTIME_HOST_FUNCTION_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_HOST_FUNCTION_name);

	zval const_E_RUNTIME_UNKNOWN_LOOP_value;
	zend_string *const_E_RUNTIME_UNKNOWN_LOOP_value_str = zend_string_init("E_RUNTIME_UNKNOWN_LOOP", strlen("E_RUNTIME_UNKNOWN_LOOP"), 1);
	ZVAL_STR(&const_E_RUNTIME_UNKNOWN_LOOP_value, const_E_RUNTIME_UNKNOWN_LOOP_value_str);
	zend_string *const_E_RUNTIME_UNKNOWN_LOOP_name = zend_string_init_interned("E_RUNTIME_UNKNOWN_LOOP", sizeof("E_RUNTIME_UNKNOWN_LOOP") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_UNKNOWN_LOOP_name, &const_E_RUNTIME_UNKNOWN_LOOP_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_UNKNOWN_LOOP_name, &const_E_RUNTIME_UNKNOWN_LOOP_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_UNKNOWN_LOOP_name);

	zval const_E_RUNTIME_BLOCK_UNDEFINED_value;
	zend_string *const_E_RUNTIME_BLOCK_UNDEFINED_value_str = zend_string_init("E_RUNTIME_BLOCK_UNDEFINED", strlen("E_RUNTIME_BLOCK_UNDEFINED"), 1);
	ZVAL_STR(&const_E_RUNTIME_BLOCK_UNDEFINED_value, const_E_RUNTIME_BLOCK_UNDEFINED_value_str);
	zend_string *const_E_RUNTIME_BLOCK_UNDEFINED_name = zend_string_init_interned("E_RUNTIME_BLOCK_UNDEFINED", sizeof("E_RUNTIME_BLOCK_UNDEFINED") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_BLOCK_UNDEFINED_name, &const_E_RUNTIME_BLOCK_UNDEFINED_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_BLOCK_UNDEFINED_name, &const_E_RUNTIME_BLOCK_UNDEFINED_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_BLOCK_UNDEFINED_name);

	zval const_E_RUNTIME_BLOCK_REDEFINED_value;
	zend_string *const_E_RUNTIME_BLOCK_REDEFINED_value_str = zend_string_init("E_RUNTIME_BLOCK_REDEFINED", strlen("E_RUNTIME_BLOCK_REDEFINED"), 1);
	ZVAL_STR(&const_E_RUNTIME_BLOCK_REDEFINED_value, const_E_RUNTIME_BLOCK_REDEFINED_value_str);
	zend_string *const_E_RUNTIME_BLOCK_REDEFINED_name = zend_string_init_interned("E_RUNTIME_BLOCK_REDEFINED", sizeof("E_RUNTIME_BLOCK_REDEFINED") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_BLOCK_REDEFINED_name, &const_E_RUNTIME_BLOCK_REDEFINED_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_BLOCK_REDEFINED_name, &const_E_RUNTIME_BLOCK_REDEFINED_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_BLOCK_REDEFINED_name);

	zval const_E_RUNTIME_DEPTH_value;
	zend_string *const_E_RUNTIME_DEPTH_value_str = zend_string_init("E_RUNTIME_DEPTH", strlen("E_RUNTIME_DEPTH"), 1);
	ZVAL_STR(&const_E_RUNTIME_DEPTH_value, const_E_RUNTIME_DEPTH_value_str);
	zend_string *const_E_RUNTIME_DEPTH_name = zend_string_init_interned("E_RUNTIME_DEPTH", sizeof("E_RUNTIME_DEPTH") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_DEPTH_name, &const_E_RUNTIME_DEPTH_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_DEPTH_name, &const_E_RUNTIME_DEPTH_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_DEPTH_name);

	zval const_E_RUNTIME_LIMIT_value;
	zend_string *const_E_RUNTIME_LIMIT_value_str = zend_string_init("E_RUNTIME_LIMIT", strlen("E_RUNTIME_LIMIT"), 1);
	ZVAL_STR(&const_E_RUNTIME_LIMIT_value, const_E_RUNTIME_LIMIT_value_str);
	zend_string *const_E_RUNTIME_LIMIT_name = zend_string_init_interned("E_RUNTIME_LIMIT", sizeof("E_RUNTIME_LIMIT") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_RUNTIME_LIMIT_name, &const_E_RUNTIME_LIMIT_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_RUNTIME_LIMIT_name, &const_E_RUNTIME_LIMIT_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_RUNTIME_LIMIT_name);

	zval const_E_INTERNAL_value;
	zend_string *const_E_INTERNAL_value_str = zend_string_init("E_INTERNAL", strlen("E_INTERNAL"), 1);
	ZVAL_STR(&const_E_INTERNAL_value, const_E_INTERNAL_value_str);
	zend_string *const_E_INTERNAL_name = zend_string_init_interned("E_INTERNAL", sizeof("E_INTERNAL") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_E_INTERNAL_name, &const_E_INTERNAL_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
#else
	zend_declare_class_constant_ex(class_entry, const_E_INTERNAL_name, &const_E_INTERNAL_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_E_INTERNAL_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_TemplateError(zend_class_entry *class_entry_RuntimeException)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "TemplateError", class_Polyspec_Template_TemplateError_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, class_entry_RuntimeException, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, class_entry_RuntimeException);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_errorCode_default_value;
	ZVAL_UNDEF(&property_errorCode_default_value);
	zend_string *property_errorCode_name = zend_string_init("errorCode", sizeof("errorCode") - 1, 1);
	zend_declare_typed_property(class_entry, property_errorCode_name, &property_errorCode_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_errorCode_name);

	zval property_template_default_value;
	ZVAL_UNDEF(&property_template_default_value);
	zend_string *property_template_name = zend_string_init("template", sizeof("template") - 1, 1);
	zend_declare_typed_property(class_entry, property_template_name, &property_template_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_template_name);

	zval property_errorLine_default_value;
	ZVAL_UNDEF(&property_errorLine_default_value);
	zend_string *property_errorLine_name = zend_string_init("errorLine", sizeof("errorLine") - 1, 1);
	zend_declare_typed_property(class_entry, property_errorLine_name, &property_errorLine_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_errorLine_name);

	zval property_errorCol_default_value;
	ZVAL_UNDEF(&property_errorCol_default_value);
	zend_string *property_errorCol_name = zend_string_init("errorCol", sizeof("errorCol") - 1, 1);
	zend_declare_typed_property(class_entry, property_errorCol_name, &property_errorCol_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_errorCol_name);

	zval property_offset_default_value;
	ZVAL_UNDEF(&property_offset_default_value);
	zend_string *property_offset_name = zend_string_init("offset", sizeof("offset") - 1, 1);
	zend_declare_typed_property(class_entry, property_offset_name, &property_offset_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_offset_name);

	zval property_end_default_value;
	ZVAL_UNDEF(&property_end_default_value);
	zend_string *property_end_name = zend_string_init("end", sizeof("end") - 1, 1);
	zend_declare_typed_property(class_entry, property_end_name, &property_end_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_end_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_AstDecodeError(zend_class_entry *class_entry_InvalidArgumentException)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "AstDecodeError", class_Polyspec_Template_AstDecodeError_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, class_entry_InvalidArgumentException, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, class_entry_InvalidArgumentException);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_path_default_value;
	ZVAL_UNDEF(&property_path_default_value);
	zend_string *property_path_name = zend_string_init("path", sizeof("path") - 1, 1);
	zend_declare_typed_property(class_entry, property_path_name, &property_path_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_path_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_AstDecoder(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "AstDecoder", class_Polyspec_Template_AstDecoder_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Program(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "Program", class_Polyspec_Template_Program_methods);
	class_entry = zend_register_internal_interface(&ce);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_PreparedRender(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "PreparedRender", class_Polyspec_Template_PreparedRender_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_name_default_value;
	ZVAL_UNDEF(&property_name_default_value);
	zend_string *property_name_name = zend_string_init("name", sizeof("name") - 1, 1);
	zend_declare_typed_property(class_entry, property_name_name, &property_name_default_value, ZEND_ACC_PRIVATE|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_name_name);

	zval property_execution_default_value;
	ZVAL_UNDEF(&property_execution_default_value);
	zend_string *property_execution_name = zend_string_init("execution", sizeof("execution") - 1, 1);
	zend_string *property_execution_class_Polyspec_Template_PreparedExecution = zend_string_init("Polyspec\\Template\\PreparedExecution", sizeof("Polyspec\\Template\\PreparedExecution")-1, 1);
	zend_declare_typed_property(class_entry, property_execution_name, &property_execution_default_value, ZEND_ACC_PRIVATE|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_execution_class_Polyspec_Template_PreparedExecution, 0, 0));
	zend_string_release(property_execution_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Engine(zend_class_entry *class_entry_Polyspec_Template_Program)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "Engine", class_Polyspec_Template_Engine_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Program);

	zval property_program_default_value;
	ZVAL_UNDEF(&property_program_default_value);
	zend_string *property_program_name = zend_string_init("program", sizeof("program") - 1, 1);
	zend_string *property_program_class_Polyspec_Template_Program = zend_string_init("Polyspec\\Template\\Program", sizeof("Polyspec\\Template\\Program")-1, 1);
	zend_declare_typed_property(class_entry, property_program_name, &property_program_default_value, ZEND_ACC_PRIVATE|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_program_class_Polyspec_Template_Program, 0, 0));
	zend_string_release(property_program_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_PreparedExecution(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "PreparedExecution", class_Polyspec_Template_PreparedExecution_methods);
	class_entry = zend_register_internal_interface(&ce);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_AstPreparedExecution(zend_class_entry *class_entry_Polyspec_Template_PreparedExecution)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "AstPreparedExecution", class_Polyspec_Template_AstPreparedExecution_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_PreparedExecution);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_AstProgram(zend_class_entry *class_entry_Polyspec_Template_Program, zend_class_entry *class_entry_Polyspec_Template_Render_RuntimeServices)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "AstProgram", class_Polyspec_Template_AstProgram_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 2, class_entry_Polyspec_Template_Program, class_entry_Polyspec_Template_Render_RuntimeServices);

	zval property_loader_default_value;
	ZVAL_UNDEF(&property_loader_default_value);
	zend_string *property_loader_name = zend_string_init("loader", sizeof("loader") - 1, 1);
	zend_string *property_loader_class_Polyspec_Template_Loader_LoaderInterface = zend_string_init("Polyspec\\Template\\Loader\\LoaderInterface", sizeof("Polyspec\\Template\\Loader\\LoaderInterface")-1, 1);
	zend_declare_typed_property(class_entry, property_loader_name, &property_loader_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_loader_class_Polyspec_Template_Loader_LoaderInterface, 0, 0));
	zend_string_release(property_loader_name);

	zval property_runtime_default_value;
	ZVAL_UNDEF(&property_runtime_default_value);
	zend_string *property_runtime_name = zend_string_init("runtime", sizeof("runtime") - 1, 1);
	zend_string *property_runtime_class_Polyspec_Template_Render_RuntimeEnvironment = zend_string_init("Polyspec\\Template\\Render\\RuntimeEnvironment", sizeof("Polyspec\\Template\\Render\\RuntimeEnvironment")-1, 1);
	zend_declare_typed_property(class_entry, property_runtime_name, &property_runtime_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_runtime_class_Polyspec_Template_Render_RuntimeEnvironment, 0, 0));
	zend_string_release(property_runtime_name);

	zval property_delimiters_default_value;
	ZVAL_UNDEF(&property_delimiters_default_value);
	zend_string *property_delimiters_name = zend_string_init("delimiters", sizeof("delimiters") - 1, 1);
	zend_declare_typed_property(class_entry, property_delimiters_name, &property_delimiters_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_delimiters_name);

	zval property_artifactRefresh_default_value;
	ZVAL_UNDEF(&property_artifactRefresh_default_value);
	zend_string *property_artifactRefresh_name = zend_string_init("artifactRefresh", sizeof("artifactRefresh") - 1, 1);
	zend_declare_typed_property(class_entry, property_artifactRefresh_name, &property_artifactRefresh_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_artifactRefresh_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_BoundMap(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "BoundMap", class_Polyspec_Template_BoundMap_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_PageCache(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "PageCache", class_Polyspec_Template_PageCache_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Source(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "Source", class_Polyspec_Template_Source_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_lines_default_value;
	ZVAL_UNDEF(&property_lines_default_value);
	zend_string *property_lines_name = zend_string_init("lines", sizeof("lines") - 1, 1);
	zend_declare_typed_property(class_entry, property_lines_name, &property_lines_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_lines_name);

	zval property_name_default_value;
	ZVAL_UNDEF(&property_name_default_value);
	zend_string *property_name_name = zend_string_init("name", sizeof("name") - 1, 1);
	zend_declare_typed_property(class_entry, property_name_name, &property_name_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_name_name);

	zval property_text_default_value;
	ZVAL_UNDEF(&property_text_default_value);
	zend_string *property_text_name = zend_string_init("text", sizeof("text") - 1, 1);
	zend_declare_typed_property(class_entry, property_text_name, &property_text_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_text_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Utf8(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "Utf8", class_Polyspec_Template_Utf8_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Escape(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "Escape", class_Polyspec_Template_Escape_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_InternalBoundary(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "InternalBoundary", class_Polyspec_Template_InternalBoundary_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_SafeString(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "SafeString", class_Polyspec_Template_Value_SafeString_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_text_default_value;
	ZVAL_UNDEF(&property_text_default_value);
	zend_string *property_text_name = zend_string_init("text", sizeof("text") - 1, 1);
	zend_declare_typed_property(class_entry, property_text_name, &property_text_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_text_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_BindError(zend_class_entry *class_entry_RuntimeException)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "BindError", class_Polyspec_Template_Value_BindError_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, class_entry_RuntimeException, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, class_entry_RuntimeException);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_errorCode_default_value;
	ZVAL_UNDEF(&property_errorCode_default_value);
	zend_string *property_errorCode_name = zend_string_init("errorCode", sizeof("errorCode") - 1, 1);
	zend_declare_typed_property(class_entry, property_errorCode_name, &property_errorCode_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_errorCode_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_MapValue(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "MapValue", class_Polyspec_Template_Value_MapValue_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_items_default_value;
	ZVAL_EMPTY_ARRAY(&property_items_default_value);
	zend_string *property_items_name = zend_string_init("items", sizeof("items") - 1, 1);
	zend_declare_typed_property(class_entry, property_items_name, &property_items_default_value, ZEND_ACC_PRIVATE, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_ARRAY));
	zend_string_release(property_items_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_Bind(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "Bind", class_Polyspec_Template_Value_Bind_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval const_MAX_DEPTH_value;
	ZVAL_LONG(&const_MAX_DEPTH_value, 64);
	zend_string *const_MAX_DEPTH_name = zend_string_init_interned("MAX_DEPTH", sizeof("MAX_DEPTH") - 1, 1);
	zend_declare_class_constant_ex(class_entry, const_MAX_DEPTH_name, &const_MAX_DEPTH_value, ZEND_ACC_PUBLIC, NULL);
	zend_string_release(const_MAX_DEPTH_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_Json(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "Json", class_Polyspec_Template_Value_Json_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_Value(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "Value", class_Polyspec_Template_Value_Value_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_Number(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "Number", class_Polyspec_Template_Value_Number_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval const_MAX_SAFE_value;
	ZVAL_LONG(&const_MAX_SAFE_value, 9007199254740991);
	zend_string *const_MAX_SAFE_name = zend_string_init_interned("MAX_SAFE", sizeof("MAX_SAFE") - 1, 1);
	zend_declare_class_constant_ex(class_entry, const_MAX_SAFE_name, &const_MAX_SAFE_value, ZEND_ACC_PUBLIC, NULL);
	zend_string_release(const_MAX_SAFE_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Value_HostArgument(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Value", "HostArgument", class_Polyspec_Template_Value_HostArgument_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_FunctionError(zend_class_entry *class_entry_RuntimeException)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "FunctionError", class_Polyspec_Template_Functions_FunctionError_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, class_entry_RuntimeException, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, class_entry_RuntimeException);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_errorCode_default_value;
	ZVAL_UNDEF(&property_errorCode_default_value);
	zend_string *property_errorCode_name = zend_string_init("errorCode", sizeof("errorCode") - 1, 1);
	zend_declare_typed_property(class_entry, property_errorCode_name, &property_errorCode_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_errorCode_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_FunctionGroup(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "FunctionGroup", class_Polyspec_Template_Functions_FunctionGroup_methods);
	class_entry = zend_register_internal_interface(&ce);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Helpers(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Helpers", class_Polyspec_Template_Functions_Helpers_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Strings(zend_class_entry *class_entry_Polyspec_Template_Functions_FunctionGroup)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Strings", class_Polyspec_Template_Functions_Strings_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Functions_FunctionGroup);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Numbers(zend_class_entry *class_entry_Polyspec_Template_Functions_FunctionGroup)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Numbers", class_Polyspec_Template_Functions_Numbers_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Functions_FunctionGroup);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Encoding(zend_class_entry *class_entry_Polyspec_Template_Functions_FunctionGroup)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Encoding", class_Polyspec_Template_Functions_Encoding_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Functions_FunctionGroup);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Collection(zend_class_entry *class_entry_Polyspec_Template_Functions_FunctionGroup)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Collection", class_Polyspec_Template_Functions_Collection_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Functions_FunctionGroup);

	zval const_RANGE_LIMIT_value;
	ZVAL_LONG(&const_RANGE_LIMIT_value, 1000000);
	zend_string *const_RANGE_LIMIT_name = zend_string_init_interned("RANGE_LIMIT", sizeof("RANGE_LIMIT") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_RANGE_LIMIT_name, &const_RANGE_LIMIT_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
#else
	zend_declare_class_constant_ex(class_entry, const_RANGE_LIMIT_name, &const_RANGE_LIMIT_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_RANGE_LIMIT_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Dates(zend_class_entry *class_entry_Polyspec_Template_Functions_FunctionGroup)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Dates", class_Polyspec_Template_Functions_Dates_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Functions_FunctionGroup);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Functions_Registry(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Functions", "Registry", class_Polyspec_Template_Functions_Registry_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_FormatError(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "FormatError", class_Polyspec_Template_Format_FormatError_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_reason_default_value;
	ZVAL_UNDEF(&property_reason_default_value);
	zend_string *property_reason_name = zend_string_init("reason", sizeof("reason") - 1, 1);
	zend_declare_typed_property(class_entry, property_reason_name, &property_reason_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_reason_name);

	zval property_code_default_value;
	ZVAL_UNDEF(&property_code_default_value);
	zend_string *property_code_name = zend_string_init("code", sizeof("code") - 1, 1);
	zend_declare_typed_property(class_entry, property_code_name, &property_code_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING|MAY_BE_NULL));
	zend_string_release(property_code_name);

	zval property_line_default_value;
	ZVAL_UNDEF(&property_line_default_value);
	zend_string *property_line_name = zend_string_init("line", sizeof("line") - 1, 1);
	zend_declare_typed_property(class_entry, property_line_name, &property_line_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_line_name);

	zval property_col_default_value;
	ZVAL_UNDEF(&property_col_default_value);
	zend_string *property_col_name = zend_string_init("col", sizeof("col") - 1, 1);
	zend_declare_typed_property(class_entry, property_col_name, &property_col_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_col_name);

	zval property_message_default_value;
	ZVAL_UNDEF(&property_message_default_value);
	zend_string *property_message_name = zend_string_init("message", sizeof("message") - 1, 1);
	zend_declare_typed_property(class_entry, property_message_name, &property_message_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_message_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_FormatResult(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "FormatResult", class_Polyspec_Template_Format_FormatResult_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_text_default_value;
	ZVAL_UNDEF(&property_text_default_value);
	zend_string *property_text_name = zend_string_init("text", sizeof("text") - 1, 1);
	zend_declare_typed_property(class_entry, property_text_name, &property_text_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING|MAY_BE_NULL));
	zend_string_release(property_text_name);

	zval property_changed_default_value;
	ZVAL_UNDEF(&property_changed_default_value);
	zend_string *property_changed_name = zend_string_init("changed", sizeof("changed") - 1, 1);
	zend_declare_typed_property(class_entry, property_changed_name, &property_changed_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_BOOL));
	zend_string_release(property_changed_name);

	zval property_error_default_value;
	ZVAL_UNDEF(&property_error_default_value);
	zend_string *property_error_name = zend_string_init("error", sizeof("error") - 1, 1);
	zend_string *property_error_class_Polyspec_Template_Format_FormatError = zend_string_init("Polyspec\\Template\\Format\\FormatError", sizeof("Polyspec\\Template\\Format\\FormatError")-1, 1);
	zend_declare_typed_property(class_entry, property_error_name, &property_error_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_error_class_Polyspec_Template_Format_FormatError, 0, MAY_BE_NULL));
	zend_string_release(property_error_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_Expression(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "Expression", class_Polyspec_Template_Format_Expression_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_Invariant(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "Invariant", class_Polyspec_Template_Format_Invariant_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_Indent(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "Indent", class_Polyspec_Template_Format_Indent_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_Analyzer(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "Analyzer", class_Polyspec_Template_Format_Analyzer_methods);
	class_entry = zend_register_internal_interface(&ce);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_PackageAnalyzer(zend_class_entry *class_entry_Polyspec_Template_Format_Analyzer)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "PackageAnalyzer", class_Polyspec_Template_Format_PackageAnalyzer_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Format_Analyzer);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_Body(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "Body", class_Polyspec_Template_Format_Body_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Format_Formatter(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Format", "Formatter", class_Polyspec_Template_Format_Formatter_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Expr_Token(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Expr", "Token", class_Polyspec_Template_Expr_Token_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_type_default_value;
	ZVAL_UNDEF(&property_type_default_value);
	zend_string *property_type_name = zend_string_init("type", sizeof("type") - 1, 1);
	zend_declare_typed_property(class_entry, property_type_name, &property_type_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_type_name);

	zval property_value_default_value;
	ZVAL_UNDEF(&property_value_default_value);
	zend_string *property_value_name = zend_string_init("value", sizeof("value") - 1, 1);
	zend_declare_typed_property(class_entry, property_value_name, &property_value_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING));
	zend_string_release(property_value_name);

	zval property_start_default_value;
	ZVAL_UNDEF(&property_start_default_value);
	zend_string *property_start_name = zend_string_init("start", sizeof("start") - 1, 1);
	zend_declare_typed_property(class_entry, property_start_name, &property_start_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_start_name);

	zval property_end_default_value;
	ZVAL_UNDEF(&property_end_default_value);
	zend_string *property_end_name = zend_string_init("end", sizeof("end") - 1, 1);
	zend_declare_typed_property(class_entry, property_end_name, &property_end_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_end_name);

	zval property_decoded_default_value;
	ZVAL_UNDEF(&property_decoded_default_value);
	zend_string *property_decoded_name = zend_string_init("decoded", sizeof("decoded") - 1, 1);
	zend_declare_typed_property(class_entry, property_decoded_name, &property_decoded_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING|MAY_BE_NULL));
	zend_string_release(property_decoded_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Expr_Lexer(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Expr", "Lexer", class_Polyspec_Template_Expr_Lexer_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval property_close_default_value;
	ZVAL_UNDEF(&property_close_default_value);
	zend_string *property_close_name = zend_string_init("close", sizeof("close") - 1, 1);
	zend_declare_typed_property(class_entry, property_close_name, &property_close_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_STRING|MAY_BE_NULL));
	zend_string_release(property_close_name);

	zval property_closeCount_default_value;
	ZVAL_UNDEF(&property_closeCount_default_value);
	zend_string *property_closeCount_name = zend_string_init("closeCount", sizeof("closeCount") - 1, 1);
	zend_declare_typed_property(class_entry, property_closeCount_name, &property_closeCount_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
	zend_string_release(property_closeCount_name);

	zval property_openIndex_default_value;
	ZVAL_UNDEF(&property_openIndex_default_value);
	zend_string *property_openIndex_name = zend_string_init("openIndex", sizeof("openIndex") - 1, 1);
	zend_declare_typed_property(class_entry, property_openIndex_name, &property_openIndex_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG|MAY_BE_NULL));
	zend_string_release(property_openIndex_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Expr_Parser(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Expr", "Parser", class_Polyspec_Template_Expr_Parser_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	zval const_DEPTH_LIMIT_value;
	ZVAL_LONG(&const_DEPTH_LIMIT_value, 64);
	zend_string *const_DEPTH_LIMIT_name = zend_string_init_interned("DEPTH_LIMIT", sizeof("DEPTH_LIMIT") - 1, 1);
#if (PHP_VERSION_ID >= 80300)
	zend_declare_typed_class_constant(class_entry, const_DEPTH_LIMIT_name, &const_DEPTH_LIMIT_value, ZEND_ACC_PUBLIC, NULL, (zend_type) ZEND_TYPE_INIT_MASK(MAY_BE_LONG));
#else
	zend_declare_class_constant_ex(class_entry, const_DEPTH_LIMIT_name, &const_DEPTH_LIMIT_value, ZEND_ACC_PUBLIC, NULL);
#endif
	zend_string_release(const_DEPTH_LIMIT_name);

	zval property_lexer_default_value;
	ZVAL_UNDEF(&property_lexer_default_value);
	zend_string *property_lexer_name = zend_string_init("lexer", sizeof("lexer") - 1, 1);
	zend_string *property_lexer_class_Polyspec_Template_Expr_Lexer = zend_string_init("Polyspec\\Template\\Expr\\Lexer", sizeof("Polyspec\\Template\\Expr\\Lexer")-1, 1);
	zend_declare_typed_property(class_entry, property_lexer_name, &property_lexer_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_lexer_class_Polyspec_Template_Expr_Lexer, 0, 0));
	zend_string_release(property_lexer_name);

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Ast(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "Ast", class_Polyspec_Template_Ast_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Parser_Scanner(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Parser", "Scanner", class_Polyspec_Template_Parser_Scanner_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Parser_Standalone(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Parser", "Standalone", class_Polyspec_Template_Parser_Standalone_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Parser_Parser(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Parser", "Parser", class_Polyspec_Template_Parser_Parser_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Parser_BlockTag(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Parser", "BlockTag", class_Polyspec_Template_Parser_BlockTag_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}
