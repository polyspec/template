/*
 * PageCache of the library (S10): the final HTML pages a host keeps by key. Each method is the method of the library
 * class with the same name. An entry holds its HTML until its time to live has passed on the clock of the cache; a
 * time to live of null or zero keeps it. Without a clock the time is microtime(true), as the library reads it. The
 * object holds its clock (a closure or null) and its entries, which the library keeps in private properties.
 */
#include "pt.h"
#include "Zend/zend_closures.h"
#include "Zend/zend_exceptions.h"
#include "ext/spl/spl_exceptions.h"
#include <math.h>
#include <sys/time.h>

typedef struct pt_page_entry {
    zend_string *html;
    bool expires;
    double expires_at;
} pt_page_entry;

typedef struct pt_page_cache {
    zval clock;
    HashTable entries;
    zend_object std;
} pt_page_cache;

static zend_object_handlers pt_page_cache_handlers;

static inline pt_page_cache *pt_page_cache_of(zend_object *object)
{
    return (pt_page_cache *)((char *)object - XtOffsetOf(pt_page_cache, std));
}

#define PT_PAGE_CACHE(self) pt_page_cache_of(Z_OBJ_P(self))

static pt_page_entry *pt_page_entry_new(zend_string *html, bool expires, double expires_at)
{
    pt_page_entry *entry = emalloc(sizeof(pt_page_entry));
    entry->html = html;
    entry->expires = expires;
    entry->expires_at = expires_at;
    return entry;
}

static void pt_page_entry_dtor(zval *value)
{
    pt_page_entry *entry = Z_PTR_P(value);
    zend_string_release(entry->html);
    efree(entry);
}

static zend_object *pt_page_cache_create(zend_class_entry *class_type)
{
    pt_page_cache *cache = zend_object_alloc(sizeof(pt_page_cache), class_type);
    zend_object_std_init(&cache->std, class_type);
    object_properties_init(&cache->std, class_type);
    ZVAL_NULL(&cache->clock);
    zend_hash_init(&cache->entries, 0, NULL, pt_page_entry_dtor, 0);
    cache->std.handlers = &pt_page_cache_handlers;
    return &cache->std;
}

static void pt_page_cache_free(zend_object *object)
{
    pt_page_cache *cache = pt_page_cache_of(object);
    zval_ptr_dtor(&cache->clock);
    zend_hash_destroy(&cache->entries);
    zend_object_std_dtor(object);
}

/* A clone copies the clock and every entry, as the library's clone copies its properties. */
static zend_object *pt_page_cache_clone(zend_object *old_object)
{
    zend_object *copy = pt_page_cache_create(old_object->ce);
    zend_objects_clone_members(copy, old_object);
    pt_page_cache *from = pt_page_cache_of(old_object), *to = pt_page_cache_of(copy);
    ZVAL_COPY(&to->clock, &from->clock);
    zend_string *key;
    zval *value;
    ZEND_HASH_FOREACH_STR_KEY_VAL(&from->entries, key, value) {
        pt_page_entry *entry = Z_PTR_P(value);
        zval copied;
        ZVAL_PTR(&copied, pt_page_entry_new(zend_string_copy(entry->html), entry->expires, entry->expires_at));
        zend_hash_update(&to->entries, key, &copied);
    } ZEND_HASH_FOREACH_END();
    return copy;
}

static HashTable *pt_page_cache_get_gc(zend_object *object, zval **table, int *count)
{
    zend_get_gc_buffer *buffer = zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer, &pt_page_cache_of(object)->clock);
    zend_get_gc_buffer_use(buffer, table, count);
    return zend_std_get_properties(object);
}

void pt_page_cache_register(zend_class_entry *ce)
{
    ce->create_object = pt_page_cache_create;
    memcpy(&pt_page_cache_handlers, zend_get_std_object_handlers(), sizeof(zend_object_handlers));
    pt_page_cache_handlers.offset = XtOffsetOf(pt_page_cache, std);
    pt_page_cache_handlers.free_obj = pt_page_cache_free;
    pt_page_cache_handlers.clone_obj = pt_page_cache_clone;
    pt_page_cache_handlers.get_gc = pt_page_cache_get_gc;
}

