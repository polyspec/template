/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: 335ccebb8a1684e25d00bc1877fc45980637b56e */

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine___construct, 0, 0, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, root, IS_STRING, 1, "null")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_parse, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Native_Engine_analyze arginfo_class_Polyspec_Template_Native_Engine_parse

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_parseToJson, 0, 2, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_register, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_registerClass, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, function, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_render, 0, 1, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, assign, IS_MIXED, 0, "[]")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_renderJson, 0, 2, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, assign, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, define, IS_STRING, 1, "null")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, env, IS_STRING, 1, "null")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Native_BoundMap_bind, 0, 1, Polyspec\\Template\\\116ative\\BoundMap, 0)
	ZEND_ARG_TYPE_INFO(0, value, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(arginfo_class_Polyspec_Template_Native_BoundMap_merge, 0, 2, Polyspec\\Template\\\116ative\\BoundMap, 0)
	ZEND_ARG_TYPE_INFO(0, first, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, second, IS_MIXED, 0)
ZEND_END_ARG_INFO()

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

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_TemplateError_toArray, 0, 0, IS_ARRAY, 0)
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

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_PreparedRender_render, 0, 0, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Engine___construct, 0, 0, 1)
	ZEND_ARG_OBJ_INFO(0, program, Polyspec\\Template\\Program, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Engine_prepare arginfo_class_Polyspec_Template_Program_prepare

#define arginfo_class_Polyspec_Template_Engine_render arginfo_class_Polyspec_Template_Program_render

#define arginfo_class_Polyspec_Template_PreparedExecution_render arginfo_class_Polyspec_Template_PreparedRender_render

#define arginfo_class_Polyspec_Template_AstPreparedExecution_render arginfo_class_Polyspec_Template_PreparedRender_render

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_AstProgram___construct, 0, 0, 0)
	ZEND_ARG_OBJ_INFO_WITH_DEFAULT_VALUE(0, loader, Polyspec\\Template\\Loader\\LoaderInterface, 1, "null")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_decodeTemplate, 0, 1, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, json, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstProgram_parse arginfo_class_Polyspec_Template_Native_Engine_parse

#define arginfo_class_Polyspec_Template_AstProgram_analyze arginfo_class_Polyspec_Template_Native_Engine_parse

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_register, 0, 2, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, fn, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_registerClass, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, fn, IS_CALLABLE, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_hostFunction, 0, 1, IS_CALLABLE, 1)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_AstProgram_classFunction, 0, 2, IS_CALLABLE, 1)
	ZEND_ARG_TYPE_INFO(0, className, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_AstProgram_limits arginfo_class_Polyspec_Template_TemplateError_toArray

#define arginfo_class_Polyspec_Template_AstProgram_prepare arginfo_class_Polyspec_Template_Program_prepare

#define arginfo_class_Polyspec_Template_AstProgram_render arginfo_class_Polyspec_Template_Program_render

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Value_SafeString___construct, 0, 0, 1)
	ZEND_ARG_TYPE_INFO(0, text, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Value_BindError___construct, 0, 0, 2)
	ZEND_ARG_TYPE_INFO(0, errorCode, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, message, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_METHOD(Polyspec_Template_Native_Engine, __construct);
ZEND_METHOD(Polyspec_Template_Native_Engine, parse);
ZEND_METHOD(Polyspec_Template_Native_Engine, analyze);
ZEND_METHOD(Polyspec_Template_Native_Engine, parseToJson);
ZEND_METHOD(Polyspec_Template_Native_Engine, register);
ZEND_METHOD(Polyspec_Template_Native_Engine, registerClass);
ZEND_METHOD(Polyspec_Template_Native_Engine, render);
ZEND_METHOD(Polyspec_Template_Native_Engine, renderJson);
ZEND_METHOD(Polyspec_Template_Native_BoundMap, bind);
ZEND_METHOD(Polyspec_Template_Native_BoundMap, merge);
ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, __construct);
ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, set);
ZEND_METHOD(Polyspec_Template_Loader_ArrayLoader, load);
ZEND_METHOD(Polyspec_Template_Loader_FilesystemLoader, __construct);
ZEND_METHOD(Polyspec_Template_Loader_FilesystemLoader, load);
ZEND_METHOD(Polyspec_Template_TemplateError, __construct);
ZEND_METHOD(Polyspec_Template_TemplateError, at);
ZEND_METHOD(Polyspec_Template_TemplateError, withoutPosition);
ZEND_METHOD(Polyspec_Template_TemplateError, toArray);
ZEND_METHOD(Polyspec_Template_PreparedRender, __construct);
ZEND_METHOD(Polyspec_Template_PreparedRender, render);
ZEND_METHOD(Polyspec_Template_Engine, __construct);
ZEND_METHOD(Polyspec_Template_Engine, prepare);
ZEND_METHOD(Polyspec_Template_Engine, render);
ZEND_METHOD(Polyspec_Template_AstPreparedExecution, render);
ZEND_METHOD(Polyspec_Template_AstProgram, __construct);
ZEND_METHOD(Polyspec_Template_AstProgram, decodeTemplate);
ZEND_METHOD(Polyspec_Template_AstProgram, parse);
ZEND_METHOD(Polyspec_Template_AstProgram, analyze);
ZEND_METHOD(Polyspec_Template_AstProgram, register);
ZEND_METHOD(Polyspec_Template_AstProgram, registerClass);
ZEND_METHOD(Polyspec_Template_AstProgram, hostFunction);
ZEND_METHOD(Polyspec_Template_AstProgram, classFunction);
ZEND_METHOD(Polyspec_Template_AstProgram, limits);
ZEND_METHOD(Polyspec_Template_AstProgram, prepare);
ZEND_METHOD(Polyspec_Template_AstProgram, render);
ZEND_METHOD(Polyspec_Template_Value_SafeString, __construct);
ZEND_METHOD(Polyspec_Template_Value_BindError, __construct);

