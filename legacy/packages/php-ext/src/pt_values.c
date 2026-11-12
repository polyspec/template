/*
 * The library functions of Value, Number and HostArgument on PHP values: the type of a value, truthiness, text, equality
 * and order (EXP-33 to EXP-38, VAL-8), the text and the decimal digits of a number (VAL-9, FUN-20 to FUN-25), and the host
 * form of a template value (VAL-21). Each function follows the PHP code of the library. The scalar rules are those of the
 * renderer on its own value type (pt_core.c); a PHP array is compared by its keys, as the library compares it.
 */
#include "pt.h"
#include "ext/spl/spl_exceptions.h"
#include "Zend/zend_exceptions.h"
#include "Zend/zend_execute.h"
#include <math.h>

static bool pt_is_map_object(const zval *value)
{
    return Z_TYPE_P(value) == IS_OBJECT && Z_OBJCE_P(value) == pt_map_value_ce;
}

/* The items of a MapValue: a PHP array of its keys and values, in entry order. */
static HashTable *pt_map_items(const zval *value)
{
    return Z_ARRVAL_P(OBJ_PROP_NUM(Z_OBJ_P(value), 0));
}

/* The type of a value as Value::typeOf names it. A SafeString is a string; a MapValue is a map; the default is a map. */
static pt_type pt_host_type(zval *value)
{
    ZVAL_DEREF(value);
    switch (Z_TYPE_P(value)) {
        case IS_NULL: return PT_NULL;
        case IS_FALSE:
        case IS_TRUE: return PT_BOOL;
        case IS_LONG:
        case IS_DOUBLE: return PT_NUMBER;
        case IS_STRING: return PT_STRING;
        case IS_ARRAY: return PT_LIST;
        case IS_OBJECT:
            if (Z_OBJCE_P(value) == pt_safe_string_ce) {
                return PT_STRING;
            }
            if (Z_OBJCE_P(value) == pt_map_value_ce) {
                return PT_MAP;
            }
            return PT_OBJECT;
        default: return PT_MAP;
    }
}

/* A null, bool, number, string or SafeString value as the renderer's value. */
static pt_value pt_scalar_of(zval *value)
{
    ZVAL_DEREF(value);
    switch (Z_TYPE_P(value)) {
        case IS_NULL: return pt_null();
        case IS_FALSE: return pt_bool(false);
        case IS_TRUE: return pt_bool(true);
        case IS_LONG: return pt_number((double)Z_LVAL_P(value));
        case IS_DOUBLE: return pt_number(Z_DVAL_P(value));
        case IS_STRING: return pt_string((pt_s){Z_STRVAL_P(value), Z_STRLEN_P(value)});
        default: {
            zval rv;
            zval *text = zend_read_property(pt_safe_string_ce, Z_OBJ_P(value), ZEND_STRL("text"), 1, &rv);
            return pt_safe((pt_s){Z_STRVAL_P(text), Z_STRLEN_P(text)});
        }
    }
}

static double pt_number_of(zval *value)
{
    return Z_TYPE_P(value) == IS_LONG ? (double)Z_LVAL_P(value) : Z_DVAL_P(value);
}

bool pt_host_loose_equals(zval *a, zval *b);

/* EXP-34 and EXP-35 for two values of the same type. */
static bool pt_host_same(zval *a, zval *b, pt_type type)
{
    switch (type) {
        case PT_NULL:
            return true;
        case PT_BOOL:
        case PT_NUMBER:
        case PT_STRING:
            return pt_loose_equals(pt_scalar_of(a), pt_scalar_of(b));
        case PT_LIST: {
            HashTable *left = Z_ARRVAL_P(a), *right = Z_ARRVAL_P(b);
            if (zend_hash_num_elements(left) != zend_hash_num_elements(right)) {
                return false;
            }
            zend_ulong index;
            zend_string *key;
            zval *item;
            ZEND_HASH_FOREACH_KEY_VAL(left, index, key, item) {
                /* $b[$index]: a missing key reads as null, with the warning of PHP. */
                zval *other = key != NULL ? zend_hash_find(right, key) : zend_hash_index_find(right, index);
                zval missing;
                if (other == NULL) {
                    if (key != NULL) {
                        zend_error(E_WARNING, "Undefined array key \"%s\"", ZSTR_VAL(key));
                    } else {
                        zend_error(E_WARNING, "Undefined array key " ZEND_LONG_FMT, (zend_long)index);
                    }
                    if (EG(exception)) {
                        return false;
                    }
                    ZVAL_NULL(&missing);
                    other = &missing;
                }
                if (!pt_host_loose_equals(item, other)) {
                    return false;
                }
            } ZEND_HASH_FOREACH_END();
            return true;
        }
        case PT_OBJECT:
            /* EXP-39: two native objects are equal when they are the same object. */
            return Z_OBJ_P(a) == Z_OBJ_P(b);
        default: {
            if (!pt_is_map_object(a) || !pt_is_map_object(b)) {
                zend_throw_error(NULL, "Call to a member function count() on %s", zend_zval_type_name(a));
                return false;
            }
            HashTable *left = pt_map_items(a), *right = pt_map_items(b);
            if (zend_hash_num_elements(left) != zend_hash_num_elements(right)) {
                return false;
            }
            zend_ulong index;
            zend_string *key;
            zval *item;
            ZEND_HASH_FOREACH_KEY_VAL(left, index, key, item) {
                /* $b->has($key) and $b->get($key). */
                zval *other = key != NULL ? zend_hash_find(right, key) : zend_hash_index_find(right, index);
                if (other == NULL || !pt_host_loose_equals(item, other)) {
                    return false;
                }
            } ZEND_HASH_FOREACH_END();
            return true;
        }
    }
}

