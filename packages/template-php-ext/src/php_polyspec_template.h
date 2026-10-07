/* The polyspec_template extension: templates of docs/spec/ rendered by a native implementation. */
#ifndef PHP_POLYSPEC_TEMPLATE_H
#define PHP_POLYSPEC_TEMPLATE_H

extern zend_module_entry polyspec_template_module_entry;
#define phpext_polyspec_template_ptr &polyspec_template_module_entry

#define PHP_POLYSPEC_TEMPLATE_VERSION "0.0.3"

#if defined(ZTS) && defined(COMPILE_DL_POLYSPEC_TEMPLATE)
ZEND_TSRMLS_CACHE_EXTERN()
#endif

#endif
