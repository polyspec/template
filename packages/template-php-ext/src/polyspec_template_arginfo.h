/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: a9a03919ce220ac92945cf45dc181868c81226df */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_TemplateError_getErrorCode, 0, 0, IS_STRING, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Native_TemplateError_getTemplate arginfo_class_Polyspec_Template_Native_TemplateError_getErrorCode

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_TemplateError_getErrorLine, 0, 0, IS_LONG, 0)
ZEND_END_ARG_INFO()

#define arginfo_class_Polyspec_Template_Native_TemplateError_getErrorCol arginfo_class_Polyspec_Template_Native_TemplateError_getErrorLine

#define arginfo_class_Polyspec_Template_Native_TemplateError_getOffset arginfo_class_Polyspec_Template_Native_TemplateError_getErrorLine

#define arginfo_class_Polyspec_Template_Native_TemplateError_getEnd arginfo_class_Polyspec_Template_Native_TemplateError_getErrorLine

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_TemplateError_toArray, 0, 0, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine___construct, 0, 0, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, root, IS_STRING, 1, "null")
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_class_Polyspec_Template_Native_Engine_parse, 0, 2, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, source, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, name, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0, options, IS_ARRAY, 0, "[]")
ZEND_END_ARG_INFO()

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

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorCode);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getTemplate);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorLine);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorCol);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getOffset);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getEnd);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, toArray);
ZEND_METHOD(Polyspec_Template_Native_Engine, __construct);
ZEND_METHOD(Polyspec_Template_Native_Engine, parse);
ZEND_METHOD(Polyspec_Template_Native_Engine, parseToJson);
ZEND_METHOD(Polyspec_Template_Native_Engine, register);
ZEND_METHOD(Polyspec_Template_Native_Engine, registerClass);
ZEND_METHOD(Polyspec_Template_Native_Engine, render);
ZEND_METHOD(Polyspec_Template_Native_Engine, renderJson);
ZEND_METHOD(Polyspec_Template_Native_BoundMap, bind);
ZEND_METHOD(Polyspec_Template_Native_BoundMap, merge);

static const zend_function_entry class_Polyspec_Template_Native_TemplateError_methods[] = {
	ZEND_ME(Polyspec_Template_Native_TemplateError, getErrorCode, arginfo_class_Polyspec_Template_Native_TemplateError_getErrorCode, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_TemplateError, getTemplate, arginfo_class_Polyspec_Template_Native_TemplateError_getTemplate, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_TemplateError, getErrorLine, arginfo_class_Polyspec_Template_Native_TemplateError_getErrorLine, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_TemplateError, getErrorCol, arginfo_class_Polyspec_Template_Native_TemplateError_getErrorCol, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_TemplateError, getOffset, arginfo_class_Polyspec_Template_Native_TemplateError_getOffset, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_TemplateError, getEnd, arginfo_class_Polyspec_Template_Native_TemplateError_getEnd, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_TemplateError, toArray, arginfo_class_Polyspec_Template_Native_TemplateError_toArray, ZEND_ACC_PUBLIC)
	ZEND_FE_END
};

static const zend_function_entry class_Polyspec_Template_Native_Engine_methods[] = {
	ZEND_ME(Polyspec_Template_Native_Engine, __construct, arginfo_class_Polyspec_Template_Native_Engine___construct, ZEND_ACC_PUBLIC)
	ZEND_ME(Polyspec_Template_Native_Engine, parse, arginfo_class_Polyspec_Template_Native_Engine_parse, ZEND_ACC_PUBLIC|ZEND_ACC_STATIC)
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

static zend_class_entry *register_class_Polyspec_Template_Native_TemplateError(zend_class_entry *class_entry_Exception)
{
	zend_class_entry ce, *class_entry;

	INIT_NS_CLASS_ENTRY(ce, "Polyspec\\Template\\Native", "TemplateError", class_Polyspec_Template_Native_TemplateError_methods);
#if (PHP_VERSION_ID >= 80400)
	class_entry = zend_register_internal_class_with_flags(&ce, class_entry_Exception, ZEND_ACC_FINAL);
#else
	class_entry = zend_register_internal_class_ex(&ce, class_entry_Exception);
	class_entry->ce_flags |= ZEND_ACC_FINAL;
#endif

	return class_entry;
}

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