/* EXP-34: loose equality of two values. */
bool pt_host_loose_equals(zval *a, zval *b)
{
    ZVAL_DEREF(a);
    ZVAL_DEREF(b);
    pt_type ta = pt_host_type(a), tb = pt_host_type(b);
    if (ta == tb) {
        return pt_host_same(a, b, ta);
    }
    if ((ta == PT_NUMBER && tb == PT_STRING) || (ta == PT_STRING && tb == PT_NUMBER)) {
        return pt_loose_equals(pt_scalar_of(a), pt_scalar_of(b));
    }

    return false;
}

/* EXP-37: strict equality of two values. */
bool pt_host_strict_equals(zval *a, zval *b)
{
    ZVAL_DEREF(a);
    ZVAL_DEREF(b);
    pt_type ta = pt_host_type(a);
    return ta == pt_host_type(b) && pt_host_same(a, b, ta);
}

/* EXP-38: the order of two values, -1, 0 or 1; false when the pair has no order. */
bool pt_host_compare(zval *a, zval *b, zend_long *order)
{
    ZVAL_DEREF(a);
    ZVAL_DEREF(b);
    pt_type ta = pt_host_type(a), tb = pt_host_type(b);
    if (ta == PT_NUMBER && tb == PT_NUMBER) {
        /* (float) $a <=> (float) $b, which is the comparison of the engine on two floats. */
        zval left, right;
        ZVAL_DOUBLE(&left, pt_number_of(a));
        ZVAL_DOUBLE(&right, pt_number_of(b));
        int result = zend_compare(&left, &right);
        *order = result < 0 ? -1 : (result > 0 ? 1 : 0);
        return true;
    }
    if (ta == PT_STRING && tb == PT_STRING) {
        int result;
        if (!pt_compare(pt_scalar_of(a), pt_scalar_of(b), &result)) {
            return false;
        }
        *order = result;
        return true;
    }

    return false;
}

/* Value::typeOf. */
const char *pt_host_type_name(zval *value)
{
    return pt_type_name((pt_value){.type = (uint8_t)pt_host_type(value)});
}

/* EXP-33: truthiness of a value. */
bool pt_host_truthy(zval *value)
{
    ZVAL_DEREF(value);
    switch (pt_host_type(value)) {
        case PT_NULL:
        case PT_BOOL:
        case PT_NUMBER:
        case PT_STRING:
            return pt_truthy(pt_scalar_of(value));
        case PT_LIST:
            return zend_hash_num_elements(Z_ARRVAL_P(value)) > 0;
        case PT_MAP:
            return pt_is_map_object(value) ? zend_hash_num_elements(pt_map_items(value)) > 0 : true;
        default:
            return true;
    }
}

/* VAL-9: the text of a finite number (Number::toText); a value with no decimal text is a RuntimeException. */
bool pt_number_host_text(double value, zval *result)
{
    if (!isfinite(value)) {
        zend_throw_exception(spl_ce_RuntimeException, "cannot decompose ", 0);
        return false;
    }
    pt_arena arena;
    pt_arena_init(&arena);
    pt_s text = pt_number_text(&arena, value);
    ZVAL_STRINGL(result, text.s, text.n);
    pt_arena_free(&arena);

    return true;
}

