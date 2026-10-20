/* This is a generated file, edit the .stub.php file instead.
 * Stub hash: b9df64d4dda8974c7759cc83538a0507a995262b */

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

ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorCode);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getTemplate);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorLine);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getErrorCol);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getOffset);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, getEnd);
ZEND_METHOD(Polyspec_Template_Native_TemplateError, toArray);
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
