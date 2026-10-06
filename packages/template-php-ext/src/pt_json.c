/*
 * JSON text read into template values in document order with the number rules of VAL-12 (VAL-2,
 * VAL-12, VAL-20), and the JSON text of a value for the function json (FUN-26 to FUN-28).
 */
#include "pt.h"
#include "Zend/zend_strtod.h"
#include <math.h>

typedef struct pt_json {
    pt_arena *arena;
    const char *text;
    size_t length, index;
    int level;
    pt_bind_error *error;
} pt_json;

static bool pt_json_fail(pt_json *json, const char *message)
{
    json->error->code = "E_DATA_INVALID_JSON";
    json->error->message = zend_strpprintf(0, "%s at offset %zu", message, json->index);
    return false;
}

static bool pt_json_level(pt_json *json)
{
    if (++json->level > PT_MAX_DEPTH) {
        json->error->code = "E_DATA_DEPTH";
        json->error->message = zend_strpprintf(0, "lists and maps nest deeper than %d levels", PT_MAX_DEPTH);
        return false;
    }
    return true;
}

static void pt_json_space(pt_json *json)
{
    while (json->index < json->length) {
        char c = json->text[json->index];
        if (c != ' ' && c != '\t' && c != '\n' && c != '\r') {
            break;
        }
        json->index++;
    }
}

static int pt_json_peek(pt_json *json)
{
    return json->index < json->length ? (unsigned char)json->text[json->index] : -1;
}

static int pt_hex(int c)
{
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
        return c - 'a' + 10;
    }
    if (c >= 'A' && c <= 'F') {
        return c - 'A' + 10;
    }
    return -1;
}

static bool pt_json_hex4(pt_json *json, size_t at, uint32_t *code)
{
    if (at + 4 > json->length) {
        return false;
    }
    uint32_t value = 0;
    for (size_t k = 0; k < 4; k++) {
        int digit = pt_hex((unsigned char)json->text[at + k]);
        if (digit < 0) {
            return false;
        }
        value = value * 16 + (uint32_t)digit;
    }
    *code = value;
    return true;
}

static bool pt_json_string(pt_json *json, pt_s *result)
{
    json->index++;
    pt_buf buf;
    pt_buf_init(&buf, json->arena);
    size_t start = json->index;
    for (;;) {
        if (json->index >= json->length) {
            return pt_json_fail(json, "unterminated string");
        }
        unsigned char c = (unsigned char)json->text[json->index];
        if (c == '"') {
            pt_buf_add(&buf, json->text + start, json->index - start);
            json->index++;
            *result = pt_buf_done(&buf);
            return true;
        }
        if (c == '\\') {
            pt_buf_add(&buf, json->text + start, json->index - start);
            json->index++;
            int escape = pt_json_peek(json);
            switch (escape) {
                case '"': pt_buf_addc(&buf, '"'); break;
                case '\\': pt_buf_addc(&buf, '\\'); break;
                case '/': pt_buf_addc(&buf, '/'); break;
                case 'b': pt_buf_addc(&buf, '\b'); break;
                case 'f': pt_buf_addc(&buf, '\f'); break;
                case 'n': pt_buf_addc(&buf, '\n'); break;
                case 'r': pt_buf_addc(&buf, '\r'); break;
                case 't': pt_buf_addc(&buf, '\t'); break;
                case 'u': {
                    uint32_t code;
                    if (!pt_json_hex4(json, json->index + 1, &code)) {
                        return pt_json_fail(json, "invalid unicode escape");
                    }
                    json->index += 4;
                    if (code >= 0xD800 && code <= 0xDBFF && json->index + 2 < json->length && json->text[json->index + 1] == '\\' && json->text[json->index + 2] == 'u') {
                        uint32_t low;
                        if (pt_json_hex4(json, json->index + 3, &low) && low >= 0xDC00 && low <= 0xDFFF) {
                            json->index += 6;
                            code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                        }
                    }
                    if (code >= 0xD800 && code <= 0xDFFF) {
                        json->error->code = "E_DATA_INVALID_UTF8";
                        json->error->message = zend_string_init("a \\u escape leaves a surrogate unpaired", 39, 0);
                        return false;
                    }
                    pt_utf8_append(&buf, code);
                    break;
                }
                default:
                    return pt_json_fail(json, "invalid escape");
            }
            json->index++;
            start = json->index;
            continue;
        }
        if (c < 0x20) {
            return pt_json_fail(json, "control character in string");
        }
        json->index++;
    }
}