/* VAL-8: the text of a value; null for a list, a map or an object. */
bool pt_host_stringify(zval *value, zval *result)
{
    ZVAL_DEREF(value);
    switch (pt_host_type(value)) {
        case PT_NULL:
            ZVAL_EMPTY_STRING(result);
            return true;
        case PT_BOOL:
            ZVAL_STRING(result, Z_TYPE_P(value) == IS_TRUE ? "true" : "false");
            return true;
        case PT_NUMBER:
            return pt_number_host_text(pt_number_of(value), result);
        case PT_STRING: {
            pt_s text = pt_scalar_of(value).u.str;
            ZVAL_STRINGL(result, text.s, text.n);
            return true;
        }
        default:
            ZVAL_NULL(result);
            return true;
    }
}

/* Value::isString: a string or a SafeString. */
bool pt_host_is_string(zval *value)
{
    ZVAL_DEREF(value);
    return Z_TYPE_P(value) == IS_STRING
        || (Z_TYPE_P(value) == IS_OBJECT && Z_OBJCE_P(value) == pt_safe_string_ce);
}

/* The text of a value that pt_host_is_string accepts; the string is owned by the value. */
zend_string *pt_host_text_of(zval *value)
{
    ZVAL_DEREF(value);
    if (Z_TYPE_P(value) == IS_STRING) {
        return Z_STR_P(value);
    }
    zval rv;
    return Z_STR_P(zend_read_property(pt_safe_string_ce, Z_OBJ_P(value), ZEND_STRL("text"), 1, &rv));
}

/* Number::shortestDigits: the sign, the shortest round-trip digits and the exponent n with value = 0.digits x 10^n. */
static bool pt_decompose(double value, bool *negative, char *digits, size_t *count, zend_long *exponent)
{
    if (!isfinite(value)) {
        zend_throw_exception(spl_ce_RuntimeException, "cannot decompose ", 0);
        return false;
    }
    if (value == 0.0) {
        *negative = false;
        digits[0] = '0';
        digits[1] = '\0';
        *count = 1;
        *exponent = -1;
        return true;
    }
    int point;
    pt_shortest_digits(value, negative, digits, count, &point);
    *exponent = point;

    return true;
}

bool pt_number_shortest_digits(double value, zval *result)
{
    bool negative;
    char digits[32];
    size_t count;
    zend_long exponent;
    if (!pt_decompose(value, &negative, digits, &count, &exponent)) {
        return false;
    }
    array_init(result);
    add_next_index_bool(result, negative);
    add_next_index_stringl(result, digits, count);
    add_next_index_long(result, exponent);

    return true;
}

/* Number::positional: the sign and the integer and fraction digits of the positional expansion of a number. */
static bool pt_positional(pt_arena *arena, double value, bool *negative, pt_s *integer, pt_s *fraction)
{
    if (value == 0.0) {
        *negative = false;
        *integer = PT_S("0");
        *fraction = PT_S("");
        return true;
    }
    char digits[32];
    size_t length;
    zend_long exponent;
    if (!pt_decompose(value, negative, digits, &length, &exponent)) {
        return false;
    }
    pt_buf buf;
    if (exponent <= 0) {
        pt_buf_init(&buf, arena);
        for (zend_long i = 0; i < -exponent; i++) {
            pt_buf_addc(&buf, '0');
        }
        pt_buf_add(&buf, digits, length);
        *integer = PT_S("0");
        *fraction = pt_buf_done(&buf);
    } else if (exponent >= (zend_long)length) {
        pt_buf_init(&buf, arena);
        pt_buf_add(&buf, digits, length);
        for (zend_long i = (zend_long)length; i < exponent; i++) {
            pt_buf_addc(&buf, '0');
        }
        *integer = pt_buf_done(&buf);
        *fraction = PT_S("");
    } else {
        *integer = pt_strdup(arena, digits, (size_t)exponent);
        *fraction = pt_strdup(arena, digits + exponent, length - (size_t)exponent);
    }

    return true;
}

/* Builds `result` from the sign and the decimal parts of a number, in the arena of the parts. */
typedef void (*pt_decimal_build)(pt_arena *arena, bool negative, pt_s integer, pt_s fraction, zval *result);

/* The parts [negative, integer digits, fraction digits] as a PHP list. */
static void pt_decimal_parts_zval(pt_arena *arena, bool negative, pt_s integer, pt_s fraction, zval *result)
{
    (void)arena;
    array_init(result);
    add_next_index_bool(result, negative);
    add_next_index_stringl(result, integer.s, integer.n);
    add_next_index_stringl(result, fraction.s, fraction.n);
}

static bool pt_round_decimal(pt_arena *arena, double value, zend_long decimals, bool *negative, pt_s *integer, pt_s *fraction);