static const zend_function_entry class_Polyspec_Template_Native_Engine_methods[] = {
	ZEND_ME(Polyspec_Template_Native_Engine, __construct, arginfo_class_Polyspec_Template_Native_Engine___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_Engine, parse, arginfo_class_Polyspec_Template_Native_Engine_parse, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Native_Engine, analyze, arginfo_class_Polyspec_Template_Native_Engine_analyze, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Native_Engine, parseToJson, arginfo_class_Polyspec_Template_Native_Engine_parseToJson, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Native_Engine, register, arginfo_class_Polyspec_Template_Native_Engine_register, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_Engine, registerClass, arginfo_class_Polyspec_Template_Native_Engine_registerClass, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_Engine, render, arginfo_class_Polyspec_Template_Native_Engine_render, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_Engine, renderJson, arginfo_class_Polyspec_Template_Native_Engine_renderJson, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Native_BoundMap_methods[] = {
	ZEND_ME(Polyspec_Template_Native_BoundMap, bind, arginfo_class_Polyspec_Template_Native_BoundMap_bind, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_Native_BoundMap, merge, arginfo_class_Polyspec_Template_Native_BoundMap_merge, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_FE_END
};

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

static const zend_function_entry class_Polyspec_Template_TemplateError_methods[] = {
	ZEND_ME(Polyspec_Template_TemplateError, __construct, arginfo_class_Polyspec_Template_TemplateError___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_TemplateError, at, arginfo_class_Polyspec_Template_TemplateError_at, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_TemplateError, withoutPosition, arginfo_class_Polyspec_Template_TemplateError_withoutPosition, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_TemplateError, toArray, arginfo_class_Polyspec_Template_TemplateError_toArray, ZEND_ACC_PUBLIC)
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
	ZEND_ME(Polyspec_Template_AstPreparedExecution, render, arginfo_class_Polyspec_Template_AstPreparedExecution_render, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_AstProgram_methods[] = {
	ZEND_ME(Polyspec_Template_AstProgram, __construct, arginfo_class_Polyspec_Template_AstProgram___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, decodeTemplate, arginfo_class_Polyspec_Template_AstProgram_decodeTemplate, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, parse, arginfo_class_Polyspec_Template_AstProgram_parse, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, analyze, arginfo_class_Polyspec_Template_AstProgram_analyze, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
	ZEND_ME(Polyspec_Template_AstProgram, register, arginfo_class_Polyspec_Template_AstProgram_register, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, registerClass, arginfo_class_Polyspec_Template_AstProgram_registerClass, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, hostFunction, arginfo_class_Polyspec_Template_AstProgram_hostFunction, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, classFunction, arginfo_class_Polyspec_Template_AstProgram_classFunction, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, limits, arginfo_class_Polyspec_Template_AstProgram_limits, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, prepare, arginfo_class_Polyspec_Template_AstProgram_prepare, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_AstProgram, render, arginfo_class_Polyspec_Template_AstProgram_render, ZEND_ACC_PUBLIC)
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

static zend_class_entry *register_class_Polyspec_Template_Native_Engine(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Native", "Engine", class_Polyspec_Template_Native_Engine_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Native_BoundMap(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Native", "BoundMap", class_Polyspec_Template_Native_BoundMap_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL|ZEND_ACC_NOT_SERIALIZABLE);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL|ZEND_ACC_NOT_SERIALIZABLE;
#endif

	return class_entry;
}

static zend_class_entry *register_class_Polyspec_Template_Loader_LoaderInterface(void)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Loader", "LoaderInterface", class_Polyspec_Template_Loader_LoaderInterface_methods);
	class_entry = zend_register_internal_interface(&ce);

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

static zend_class_entry *register_class_Polyspec_Template_AstProgram(zend_class_entry *class_entry_Polyspec_Template_Program)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template", "AstProgram", class_Polyspec_Template_AstProgram_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, NULL, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, NULL);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif
	zend_class_implements(class_entry, 1, class_entry_Polyspec_Template_Program);

	zval property_loader_default_value;
	ZVAL_UNDEF(&property_loader_default_value);
	zend_string *property_loader_name = zend_string_init("loader", sizeof("loader") - 1, 1);
	zend_string *property_loader_class_Polyspec_Template_Loader_LoaderInterface = zend_string_init("Polyspec\\Template\\Loader\\LoaderInterface", sizeof("Polyspec\\Template\\Loader\\LoaderInterface")-1, 1);
	zend_declare_typed_property(class_entry, property_loader_name, &property_loader_default_value, ZEND_ACC_PUBLIC|ZEND_ACC_READONLY, NULL, (zend_type) ZEND_TYPE_INIT_CLASS(property_loader_class_Polyspec_Template_Loader_LoaderInterface, 0, 0));
	zend_string_release(property_loader_name);

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