static bool pt_json_number(pt_json *json, pt_value *result)
{
    /* ^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)? */
    size_t i = json->index, n = json->length;
    const char *t = json->text;
    if (i < n && t[i] == '-') {
        i++;
    }
    if (i < n && t[i] == '0') {
        i++;
    } else if (i < n && t[i] >= '1' && t[i] <= '9') {
        while (i < n && t[i] >= '0' && t[i] <= '9') {
            i++;
        }
    } else {
        return pt_json_fail(json, "invalid number");
    }
    if (i + 1 < n && t[i] == '.' && t[i + 1] >= '0' && t[i + 1] <= '9') {
        i++;
        while (i < n && t[i] >= '0' && t[i] <= '9') {
            i++;
        }
    }
    if (i < n && (t[i] == 'e' || t[i] == 'E')) {
        size_t j = i + 1;
        if (j < n && (t[j] == '+' || t[j] == '-')) {
            j++;
        }
        if (j < n && t[j] >= '0' && t[j] <= '9') {
            while (j < n && t[j] >= '0' && t[j] <= '9') {
                j++;
            }
            i = j;
        }
    }
    pt_s literal = pt_strdup(json->arena, t + json->index, i - json->index);
    json->index = i;
    /* The nearest double decides, whatever the spelling of the literal (VAL-2). */
    double value = zend_strtod(literal.s, NULL);
    if (!isfinite(value)) {
        json->error->code = "E_DATA_NUMBER_NOT_FINITE";
        json->error->message = zend_string_init("number is not finite", 20, 0);
        return false;
    }
    if (fabs(value) > PT_MAX_SAFE) {
        json->error->code = "E_DATA_NUMBER_RANGE";
        json->error->message = zend_strpprintf(0, "number %s is outside the safe range", literal.s);
        return false;
    }
    *result = pt_number(value);
    return true;
}

static bool pt_json_word(pt_json *json, const char *word, pt_value value, pt_value *result)
{
    size_t length = strlen(word);
    if (json->index + length <= json->length && memcmp(json->text + json->index, word, length) == 0) {
        json->index += length;
        *result = value;
        return true;
    }
    char message[32];
    snprintf(message, sizeof(message), "expected %s", word);
    return pt_json_fail(json, message);
}

static bool pt_json_value(pt_json *json, pt_value *result)
{
    pt_json_space(json);
    int c = pt_json_peek(json);
    switch (c) {
        case '{': {
            if (!pt_json_level(json)) {
                return false;
            }
            pt_map *map = pt_map_new(json->arena, 4);
            json->index++;
            pt_json_space(json);
            if (pt_json_peek(json) == '}') {
                json->index++;
                json->level--;
                *result = pt_map_value(map);
                return true;
            }
            for (;;) {
                pt_json_space(json);
                if (pt_json_peek(json) != '"') {
                    return pt_json_fail(json, "expected a string key");
                }
                pt_s key;
                if (!pt_json_string(json, &key)) {
                    return false;
                }
                pt_json_space(json);
                if (pt_json_peek(json) != ':') {
                    return pt_json_fail(json, "expected \":\"");
                }
                json->index++;
                pt_value item;
                if (!pt_json_value(json, &item)) {
                    return false;
                }
                pt_map_set(map, key, item);
                pt_json_space(json);
                int next = pt_json_peek(json);
                if (next == ',') {
                    json->index++;
                    continue;
                }
                if (next == '}') {
                    json->index++;
                    json->level--;
                    *result = pt_map_value(map);
                    return true;
                }
                return pt_json_fail(json, "expected \",\" or \"}\"");
            }
        }
        case '[': {
            if (!pt_json_level(json)) {
                return false;
            }
            pt_vec items;
            pt_vec_init(&items, json->arena);
            json->index++;
            pt_json_space(json);
            if (pt_json_peek(json) == ']') {
                json->index++;
                json->level--;
                *result = pt_list_value(pt_vec_list(&items));
                return true;
            }
            for (;;) {
                pt_value item;
                if (!pt_json_value(json, &item)) {
                    return false;
                }
                pt_vec_push(&items, item);
                pt_json_space(json);
                int next = pt_json_peek(json);
                if (next == ',') {
                    json->index++;
                    continue;
                }
                if (next == ']') {
                    json->index++;
                    json->level--;
                    *result = pt_list_value(pt_vec_list(&items));
                    return true;
                }
                return pt_json_fail(json, "expected \",\" or \"]\"");
            }
        }
        case '"': {
            pt_s text;
            if (!pt_json_string(json, &text)) {
                return false;
            }
            *result = pt_string(text);
            return true;
        }
        case 't': return pt_json_word(json, "true", pt_bool(true), result);
        case 'f': return pt_json_word(json, "false", pt_bool(false), result);
        case 'n': return pt_json_word(json, "null", pt_null(), result);
        default:
            if (c == '-' || (c >= '0' && c <= '9')) {
                return pt_json_number(json, result);
            }
            return pt_json_fail(json, "unexpected character");
    }
}