/* Splits `value` into its sign and decimal parts, rounded to `decimals` places when `rounded` and in full positional form
 * otherwise, and builds `result` from them with `build`; false, with result untouched, when the value has no such form. */
static bool pt_decimal_result(double value, zend_long decimals, bool rounded, pt_decimal_build build, zval *result)
{
    pt_arena arena;
    pt_arena_init(&arena);
    bool negative;
    pt_s integer, fraction;
    bool ok = rounded ? pt_round_decimal(&arena, value, decimals, &negative, &integer, &fraction)
                      : pt_positional(&arena, value, &negative, &integer, &fraction);
    if (ok) {
        build(&arena, negative, integer, fraction, result);
    }
    pt_arena_free(&arena);

    return ok;
}

bool pt_number_positional(double value, zval *result)
{
    return pt_decimal_result(value, 0, false, pt_decimal_parts_zval, result);
}

/* The digits of a decimal string plus one unit in its last place (Number::increment). */
static pt_s pt_increment(pt_arena *arena, pt_s digits)
{
    size_t p = digits.n;
    while (p > 0 && digits.s[p - 1] == '9') {
        p--;
    }
    pt_buf buf;
    pt_buf_init(&buf, arena);
    if (p == 0) {
        pt_buf_addc(&buf, '1');
        for (size_t i = 0; i < digits.n; i++) {
            pt_buf_addc(&buf, '0');
        }
        return pt_buf_done(&buf);
    }
    pt_buf_add(&buf, digits.s, p - 1);
    pt_buf_addc(&buf, (char)(digits.s[p - 1] + 1));
    for (size_t i = p; i < digits.n; i++) {
        pt_buf_addc(&buf, '0');
    }

    return pt_buf_done(&buf);
}

/* FUN-22: the positional digits rounded half away from zero to `decimals` places (Number::roundDecimal). The
 * PHP string offsets and substr of a negative count are reproduced as the library reads them. */
static bool pt_round_decimal(pt_arena *arena, double value, zend_long decimals, bool *negative, pt_s *integer, pt_s *fraction)
{
    pt_s whole, rest;
    if (!pt_positional(arena, value, negative, &whole, &rest)) {
        return false;
    }
    zend_long length = (zend_long)rest.n;
    if (length <= decimals) {
        pt_buf buf;
        pt_buf_init(&buf, arena);
        pt_buf_adds(&buf, rest);
        for (zend_long i = length; i < decimals; i++) {
            pt_buf_addc(&buf, '0');
        }
        *integer = whole;
        *fraction = pt_buf_done(&buf);
        return true;
    }
    /* $fraction[$decimals]: a negative offset counts from the end, and an offset before the start reads as "". */
    bool round_up = false;
    zend_long offset = decimals >= 0 ? decimals : length + decimals;
    if (offset >= 0) {
        round_up = (unsigned char)rest.s[offset] >= 0x35;
    } else {
        zend_error(E_WARNING, "Uninitialized string offset " ZEND_LONG_FMT, decimals);
        if (EG(exception)) {
            return false;
        }
    }
    /* substr($fraction, 0, $decimals): a negative length leaves the text before its last $decimals bytes. */
    zend_long keep = decimals >= 0 ? decimals : length + decimals;
    if (keep < 0) {
        keep = 0;
    }
    pt_buf kept;
    pt_buf_init(&kept, arena);
    pt_buf_adds(&kept, whole);
    pt_buf_add(&kept, rest.s, (size_t)keep);
    pt_s digits = pt_buf_done(&kept);
    if (round_up) {
        digits = pt_increment(arena, digits);
    }
    if (decimals < 0) {
        /* The split is strlen($kept) - $decimals, which PHP computes as a float when it does not fit; substr then fails. */
        zend_ulong magnitude = (zend_ulong)0 - (zend_ulong)decimals;
        if ((zend_ulong)digits.n + magnitude > (zend_ulong)ZEND_LONG_MAX) {
            zend_type_error("substr(): Argument #3 ($length) must be of type ?int, float given");
            return false;
        }
        /* The split falls after the end of the digits, so the integer part is all of them. */
        *integer = digits;
        *fraction = PT_S("");
        return true;
    }
    size_t split = digits.n - (size_t)decimals;
    *integer = pt_strdup(arena, digits.s, split);
    if (integer->n == 0) {
        *integer = PT_S("0");
    }
    *fraction = pt_strdup(arena, digits.s + split, digits.n - split);

    return true;
}

bool pt_number_round_decimal(double value, zend_long decimals, zval *result)
{
    return pt_decimal_result(value, decimals, true, pt_decimal_parts_zval, result);
}