/* The current time: microtime(true) without a clock, else (float) of the clock's result. False after an exception. */
static bool pt_page_now(zval *self, double *now)
{
    zval *clock = &PT_PAGE_CACHE(self)->clock;
    if (Z_TYPE_P(clock) == IS_NULL) {
        struct timeval tv;
        gettimeofday(&tv, NULL);
        *now = (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
        return true;
    }
    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    zval result;
    if (zend_fcall_info_init(clock, 0, &fci, &fcc, NULL, NULL) != SUCCESS) {
        return false;
    }
    ZVAL_NULL(&result);
    fci.retval = &result;
    zend_call_function(&fci, &fcc);
    if (EG(exception)) {
        zval_ptr_dtor(&result);
        return false;
    }
    *now = zval_get_double(&result);
    zval_ptr_dtor(&result);
    return true;
}

/* The HTML of a key that has not expired, owned by the caller; NULL when there is none. False after an exception.
 * The entry is read before the clock runs, as the library reads its copy of the entry. */
static bool pt_page_get(zval *self, zend_string *key, zend_string **html)
{
    *html = NULL;
    zval *slot = zend_hash_find(&PT_PAGE_CACHE(self)->entries, key);
    if (slot == NULL) {
        return true;
    }
    pt_page_entry *entry = Z_PTR_P(slot);
    zend_string *text = zend_string_copy(entry->html);
    if (!entry->expires) {
        *html = text;
        return true;
    }
    double expires_at = entry->expires_at;
    double now;
    if (!pt_page_now(self, &now)) {
        zend_string_release(text);
        return false;
    }
    if (expires_at <= now) {
        zend_hash_del(&PT_PAGE_CACHE(self)->entries, key);
        zend_string_release(text);
        return true;
    }
    *html = text;
    return true;
}

/* Stores the HTML of a key; a NULL time to live keeps it, and a time to live of zero keeps it as well. */
static bool pt_page_set(zval *self, zend_string *key, zend_string *html, const double *ttl)
{
    if (ttl != NULL && (!isfinite(*ttl) || *ttl < 0)) {
        zend_throw_exception(spl_ce_InvalidArgumentException, "page cache ttl must be null or non-negative", 0);
        return false;
    }
    bool expires = ttl != NULL && *ttl != 0.0;
    double expires_at = 0.0;
    if (expires) {
        double now;
        if (!pt_page_now(self, &now)) {
            return false;
        }
        expires_at = now + *ttl;
    }
    zval stored;
    ZVAL_PTR(&stored, pt_page_entry_new(zend_string_copy(html), expires, expires_at));
    zend_hash_update(&PT_PAGE_CACHE(self)->entries, key, &stored);
    return true;
}

void pt_page_cache_construct(INTERNAL_FUNCTION_PARAMETERS)
{
    zval *clock = NULL;
    ZEND_PARSE_PARAMETERS_START(0, 1)
        Z_PARAM_OPTIONAL
        Z_PARAM_OBJECT_OF_CLASS_OR_NULL(clock, zend_ce_closure)
    ZEND_PARSE_PARAMETERS_END();
    if (clock != NULL) {
        ZVAL_COPY(&PT_PAGE_CACHE(ZEND_THIS)->clock, clock);
    }
}

void pt_page_cache_get(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *key;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(key)
    ZEND_PARSE_PARAMETERS_END();
    zend_string *html;
    if (!pt_page_get(ZEND_THIS, key, &html)) {
        RETURN_THROWS();
    }
    if (html == NULL) {
        RETURN_NULL();
    }
    RETURN_STR(html);
}

void pt_page_cache_set(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *key, *html;
    double ttl = 0.0;
    bool ttl_is_null = true;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(key)
        Z_PARAM_STR(html)
        Z_PARAM_DOUBLE_OR_NULL(ttl, ttl_is_null)
    ZEND_PARSE_PARAMETERS_END();
    if (!pt_page_set(ZEND_THIS, key, html, ttl_is_null ? NULL : &ttl)) {
        RETURN_THROWS();
    }
}

/* The library's getOrSet: a hit returns the cached page without a time to live check; a miss renders, then stores the
 * result, which must be a string (the library's set takes a string). */
void pt_page_cache_get_or_set(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *key;
    double ttl = 0.0;
    bool ttl_is_null = true;
    zval *render;
    ZEND_PARSE_PARAMETERS_START(3, 3)
        Z_PARAM_STR(key)
        Z_PARAM_DOUBLE_OR_NULL(ttl, ttl_is_null)
        Z_PARAM_OBJECT_OF_CLASS(render, zend_ce_closure)
    ZEND_PARSE_PARAMETERS_END();

    zend_string *cached;
    if (!pt_page_get(ZEND_THIS, key, &cached)) {
        RETURN_THROWS();
    }
    if (cached != NULL) {
        RETURN_STR(cached);
    }

    zend_fcall_info fci;
    zend_fcall_info_cache fcc;
    zval rendered;
    if (zend_fcall_info_init(render, 0, &fci, &fcc, NULL, NULL) != SUCCESS) {
        RETURN_THROWS();
    }
    ZVAL_NULL(&rendered);
    fci.retval = &rendered;
    zend_call_function(&fci, &fcc);
    if (EG(exception)) {
        zval_ptr_dtor(&rendered);
        RETURN_THROWS();
    }
    if (Z_TYPE(rendered) != IS_STRING) {
        zend_type_error("Polyspec\\Template\\PageCache::set(): Argument #2 ($html) must be of type string, %s given",
            zend_zval_value_name(&rendered));
        zval_ptr_dtor(&rendered);
        RETURN_THROWS();
    }
    if (!pt_page_set(ZEND_THIS, key, Z_STR(rendered), ttl_is_null ? NULL : &ttl)) {
        zval_ptr_dtor(&rendered);
        RETURN_THROWS();
    }
    RETURN_STR(Z_STR(rendered));
}

void pt_page_cache_delete(INTERNAL_FUNCTION_PARAMETERS)
{
    zend_string *key;
    ZEND_PARSE_PARAMETERS_START(1, 1)
        Z_PARAM_STR(key)
    ZEND_PARSE_PARAMETERS_END();
    zend_hash_del(&PT_PAGE_CACHE(ZEND_THIS)->entries, key);
}

void pt_page_cache_clear(INTERNAL_FUNCTION_PARAMETERS)
{
    ZEND_PARSE_PARAMETERS_NONE();
    zend_hash_clean(&PT_PAGE_CACHE(ZEND_THIS)->entries);
}