bool pt_json_parse(pt_arena *arena, const char *text, size_t length, pt_value *result, pt_bind_error *error)
{
    size_t invalid = pt_utf8_first_invalid(text, length);
    if (invalid < length) {
        error->code = "E_DATA_INVALID_UTF8";
        error->message = zend_strpprintf(0, "invalid UTF-8 at byte %zu", invalid);
        return false;
    }
    pt_json json = {arena, text, length, 0, 0, error};
    if (!pt_json_value(&json, result)) {
        return false;
    }
    pt_json_space(&json);
    if (json.index < length) {
        return pt_json_fail(&json, "unexpected character after the JSON value");
    }
    return true;
}

/* FUN-27: JSON string escaping, with <, >, &, U+2028 and U+2029 escaped. */
static void pt_json_quote_into(pt_buf *buf, pt_s text)
{
    pt_buf_addc(buf, '"');
    for (size_t i = 0; i < text.n; i++) {
        unsigned char c = (unsigned char)text.s[i];
        switch (c) {
            case '"': PT_BUF_LIT(buf, "\\\""); break;
            case '\\': PT_BUF_LIT(buf, "\\\\"); break;
            case '\n': PT_BUF_LIT(buf, "\\n"); break;
            case '\r': PT_BUF_LIT(buf, "\\r"); break;
            case '\t': PT_BUF_LIT(buf, "\\t"); break;
            case '\b': PT_BUF_LIT(buf, "\\b"); break;
            case '\f': PT_BUF_LIT(buf, "\\f"); break;
            case '<': PT_BUF_LIT(buf, "\\u003c"); break;
            case '>': PT_BUF_LIT(buf, "\\u003e"); break;
            case '&': PT_BUF_LIT(buf, "\\u0026"); break;
            default:
                if (c < 0x20) {
                    char escaped[8];
                    snprintf(escaped, sizeof(escaped), "\\u%04x", c);
                    pt_buf_add(buf, escaped, 6);
                } else if (c == 0xE2 && i + 2 < text.n && (unsigned char)text.s[i + 1] == 0x80 && (unsigned char)text.s[i + 2] == 0xA8) {
                    PT_BUF_LIT(buf, "\\u2028");
                    i += 2;
                } else if (c == 0xE2 && i + 2 < text.n && (unsigned char)text.s[i + 1] == 0x80 && (unsigned char)text.s[i + 2] == 0xA9) {
                    PT_BUF_LIT(buf, "\\u2029");
                    i += 2;
                } else {
                    pt_buf_addc(buf, (char)c);
                }
        }
    }
    pt_buf_addc(buf, '"');
}

void pt_json_write(pt_buf *buf, pt_value value)
{
    switch (value.type) {
        case PT_NULL: PT_BUF_LIT(buf, "null"); return;
        case PT_BOOL:
            if (value.u.b) {
                PT_BUF_LIT(buf, "true");
            } else {
                PT_BUF_LIT(buf, "false");
            }
            return;
        case PT_NUMBER: pt_buf_adds(buf, pt_number_text(buf->arena, value.u.number)); return;
        case PT_STRING:
        case PT_SAFE: pt_json_quote_into(buf, value.u.str); return;
        case PT_LIST:
            pt_buf_addc(buf, '[');
            for (uint32_t i = 0; i < value.u.list->count; i++) {
                if (i) {
                    pt_buf_addc(buf, ',');
                }
                pt_json_write(buf, value.u.list->items[i]);
            }
            pt_buf_addc(buf, ']');
            return;
        case PT_MAP: {
            pt_buf_addc(buf, '{');
            bool first = true;
            const pt_map *map = value.u.map;
            for (uint32_t i = 0; i < map->used; i++) {
                if (!map->entries[i].live) {
                    continue;
                }
                if (!first) {
                    pt_buf_addc(buf, ',');
                }
                first = false;
                pt_json_quote_into(buf, map->entries[i].key);
                pt_buf_addc(buf, ':');
                pt_json_write(buf, map->entries[i].value);
            }
            pt_buf_addc(buf, '}');
            return;
        }
        default:
            /* A native object has no JSON form; it is written as null like in every other runtime. */
            PT_BUF_LIT(buf, "null");
            return;
    }
}