/* The number that the sign and the decimal parts spell. */
static void pt_decimal_number_zval(pt_arena *arena, bool negative, pt_s integer, pt_s fraction, zval *result)
{
    pt_buf buf;
    pt_buf_init(&buf, arena);
    pt_buf_adds(&buf, integer);
    if (fraction.n > 0) {
        pt_buf_addc(&buf, '.');
        pt_buf_adds(&buf, fraction);
    }
    pt_s digits = pt_buf_done(&buf);
    double parsed = zend_strtod(digits.s, NULL);
    if (negative && parsed != 0.0) {
        parsed = -parsed;
    }
    ZVAL_DOUBLE(result, parsed);
}

/* FUN-25: the rounded value as a number. */
bool pt_number_round(double value, zend_long decimals, zval *result)
{
    return pt_decimal_result(value, decimals, true, pt_decimal_number_zval, result);
}

/* FUN-20 to FUN-24: the grouped text of a number with `decimals` places (Number::format). */
bool pt_number_format(double value, zend_long decimals, zend_string *dec, zend_string *thousands, zval *result)
{
    pt_arena arena;
    pt_arena_init(&arena);
    bool negative;
    pt_s integer, fraction;
    if (!pt_round_decimal(&arena, value, decimals, &negative, &integer, &fraction)) {
        pt_arena_free(&arena);
        return false;
    }
    bool all_zero = true;
    for (size_t i = 0; i < integer.n && all_zero; i++) {
        all_zero = integer.s[i] == '0';
    }
    for (size_t i = 0; i < fraction.n && all_zero; i++) {
        all_zero = fraction.s[i] == '0';
    }
    pt_buf buf;
    pt_buf_init(&buf, &arena);
    if (negative && !all_zero) {
        pt_buf_addc(&buf, '-');
    }
    /* The groups of three digits from the end; the first group holds the remaining one to three digits. */
    size_t count = integer.n;
    size_t first = count <= 3 ? count : (count % 3 == 0 ? 3 : count % 3);
    pt_buf_add(&buf, integer.s, first);
    for (size_t at = first; at < count; at += 3) {
        pt_buf_add(&buf, ZSTR_VAL(thousands), ZSTR_LEN(thousands));
        pt_buf_add(&buf, integer.s + at, 3);
    }
    if (decimals > 0) {
        pt_buf_add(&buf, ZSTR_VAL(dec), ZSTR_LEN(dec));
        pt_buf_adds(&buf, fraction);
    }
    pt_s text = pt_buf_done(&buf);
    ZVAL_STRINGL(result, text.s, text.n);
    pt_arena_free(&arena);

    return true;
}

/* VAL-21 and HostArgument::of: the host form of a value. A number is a float, a safe string its text, a list or a map an
 * array with the keys of its entries at every depth, and a native object stays the object. */
void pt_host_argument(zval *value, zval *result);

static void pt_host_entries(HashTable *table, zval *result)
{
    array_init_size(result, zend_hash_num_elements(table));
    zend_ulong index;
    zend_string *key;
    zval *item;
    ZEND_HASH_FOREACH_KEY_VAL(table, index, key, item) {
        zval converted;
        pt_host_argument(item, &converted);
        if (key != NULL) {
            zend_symtable_update(Z_ARRVAL_P(result), key, &converted);
        } else {
            zend_hash_index_update(Z_ARRVAL_P(result), index, &converted);
        }
    } ZEND_HASH_FOREACH_END();
}

void pt_host_argument(zval *value, zval *result)
{
    ZVAL_DEREF(value);
    switch (Z_TYPE_P(value)) {
        case IS_LONG:
            ZVAL_DOUBLE(result, (double)Z_LVAL_P(value));
            return;
        case IS_ARRAY:
            pt_host_entries(Z_ARRVAL_P(value), result);
            return;
        case IS_OBJECT:
            if (Z_OBJCE_P(value) == pt_safe_string_ce) {
                zval rv;
                ZVAL_COPY(result, zend_read_property(pt_safe_string_ce, Z_OBJ_P(value), ZEND_STRL("text"), 1, &rv));
                return;
            }
            if (Z_OBJCE_P(value) == pt_map_value_ce) {
                pt_host_entries(pt_map_items(value), result);
                return;
            }
            ZVAL_COPY(result, value);
            return;
        default:
            ZVAL_COPY(result, value);
            return;
    }
}

/* HostArgument::list: the host form of each element of a list, with the keys of the list kept. */
void pt_host_argument_list(HashTable *args, zval *result)
{
    pt_host_entries(args, result);
}
