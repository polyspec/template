/*
 * The parser: expression tokens and expressions (EXP-1 to EXP-16, CNF-13), tag detection (LEX-5 to
 * LEX-21), tag bodies and block structure (GRM-*), standalone lines (LEX-14, LEX-15) and the AST
 * (AST-*).
 */
#include "pt.h"
#include "Zend/zend_strtod.h"

/* ----------------------------------------------------------------------------------------------- */
/* Source                                                                                           */
/* ----------------------------------------------------------------------------------------------- */

typedef struct pt_source {
    pt_run *run;
    pt_arena *arena; /* the arena of the template */
    pt_s name;
    const char *text;
    size_t length;
    pt_lines lines;
} pt_source;

ZEND_NORETURN static void pt_parse_fail(pt_source *source, const char *code, size_t start, size_t end, zend_string *message)
{
    pt_fail_at(source->run, code, source->name, &source->lines, start, end, message);
}

static inline int pt_char_at(const pt_source *source, size_t index)
{
    return index < source->length ? (unsigned char)source->text[index] : -1;
}

static inline bool pt_alpha(int c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }
static inline bool pt_digit(int c) { return c >= '0' && c <= '9'; }
static inline bool pt_ident_start(int c) { return pt_alpha(c) || c == '_'; }
static inline bool pt_ident_part(int c) { return pt_alpha(c) || pt_digit(c) || c == '_'; }
static inline bool pt_horizontal(int c) { return c == ' ' || c == '\t'; }

static size_t pt_skip_horizontal(const pt_source *source, size_t index)
{
    while (index < source->length && pt_horizontal((unsigned char)source->text[index])) {
        index++;
    }
    return index;
}

static bool pt_starts_with(const pt_source *source, size_t index, const char *bytes, size_t length)
{
    return index <= source->length && source->length - index >= length && memcmp(source->text + index, bytes, length) == 0;
}

/* strpos(text, close, from) !== false */
static bool pt_contains_from(const pt_source *source, char close, size_t from)
{
    return from < source->length && memchr(source->text + from, close, source->length - from) != NULL;
}

static zend_string *pt_quote_range(const pt_source *source, size_t start, size_t end)
{
    if (end > source->length) {
        end = source->length;
    }
    return pt_json_quote(source->text + start, end > start ? end - start : 0);
}

/* ----------------------------------------------------------------------------------------------- */
/* Expression tokens (EXP-1 to EXP-6)                                                               */
/* ----------------------------------------------------------------------------------------------- */

typedef enum pt_token_type {
    T_EOF, T_CLOSE, T_IDENT, T_NULL, T_TRUE, T_FALSE, T_IN, T_NUMBER, T_STRING, T_DOT_IDENT, T_DOT_INDEX, T_SPREAD,
    T_SEQ, T_SNE, T_EQ, T_NE, T_LE, T_GE, T_AND, T_OR, T_COALESCE, T_ELVIS, T_DOUBLE_COLON, T_ARROW,
    T_LPAREN, T_RPAREN, T_LBRACKET, T_RBRACKET, T_COMMA, T_PIPE, T_QUESTION, T_COLON,
    T_PLUS, T_MINUS, T_STAR, T_SLASH, T_PERCENT, T_BANG, T_LT, T_GT,
} pt_token_type;

typedef struct pt_token {
    pt_token_type type;
    size_t start, end;
    pt_s decoded; /* T_STRING */
} pt_token;

static const struct {
    const char *text;
    size_t length;
    pt_token_type type;
} pt_operators[] = {
    {"===", 3, T_SEQ}, {"!==", 3, T_SNE}, {"...", 3, T_SPREAD},
    {"==", 2, T_EQ}, {"!=", 2, T_NE}, {"<=", 2, T_LE}, {">=", 2, T_GE}, {"&&", 2, T_AND}, {"||", 2, T_OR},
    {"??", 2, T_COALESCE}, {"?:", 2, T_ELVIS}, {"::", 2, T_DOUBLE_COLON}, {"=>", 2, T_ARROW},
    {"(", 1, T_LPAREN}, {")", 1, T_RPAREN}, {"[", 1, T_LBRACKET}, {"]", 1, T_RBRACKET}, {",", 1, T_COMMA},
    {"|", 1, T_PIPE}, {"?", 1, T_QUESTION}, {":", 1, T_COLON}, {"+", 1, T_PLUS}, {"-", 1, T_MINUS},
    {"*", 1, T_STAR}, {"/", 1, T_SLASH}, {"%", 1, T_PERCENT}, {"!", 1, T_BANG}, {"<", 1, T_LT}, {">", 1, T_GT},
};

#define PT_EXPRESSION_CHARS "()[],|?:=>.+-*/%!<&'\""

static bool pt_postfix_end(pt_token_type type)
{
    switch (type) {
        case T_IDENT: case T_NUMBER: case T_STRING: case T_NULL: case T_TRUE: case T_FALSE:
        case T_RPAREN: case T_RBRACKET: case T_DOT_IDENT: case T_DOT_INDEX:
            return true;
        default:
            return false;
    }
}

typedef struct pt_lexer {
    pt_source *source;
    size_t index;
    bool has_previous, has_lookahead;
    pt_token previous, lookahead;
    int nesting;
    char close;     /* 0 for a bare expression */
    int close_count;
    bool has_open;
    size_t open_index;
    bool close_is_expression_char;
} pt_lexer;

/* Reads a string literal that starts at the quote at `start` (EXP-3). */
static pt_s pt_string_literal(pt_source *source, size_t start, size_t *after)
{
    const char *text = source->text;
    size_t length = source->length;
    char quote = text[start];
    pt_buf decoded;
    pt_buf_init(&decoded, source->arena);
    size_t index = start + 1;
    for (;;) {
        if (index >= length) {
            pt_parse_fail(source, "E_PARSE_UNTERMINATED_STRING", start, start + 1, zend_string_init("string literal is not terminated", 32, 0));
        }
        char c = text[index];
        if (c == quote) {
            *after = index + 1;
            return pt_buf_done(&decoded);
        }
        if (c != '\\') {
            pt_buf_addc(&decoded, c);
            index++;
            continue;
        }
        int escape = pt_char_at(source, index + 1);
        switch (escape) {
            case '\\': pt_buf_addc(&decoded, '\\'); index += 2; break;
            case '\'': pt_buf_addc(&decoded, '\''); index += 2; break;
            case '"': pt_buf_addc(&decoded, '"'); index += 2; break;
            case 'n': pt_buf_addc(&decoded, '\n'); index += 2; break;
            case 'r': pt_buf_addc(&decoded, '\r'); index += 2; break;
            case 't': pt_buf_addc(&decoded, '\t'); index += 2; break;
            case 'u': {
                uint32_t code = 0;
                for (size_t k = 0; k < 4; k++) {
                    int h = pt_char_at(source, index + 2 + k);
                    int v = pt_digit(h) ? h - '0' : (h >= 'a' && h <= 'f') ? h - 'a' + 10 : (h >= 'A' && h <= 'F') ? h - 'A' + 10 : -1;
                    if (v < 0) {
                        pt_parse_fail(source, "E_PARSE_INVALID_ESCAPE", index, index + 2, zend_string_init("invalid escape sequence", 23, 0));
                    }
                    code = code * 16 + (uint32_t)v;
                }
                index += 6;
                if (code >= 0xD800 && code <= 0xDBFF && pt_starts_with(source, index, "\\u", 2)) {
                    uint32_t low = 0;
                    bool valid = true;
                    for (size_t k = 0; k < 4; k++) {
                        int h = pt_char_at(source, index + 2 + k);
                        int v = pt_digit(h) ? h - '0' : (h >= 'a' && h <= 'f') ? h - 'a' + 10 : (h >= 'A' && h <= 'F') ? h - 'A' + 10 : -1;
                        if (v < 0) {
                            valid = false;
                            break;
                        }
                        low = low * 16 + (uint32_t)v;
                    }
                    if (valid && low >= 0xDC00 && low <= 0xDFFF) {
                        code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                        index += 6;
                    }
                }
                pt_utf8_append(&decoded, code);
                break;
            }
            default:
                pt_parse_fail(source, "E_PARSE_INVALID_ESCAPE", index, index + 2, zend_string_init("invalid escape sequence", 23, 0));
        }
    }
}

static void pt_lexer_init(pt_lexer *lexer, pt_source *source, size_t start, char close, int close_count, bool has_open, size_t open_index)
{
    memset(lexer, 0, sizeof(*lexer));
    lexer->source = source;
    lexer->index = start;
    lexer->close = close;
    lexer->close_count = close_count;
    lexer->has_open = has_open;
    lexer->open_index = open_index;
    lexer->close_is_expression_char = close != 0 && strchr(PT_EXPRESSION_CHARS, close) != NULL;
}

static pt_token pt_token_make(pt_token_type type, size_t start, size_t end)
{
    pt_token token;
    token.type = type;
    token.start = start;
    token.end = end;
    token.decoded = (pt_s){"", 0};
    return token;
}

static pt_token pt_read_number(pt_lexer *lexer, size_t start)
{
    pt_source *source = lexer->source;
    size_t length = source->length;
    size_t end = start;
    while (end < length && pt_digit(source->text[end])) {
        end++;
    }
    if (pt_char_at(source, end) == '.' && end + 1 < length && pt_digit(source->text[end + 1])) {
        end++;
        while (end < length && pt_digit(source->text[end])) {
            end++;
        }
    }
    int e = pt_char_at(source, end);
    if (e == 'e' || e == 'E') {
        size_t cursor = end + 1;
        int sign = pt_char_at(source, cursor);
        if (sign == '+' || sign == '-') {
            cursor++;
        }
        if (cursor < length && pt_digit(source->text[cursor])) {
            while (cursor < length && pt_digit(source->text[cursor])) {
                cursor++;
            }
            end = cursor;
        } else {
            pt_parse_fail(source, "E_PARSE_INVALID_NUMBER", start, cursor, zend_strpprintf(0, "invalid number %s", ZSTR_VAL(pt_quote_range(source, start, cursor))));
        }
    }
    int following = pt_char_at(source, end);
    bool close_at_end = lexer->close != 0 && lexer->nesting == 0 && following == lexer->close;
    if (end < length && (pt_ident_part(following) || (following == '.' && !close_at_end))) {
        size_t cursor = end + 1;
        while (cursor < length && (pt_ident_part((unsigned char)source->text[cursor]) || source->text[cursor] == '.')) {
            cursor++;
        }
        pt_parse_fail(source, "E_PARSE_INVALID_NUMBER", start, cursor, zend_strpprintf(0, "invalid number %s", ZSTR_VAL(pt_quote_range(source, start, cursor))));
    }
    lexer->index = end;
    return pt_token_make(T_NUMBER, start, end);
}

static pt_token pt_read_dot(pt_lexer *lexer, size_t start)
{
    pt_source *source = lexer->source;
    size_t length = source->length;
    if (pt_starts_with(source, start, "...", 3)) {
        lexer->index = start + 3;
        return pt_token_make(T_SPREAD, start, start + 3);
    }
    int next = pt_char_at(source, start + 1);
    bool adjacent = lexer->has_previous && lexer->previous.end == start && pt_postfix_end(lexer->previous.type);
    if (adjacent && next >= 0 && pt_ident_start(next)) {
        size_t end = start + 2;
        while (end < length && pt_ident_part((unsigned char)source->text[end])) {
            end++;
        }
        lexer->index = end;
        return pt_token_make(T_DOT_IDENT, start, end);
    }
    if (adjacent && next >= 0 && pt_digit(next)) {
        size_t end = start + 2;
        while (end < length && pt_digit(source->text[end])) {
            end++;
        }
        lexer->index = end;
        return pt_token_make(T_DOT_INDEX, start, end);
    }
    if (next >= 0 && pt_digit(next)) {
        size_t end = start + 1;
        while (end < length && (pt_ident_part((unsigned char)source->text[end]) || source->text[end] == '.')) {
            end++;
        }
        pt_parse_fail(source, "E_PARSE_INVALID_NUMBER", start, end, zend_strpprintf(0, "invalid number %s", ZSTR_VAL(pt_quote_range(source, start, end))));
    }
    pt_parse_fail(source, "E_PARSE_UNEXPECTED_TOKEN", start, start + 1, zend_string_init("unexpected \".\"", 14, 0));
}

static pt_token pt_lexer_read(pt_lexer *lexer)
{
    pt_source *source = lexer->source;
    const char *text = source->text;
    size_t length = source->length;
    while (lexer->index < length && (text[lexer->index] == ' ' || text[lexer->index] == '\t' || text[lexer->index] == '\r' || text[lexer->index] == '\n')) {
        lexer->index++;
    }
    size_t start = lexer->index;
    if (start >= length) {
        return pt_token_make(T_EOF, start, start);
    }
    if (lexer->close != 0 && ((lexer->has_previous && pt_postfix_end(lexer->previous.type) && lexer->nesting == 0) || !lexer->close_is_expression_char)) {
        bool all = true;
        for (int k = 0; k < lexer->close_count; k++) {
            if (pt_char_at(source, start + (size_t)k) != lexer->close) {
                all = false;
                break;
            }
        }
        if (all) {
            lexer->index = start + (size_t)lexer->close_count;
            return pt_token_make(T_CLOSE, start, lexer->index);
        }
    }
    int c = (unsigned char)text[start];
    if (pt_ident_start(c)) {
        size_t end = start + 1;
        while (end < length && pt_ident_part((unsigned char)text[end])) {
            end++;
        }
        lexer->index = end;
        pt_s word = {text + start, end - start};
        pt_token_type type = T_IDENT;
        if (PT_EQ(word, "null")) {
            type = T_NULL;
        } else if (PT_EQ(word, "true")) {
            type = T_TRUE;
        } else if (PT_EQ(word, "false")) {
            type = T_FALSE;
        } else if (PT_EQ(word, "in")) {
            type = T_IN;
        }
        return pt_token_make(type, start, end);
    }
    if (pt_digit(c)) {
        return pt_read_number(lexer, start);
    }
    if (c == '"' || c == '\'') {
        size_t end;
        pt_s decoded = pt_string_literal(source, start, &end);
        lexer->index = end;
        pt_token token = pt_token_make(T_STRING, start, end);
        token.decoded = decoded;
        return token;
    }
    if (c == '.') {
        return pt_read_dot(lexer, start);
    }
    for (size_t i = 0; i < sizeof(pt_operators) / sizeof(pt_operators[0]); i++) {
        if (pt_starts_with(source, start, pt_operators[i].text, pt_operators[i].length)) {
            lexer->index = start + pt_operators[i].length;
            return pt_token_make(pt_operators[i].type, start, lexer->index);
        }
    }
    zend_string *quoted = pt_quote_range(source, start, start + 1);
    pt_parse_fail(source, "E_PARSE_UNEXPECTED_TOKEN", start, start + 1, zend_strpprintf(0, "unexpected character %s", ZSTR_VAL(quoted)));
}

static pt_token pt_peek(pt_lexer *lexer)
{
    if (!lexer->has_lookahead) {
        lexer->lookahead = pt_lexer_read(lexer);
        lexer->has_lookahead = true;
    }
    return lexer->lookahead;
}

static pt_token pt_next(pt_lexer *lexer)
{
    pt_token token = pt_peek(lexer);
    lexer->has_lookahead = false;
    lexer->previous = token;
    lexer->has_previous = true;
    if (token.type == T_LPAREN || token.type == T_LBRACKET) {
        lexer->nesting++;
    }
    if (token.type == T_RPAREN || token.type == T_RBRACKET) {
        lexer->nesting--;
    }
    return token;
}

static size_t pt_consumed_end(const pt_lexer *lexer)
{
    return lexer->has_previous ? lexer->previous.end : lexer->index;
}

/* ----------------------------------------------------------------------------------------------- */
/* Expressions (EXP-7 to EXP-16)                                                                    */
/* ----------------------------------------------------------------------------------------------- */

#define PT_PARSE_DEPTH_LIMIT 64

typedef struct pt_eparser {
    pt_lexer lexer;
    int depth;
} pt_eparser;

typedef struct pt_exprs {
    pt_arena *arena;
    pt_expr **items;
    uint32_t count, capacity;
} pt_exprs;

static void pt_exprs_push(pt_exprs *list, pt_expr *expr)
{
    if (list->count == list->capacity) {
        uint32_t capacity = list->capacity ? list->capacity * 2 : 4;
        pt_expr **grown = pt_alloc(list->arena, sizeof(pt_expr *) * capacity);
        if (list->count) {
            memcpy(grown, list->items, sizeof(pt_expr *) * list->count);
        }
        list->items = grown;
        list->capacity = capacity;
    }
    list->items[list->count++] = expr;
}

static pt_expr *pt_expr_new(pt_source *source, pt_expr_type type, size_t start, size_t end)
{
    pt_expr *expr = pt_alloc(source->arena, sizeof(pt_expr));
    expr->type = (uint8_t)type;
    expr->start = start;
    expr->end = end;
    return expr;
}

static pt_s pt_token_text(const pt_eparser *parser, pt_token token)
{
    return (pt_s){parser->lexer.source->text + token.start, token.end - token.start};
}

ZEND_NORETURN static void pt_unexpected(pt_eparser *parser, pt_token token)
{
    pt_lexer *lexer = &parser->lexer;
    pt_source *source = lexer->source;
    if (lexer->has_open && lexer->close != 0 && !pt_contains_from(source, lexer->close, token.start)) {
        pt_parse_fail(source, "E_PARSE_UNTERMINATED_TAG", lexer->open_index, lexer->open_index + 1, zend_string_init("tag is not terminated", 21, 0));
    }
    if (token.type == T_EOF) {
        pt_parse_fail(source, "E_PARSE_UNEXPECTED_TOKEN", token.start, token.start, zend_string_init("unexpected end of input", 23, 0));
    }
    zend_string *quoted = pt_quote_range(source, token.start, token.end);
    zend_string *message = zend_strpprintf(0, "unexpected token %s", ZSTR_VAL(quoted));
    zend_string_release(quoted);
    pt_parse_fail(source, "E_PARSE_UNEXPECTED_TOKEN", token.start, token.end, message);
}

static pt_token pt_expect(pt_eparser *parser, pt_token_type type)
{
    pt_token token = pt_peek(&parser->lexer);
    if (token.type != type) {
        pt_unexpected(parser, token);
    }
    return pt_next(&parser->lexer);
}

/* Consumes the close delimiter of a tag (LEX-11) and returns the index after it. */
static size_t pt_expect_close(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    pt_token token = pt_peek(lexer);
    if (token.type == T_CLOSE) {
        pt_next(lexer);
        return token.end;
    }
    if (token.type == T_EOF) {
        pt_unexpected(parser, token);
    }
    size_t end = 0;
    for (int k = 0; k < lexer->close_count; k++) {
        pt_token part = pt_peek(lexer);
        pt_s value = pt_token_text(parser, part);
        bool is_close = value.n == 1 && value.s[0] == lexer->close;
        if (part.type == T_STRING || part.type == T_EOF) {
            is_close = false;
        }
        if (!is_close || (k > 0 && part.start != end)) {
            pt_unexpected(parser, part);
        }
        pt_next(lexer);
        end = part.end;
    }
    return end;
}

static void pt_enter(pt_eparser *parser)
{
    parser->depth++;
    if (parser->depth > PT_PARSE_DEPTH_LIMIT) {
        pt_token token = pt_peek(&parser->lexer);
        pt_parse_fail(parser->lexer.source, "E_RUNTIME_LIMIT", token.start, token.end, zend_strpprintf(0, "expression nesting exceeds %d", PT_PARSE_DEPTH_LIMIT));
    }
}

static void pt_leave(pt_eparser *parser)
{
    parser->depth--;
}

static pt_expr *pt_parse_expression(pt_eparser *parser);
static pt_expr *pt_parse_ternary(pt_eparser *parser);
static pt_expr *pt_parse_postfix(pt_eparser *parser, bool adjacent_only);

static pt_expr *pt_binary(pt_eparser *parser, pt_operator op, pt_expr *left, pt_expr *right, size_t start, size_t end)
{
    pt_expr *expr = pt_expr_new(parser->lexer.source, X_BINARY, start, end);
    expr->op = (uint8_t)op;
    expr->a = left;
    expr->b = right;
    return expr;
}

static void pt_parse_arguments(pt_eparser *parser, pt_exprs *args)
{
    pt_lexer *lexer = &parser->lexer;
    while (pt_peek(lexer).type != T_RPAREN) {
        pt_exprs_push(args, pt_parse_expression(parser));
        if (pt_peek(lexer).type == T_COMMA) {
            pt_next(lexer);
            continue;
        }
        if (pt_peek(lexer).type != T_RPAREN) {
            pt_unexpected(parser, pt_peek(lexer));
        }
    }
}

static pt_expr *pt_call(pt_eparser *parser, pt_s name, pt_exprs *args, size_t start, size_t end)
{
    pt_expr *expr = pt_expr_new(parser->lexer.source, X_CALL, start, end);
    expr->name = name;
    expr->items = args->items;
    expr->count = args->count;
    return expr;
}

static pt_expr *pt_parse_expression(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    pt_source *source = lexer->source;
    pt_enter(parser);
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_ternary(parser);
    while (pt_peek(lexer).type == T_PIPE) {
        pt_next(lexer);
        pt_token name = pt_expect(parser, T_IDENT);
        pt_exprs args = {source->arena, NULL, 0, 0};
        pt_exprs_push(&args, left);
        size_t end = name.end;
        if (pt_peek(lexer).type == T_LPAREN) {
            pt_next(lexer);
            pt_parse_arguments(parser, &args);
            end = pt_expect(parser, T_RPAREN).end;
        }
        left = pt_call(parser, pt_strdup(source->arena, source->text + name.start, name.end - name.start), &args, start, end);
    }
    pt_leave(parser);
    return left;
}

static bool pt_expression_start(pt_token_type type)
{
    switch (type) {
        case T_IDENT: case T_NUMBER: case T_STRING: case T_NULL: case T_TRUE: case T_FALSE:
        case T_LPAREN: case T_LBRACKET: case T_BANG: case T_MINUS:
            return true;
        default:
            return false;
    }
}

static pt_expr *pt_parse_or(pt_eparser *parser);

static pt_expr *pt_parse_coalesce(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_or(parser);
    if (pt_peek(lexer).type != T_COALESCE) {
        return left;
    }
    pt_token operator = pt_next(lexer);
    if (!pt_expression_start(pt_peek(lexer).type)) {
        pt_expr *literal = pt_expr_new(lexer->source, X_LITERAL, operator.end, operator.end);
        literal->kind = L_NULL;
        literal->literal = pt_null();
        return pt_binary(parser, OP_COALESCE, left, literal, start, operator.end);
    }
    pt_expr *right = pt_parse_coalesce(parser);
    return pt_binary(parser, OP_COALESCE, left, right, start, pt_consumed_end(lexer));
}

static pt_expr *pt_parse_ternary(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *test = pt_parse_coalesce(parser);
    pt_token token = pt_peek(lexer);
    if (token.type == T_QUESTION) {
        pt_next(lexer);
        pt_expr *then = pt_parse_ternary(parser);
        pt_expect(parser, T_COLON);
        pt_expr *otherwise = pt_parse_ternary(parser);
        pt_expr *expr = pt_expr_new(lexer->source, X_TERNARY, start, pt_consumed_end(lexer));
        expr->a = test;
        expr->b = then;
        expr->c = otherwise;
        return expr;
    }
    if (token.type == T_ELVIS) {
        pt_next(lexer);
        pt_expr *otherwise = pt_parse_ternary(parser);
        pt_expr *expr = pt_expr_new(lexer->source, X_TERNARY, start, pt_consumed_end(lexer));
        expr->a = test;
        expr->b = NULL;
        expr->c = otherwise;
        return expr;
    }
    return test;
}

static pt_expr *pt_parse_and(pt_eparser *parser);

static pt_expr *pt_parse_or(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_and(parser);
    while (pt_peek(lexer).type == T_OR) {
        pt_next(lexer);
        pt_expr *right = pt_parse_and(parser);
        left = pt_binary(parser, OP_OR, left, right, start, pt_consumed_end(lexer));
    }
    return left;
}

static pt_expr *pt_parse_equality(pt_eparser *parser);

static pt_expr *pt_parse_and(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_equality(parser);
    while (pt_peek(lexer).type == T_AND) {
        pt_next(lexer);
        pt_expr *right = pt_parse_equality(parser);
        left = pt_binary(parser, OP_AND, left, right, start, pt_consumed_end(lexer));
    }
    return left;
}

static int pt_equality_operator(pt_token_type type)
{
    switch (type) {
        case T_EQ: return OP_EQ;
        case T_NE: return OP_NE;
        case T_SEQ: return OP_SEQ;
        case T_SNE: return OP_SNE;
        default: return -1;
    }
}

static int pt_comparison_operator(pt_token_type type)
{
    switch (type) {
        case T_LT: return OP_LT;
        case T_GT: return OP_GT;
        case T_LE: return OP_LE;
        case T_GE: return OP_GE;
        case T_IN: return OP_IN;
        default: return -1;
    }
}

static pt_expr *pt_parse_comparison(pt_eparser *parser);

static pt_expr *pt_parse_equality(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_comparison(parser);
    int op = pt_equality_operator(pt_peek(lexer).type);
    if (op < 0) {
        return left;
    }
    pt_next(lexer);
    pt_expr *right = pt_parse_comparison(parser);
    pt_expr *node = pt_binary(parser, (pt_operator)op, left, right, start, pt_consumed_end(lexer));
    if (pt_equality_operator(pt_peek(lexer).type) >= 0) {
        pt_unexpected(parser, pt_peek(lexer));
    }
    return node;
}

static pt_expr *pt_parse_additive(pt_eparser *parser);

static pt_expr *pt_parse_comparison(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_additive(parser);
    int op = pt_comparison_operator(pt_peek(lexer).type);
    if (op < 0) {
        return left;
    }
    pt_next(lexer);
    pt_expr *right = pt_parse_additive(parser);
    pt_expr *node = pt_binary(parser, (pt_operator)op, left, right, start, pt_consumed_end(lexer));
    if (pt_comparison_operator(pt_peek(lexer).type) >= 0) {
        pt_unexpected(parser, pt_peek(lexer));
    }
    return node;
}

static pt_expr *pt_parse_multiplicative(pt_eparser *parser);

static pt_expr *pt_parse_additive(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_multiplicative(parser);
    for (;;) {
        pt_token_type type = pt_peek(lexer).type;
        if (type != T_PLUS && type != T_MINUS) {
            return left;
        }
        pt_next(lexer);
        pt_expr *right = pt_parse_multiplicative(parser);
        left = pt_binary(parser, type == T_PLUS ? OP_ADD : OP_SUB, left, right, start, pt_consumed_end(lexer));
    }
}

static pt_expr *pt_parse_unary(pt_eparser *parser);

static pt_expr *pt_parse_multiplicative(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    size_t start = pt_peek(lexer).start;
    pt_expr *left = pt_parse_unary(parser);
    for (;;) {
        pt_token_type type = pt_peek(lexer).type;
        pt_operator op;
        if (type == T_STAR) {
            op = OP_MUL;
        } else if (type == T_SLASH) {
            op = OP_DIV;
        } else if (type == T_PERCENT) {
            op = OP_MOD;
        } else {
            return left;
        }
        pt_next(lexer);
        pt_expr *right = pt_parse_unary(parser);
        left = pt_binary(parser, op, left, right, start, pt_consumed_end(lexer));
    }
}

static pt_expr *pt_parse_unary(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    pt_token token = pt_peek(lexer);
    if (token.type == T_BANG || token.type == T_MINUS) {
        pt_next(lexer);
        pt_enter(parser);
        pt_expr *operand = pt_parse_unary(parser);
        pt_leave(parser);
        pt_expr *expr = pt_expr_new(lexer->source, X_UNARY, token.start, pt_consumed_end(lexer));
        expr->op = token.type == T_BANG ? OP_NOT : OP_NEG;
        expr->a = operand;
        return expr;
    }
    return pt_parse_postfix(parser, false);
}

static bool pt_loop_meta_field(pt_s field)
{
    return PT_EQ(field, "index_") || PT_EQ(field, "key_") || PT_EQ(field, "value_") || PT_EQ(field, "last_") || PT_EQ(field, "first_") || PT_EQ(field, "size_");
}

static pt_expr *pt_parse_bracket(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    pt_source *source = lexer->source;
    pt_token open = pt_next(lexer);
    pt_exprs entries = {source->arena, NULL, 0, 0};
    uint32_t arrows = 0;
    while (pt_peek(lexer).type != T_RBRACKET) {
        pt_token token = pt_peek(lexer);
        if (token.type == T_SPREAD) {
            pt_next(lexer);
            pt_expr *inner = pt_parse_expression(parser);
            pt_expr *spread = pt_expr_new(source, X_SPREAD, token.start, pt_consumed_end(lexer));
            spread->a = inner;
            pt_exprs_push(&entries, spread);
        } else {
            pt_expr *key = pt_parse_expression(parser);
            pt_expr *pair = pt_expr_new(source, X_PAIR, key->start, key->end);
            pair->a = key;
            if (pt_peek(lexer).type == T_ARROW) {
                pt_next(lexer);
                arrows++;
                pair->b = pt_parse_expression(parser);
            }
            pt_exprs_push(&entries, pair);
        }
        if (pt_peek(lexer).type == T_COMMA) {
            pt_next(lexer);
            continue;
        }
        if (pt_peek(lexer).type != T_RBRACKET) {
            pt_unexpected(parser, pt_peek(lexer));
        }
    }
    pt_token close = pt_next(lexer);
    if (arrows == 0) {
        for (uint32_t i = 0; i < entries.count; i++) {
            if (entries.items[i]->type == X_PAIR) {
                entries.items[i] = entries.items[i]->a;
            }
        }
        pt_expr *list = pt_expr_new(source, X_LIST, open.start, close.end);
        list->items = entries.items;
        list->count = entries.count;
        return list;
    }
    for (uint32_t i = 0; i < entries.count; i++) {
        pt_expr *entry = entries.items[i];
        if (entry->type == X_PAIR && entry->b == NULL) {
            size_t key_start = entry->a->start;
            pt_parse_fail(source, "E_PARSE_UNEXPECTED_TOKEN", key_start, key_start + 1, zend_string_init("map literal entry without \"=>\"", 30, 0));
        }
    }
    pt_expr *map = pt_expr_new(source, X_MAP, open.start, close.end);
    map->items = entries.items;
    map->count = entries.count;
    return map;
}

static pt_expr *pt_parse_primary(pt_eparser *parser)
{
    pt_lexer *lexer = &parser->lexer;
    pt_source *source = lexer->source;
    pt_token token = pt_peek(lexer);
    pt_expr *literal;
    switch (token.type) {
        case T_NULL:
            pt_next(lexer);
            literal = pt_expr_new(source, X_LITERAL, token.start, token.end);
            literal->kind = L_NULL;
            literal->literal = pt_null();
            return literal;
        case T_TRUE:
        case T_FALSE:
            pt_next(lexer);
            literal = pt_expr_new(source, X_LITERAL, token.start, token.end);
            literal->kind = L_BOOL;
            literal->literal = pt_bool(token.type == T_TRUE);
            return literal;
        case T_NUMBER: {
            pt_next(lexer);
            literal = pt_expr_new(source, X_LITERAL, token.start, token.end);
            literal->kind = L_NUMBER;
            pt_s digits = pt_strdup(source->arena, source->text + token.start, token.end - token.start);
            literal->literal = pt_number(zend_strtod(digits.s, NULL));
            return literal;
        }
        case T_STRING:
            pt_next(lexer);
            literal = pt_expr_new(source, X_LITERAL, token.start, token.end);
            literal->kind = L_STRING;
            literal->literal = pt_string(token.decoded);
            return literal;
        case T_LPAREN: {
            pt_next(lexer);
            pt_expr *inner = pt_parse_expression(parser);
            pt_expect(parser, T_RPAREN);
            return inner;
        }
        case T_LBRACKET:
            return pt_parse_bracket(parser);
        default:
            pt_unexpected(parser, token);
    }
}

/* With adjacent_only, accessors and calls must touch the previous token (GRM-14). */
static pt_expr *pt_parse_postfix(pt_eparser *parser, bool adjacent_only)
{
    pt_lexer *lexer = &parser->lexer;
    pt_source *source = lexer->source;
    pt_enter(parser);
    pt_token first = pt_peek(lexer);
    size_t start = first.start;
    pt_expr *node;
    if (first.type == T_IDENT) {
        pt_next(lexer);
        pt_s name = pt_strdup(source->arena, source->text + first.start, first.end - first.start);
        pt_token after = pt_peek(lexer);
        if (after.type == T_DOUBLE_COLON) {
            pt_next(lexer);
            pt_token method = pt_expect(parser, T_IDENT);
            pt_expect(parser, T_LPAREN);
            pt_exprs args = {source->arena, NULL, 0, 0};
            pt_parse_arguments(parser, &args);
            pt_token close = pt_expect(parser, T_RPAREN);
            node = pt_expr_new(source, X_CLASS_CALL, start, close.end);
            node->name = name;
            node->name2 = pt_strdup(source->arena, source->text + method.start, method.end - method.start);
            node->items = args.items;
            node->count = args.count;
        } else if (after.type == T_LPAREN && (!adjacent_only || after.start == first.end)) {
            pt_next(lexer);
            pt_exprs args = {source->arena, NULL, 0, 0};
            pt_parse_arguments(parser, &args);
            pt_token close = pt_expect(parser, T_RPAREN);
            node = pt_call(parser, name, &args, start, close.end);
        } else if (after.type == T_DOT_IDENT && pt_loop_meta_field((pt_s){source->text + after.start + 1, after.end - after.start - 1})) {
            pt_next(lexer);
            node = pt_expr_new(source, X_LOOP_META, start, after.end);
            node->name = name;
            node->name2 = pt_strdup(source->arena, source->text + after.start + 1, after.end - after.start - 1);
        } else {
            node = pt_expr_new(source, X_VAR, start, first.end);
            node->name = name;
        }
    } else {
        node = pt_parse_primary(parser);
    }
    for (;;) {
        pt_token token = pt_peek(lexer);
        if (adjacent_only && token.start != pt_consumed_end(lexer)) {
            break;
        }
        if (token.type == T_DOT_IDENT || token.type == T_DOT_INDEX) {
            pt_next(lexer);
            pt_s method = pt_strdup(source->arena, source->text + token.start + 1, token.end - token.start - 1);
            pt_token next = pt_peek(lexer);
            if (next.type == T_LPAREN && (!adjacent_only || next.start == token.end)) {
                pt_next(lexer);
                pt_exprs args = {source->arena, NULL, 0, 0};
                pt_parse_arguments(parser, &args);
                pt_token close = pt_expect(parser, T_RPAREN);
                pt_expr *call = pt_expr_new(source, X_MEMBER_CALL, start, close.end);
                call->a = node;
                call->name = method;
                call->items = args.items;
                call->count = args.count;
                node = call;
            } else {
                pt_expr *member = pt_expr_new(source, X_MEMBER, start, token.end);
                member->a = node;
                member->name = method;
                node = member;
            }
        } else if (token.type == T_LBRACKET) {
            pt_next(lexer);
            pt_expr *index = pt_parse_expression(parser);
            pt_token close = pt_expect(parser, T_RBRACKET);
            pt_expr *access = pt_expr_new(source, X_INDEX, start, close.end);
            access->a = node;
            access->b = index;
            node = access;
        } else if (token.type == T_LPAREN) {
            pt_unexpected(parser, token);
        } else {
            break;
        }
    }
    pt_leave(parser);
    return node;
}

static void pt_eparser_init(pt_eparser *parser, pt_source *source, size_t start, char close, int close_count, bool has_open, size_t open_index)
{
    pt_lexer_init(&parser->lexer, source, start, close, close_count, has_open, open_index);
    parser->depth = 0;
}

/* ----------------------------------------------------------------------------------------------- */
/* Tag detection (LEX-5, LEX-6, LEX-9, LEX-17, LEX-18, LEX-21)                                      */
/* ----------------------------------------------------------------------------------------------- */

static const char *const pt_sigils[] = {"?#", ":?", "=", "@", "?", ":", "/", "+", "#", "*", "%"};

static const char *pt_sigil_after(const pt_source *source, size_t open)
{
    size_t index = pt_skip_horizontal(source, open + 1);
    for (size_t i = 0; i < sizeof(pt_sigils) / sizeof(pt_sigils[0]); i++) {
        if (pt_starts_with(source, index, pt_sigils[i], strlen(pt_sigils[i]))) {
            return pt_sigils[i];
        }
    }
    return NULL;
}

/* /^[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=/ on at most `window` bytes from `index`. */
static bool pt_loop_form(const pt_source *source, size_t index, size_t window)
{
    size_t limit = index + window < source->length ? index + window : source->length;
    size_t i = index;
    while (i < limit && pt_horizontal((unsigned char)source->text[i])) {
        i++;
    }
    if (i >= limit || !pt_ident_start((unsigned char)source->text[i])) {
        return false;
    }
    i++;
    while (i < limit && pt_ident_part((unsigned char)source->text[i])) {
        i++;
    }
    while (i < limit && pt_horizontal((unsigned char)source->text[i])) {
        i++;
    }
    return i < limit && source->text[i] == '=';
}

static bool pt_starts_tag(const pt_source *source, size_t open, char close)
{
    const char *sigil = pt_sigil_after(source, open);
    if (sigil == NULL) {
        return false;
    }
    size_t after = pt_skip_horizontal(source, open + 1) + strlen(sigil);
    if (strcmp(sigil, "/") == 0) {
        return pt_char_at(source, pt_skip_horizontal(source, after)) == (unsigned char)close;
    }
    if (strcmp(sigil, "@") == 0) {
        return pt_loop_form(source, after, 80);
    }
    return true;
}

static const char *const pt_wrappers[][2] = {{"\"", "\""}, {"'", "'"}, {"/*", "*/"}, {"<!--", "-->"}};

static int pt_wrapped_tag_at(const pt_source *source, size_t index, char open, char close)
{
    for (int w = 0; w < 4; w++) {
        size_t opener = strlen(pt_wrappers[w][0]);
        if (!pt_starts_with(source, index, pt_wrappers[w][0], opener)) {
            continue;
        }
        size_t after = pt_skip_horizontal(source, index + opener);
        if (pt_char_at(source, after) == (unsigned char)open && pt_char_at(source, after + 1) == (unsigned char)open && pt_starts_tag(source, after + 1, close)) {
            return w;
        }
        return -1;
    }
    return -1;
}

static bool pt_delimiter_char(char c)
{
    unsigned char code = (unsigned char)c;
    if (code <= 0x20 || code >= 0x7F) {
        return false;
    }
    if (pt_alpha(code) || pt_digit(code)) {
        return false;
    }
    return c != '_' && c != '\\';
}

bool pt_parse_delimiters(const char *value, size_t length, char *open, char *close)
{
    if (length != 2 || !pt_delimiter_char(value[0]) || !pt_delimiter_char(value[1])) {
        return false;
    }
    *open = value[0];
    *close = value[1];
    return true;
}

/* ----------------------------------------------------------------------------------------------- */
/* Template parser                                                                                  */
/* ----------------------------------------------------------------------------------------------- */

/* A text piece or a node of a body before finalize() merges the pieces. */
typedef struct pt_item {
    pt_node *node; /* NULL for a text piece */
    size_t start, end;
    pt_s value;
} pt_item;

typedef struct pt_items {
    pt_arena *arena;
    pt_item *v;
    uint32_t count, capacity;
} pt_items;

/* The bodies of a block node while it is parsed. */
typedef struct pt_raw {
    pt_items body, alt;
    pt_items *branches;
    uint32_t branch_count, branch_capacity;
} pt_raw;

typedef struct pt_frame {
    pt_node *node;
    pt_raw *raw;
    pt_items items;
    bool has_else;
    size_t open_start;
} pt_frame;

typedef struct pt_tag {
    size_t start, end;
    bool echo;
} pt_tag;

typedef struct pt_tparser {
    pt_source *source;
    char open, close;
    pt_items root;
    pt_frame *frames;
    uint32_t frame_count, frame_capacity;
    pt_tag *tags;
    uint32_t tag_count, tag_capacity;
    pt_comment *comments;
    uint32_t comment_count, comment_capacity;
    bool saw_tag;
    bool text_before_first_tag_is_whitespace;
} pt_tparser;

typedef struct pt_wrapper_info {
    int index; /* -1 without a wrapper */
} pt_wrapper_info;

static void pt_items_push(pt_items *items, pt_item item)
{
    if (items->count == items->capacity) {
        uint32_t capacity = items->capacity ? items->capacity * 2 : 8;
        pt_item *grown = pt_alloc(items->arena, sizeof(pt_item) * capacity);
        if (items->count) {
            memcpy(grown, items->v, sizeof(pt_item) * items->count);
        }
        items->v = grown;
        items->capacity = capacity;
    }
    items->v[items->count++] = item;
}

static pt_items pt_items_empty(pt_arena *arena)
{
    pt_items items = {arena, NULL, 0, 0};
    return items;
}

ZEND_NORETURN static void pt_tfail(pt_tparser *parser, const char *code, size_t start, size_t end, const char *message)
{
    pt_parse_fail(parser->source, code, start, end, zend_string_init(message, strlen(message), 0));
}

static pt_items *pt_current_items(pt_tparser *parser)
{
    return parser->frame_count == 0 ? &parser->root : &parser->frames[parser->frame_count - 1].items;
}

static void pt_push_node(pt_tparser *parser, pt_node *node)
{
    pt_item item = {node, node->start, node->end, {"", 0}};
    pt_items_push(pt_current_items(parser), item);
}

static bool pt_whitespace_only(const char *text, size_t start, size_t end)
{
    for (size_t i = start; i < end; i++) {
        char c = text[i];
        if (c != ' ' && c != '\t' && c != '\r' && c != '\n') {
            return false;
        }
    }
    return true;
}

static void pt_push_text(pt_tparser *parser, size_t start, size_t end, pt_s value)
{
    if (!parser->saw_tag && parser->text_before_first_tag_is_whitespace && !pt_whitespace_only(value.s, 0, value.n)) {
        parser->text_before_first_tag_is_whitespace = false;
    }
    pt_item item = {NULL, start, end, value};
    pt_items_push(pt_current_items(parser), item);
}

static void pt_flush_text(pt_tparser *parser, size_t start, size_t end)
{
    if (end > start) {
        pt_push_text(parser, start, end, (pt_s){parser->source->text + start, end - start});
    }
}

static pt_node *pt_node_new(pt_tparser *parser, pt_node_type type, size_t start, size_t end)
{
    pt_node *node = pt_alloc(parser->source->arena, sizeof(pt_node));
    node->type = (uint8_t)type;
    node->start = start;
    node->end = end;
    return node;
}

static void pt_frame_push(pt_tparser *parser, pt_node *node, size_t open_start)
{
    pt_arena *arena = parser->source->arena;
    if (parser->frame_count == parser->frame_capacity) {
        uint32_t capacity = parser->frame_capacity ? parser->frame_capacity * 2 : 8;
        pt_frame *grown = pt_alloc(arena, sizeof(pt_frame) * capacity);
        if (parser->frame_count) {
            memcpy(grown, parser->frames, sizeof(pt_frame) * parser->frame_count);
        }
        parser->frames = grown;
        parser->frame_capacity = capacity;
    }
    pt_raw *raw = pt_alloc(arena, sizeof(pt_raw));
    raw->body = pt_items_empty(arena);
    raw->alt = pt_items_empty(arena);
    pt_frame *frame = &parser->frames[parser->frame_count++];
    frame->node = node;
    frame->raw = raw;
    frame->items = pt_items_empty(arena);
    frame->has_else = false;
    frame->open_start = open_start;
}

static void pt_raw_add_branch(pt_tparser *parser, pt_raw *raw)
{
    pt_arena *arena = parser->source->arena;
    if (raw->branch_count == raw->branch_capacity) {
        uint32_t capacity = raw->branch_capacity ? raw->branch_capacity * 2 : 4;
        pt_items *grown = pt_alloc(arena, sizeof(pt_items) * capacity);
        if (raw->branch_count) {
            memcpy(grown, raw->branches, sizeof(pt_items) * raw->branch_count);
        }
        raw->branches = grown;
        raw->branch_capacity = capacity;
    }
    raw->branches[raw->branch_count++] = pt_items_empty(arena);
}

static void pt_node_add_branch(pt_tparser *parser, pt_node *node, pt_expr *test, size_t start, size_t end)
{
    pt_branch *grown = pt_alloc(parser->source->arena, sizeof(pt_branch) * (node->branch_count + 1));
    if (node->branch_count) {
        memcpy(grown, node->branches, sizeof(pt_branch) * node->branch_count);
    }
    grown[node->branch_count].test = test;
    grown[node->branch_count].start = start;
    grown[node->branch_count].end = end;
    node->branches = grown;
    node->branch_count++;
}

/* Moves the items collected so far into the current branch of the frame. */
static void pt_store_branch(pt_frame *frame)
{
    pt_node *node = frame->node;
    pt_raw *raw = frame->raw;
    if (node->type == N_IF) {
        if (frame->has_else) {
            raw->alt = frame->items;
            node->has_alt = true;
        } else {
            raw->branches[raw->branch_count - 1] = frame->items;
        }
    } else {
        if (frame->has_else) {
            raw->alt = frame->items;
            node->has_alt = true;
        } else {
            raw->body = frame->items;
        }
    }
}

static size_t pt_finish_tag(pt_tparser *parser, size_t start, int wrapper, size_t after_close)
{
    if (wrapper < 0) {
        return after_close;
    }
    pt_source *source = parser->source;
    size_t at = pt_skip_horizontal(source, after_close);
    const char *closer = pt_wrappers[wrapper][1];
    if (!pt_starts_with(source, at, closer, strlen(closer))) {
        zend_string *quoted = pt_json_quote(closer, strlen(closer));
        zend_string *message = zend_strpprintf(0, "wrapped tag is not followed by %s", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        pt_parse_fail(source, "E_PARSE_INVALID_WRAPPER", start, start + strlen(pt_wrappers[wrapper][0]), message);
    }
    return at + strlen(closer);
}

static size_t pt_expect_close_raw(pt_tparser *parser, size_t open, int close_count, size_t index)
{
    pt_source *source = parser->source;
    size_t at = pt_skip_horizontal(source, index);
    bool all = true;
    for (int k = 0; k < close_count; k++) {
        if (pt_char_at(source, at + (size_t)k) != (unsigned char)parser->close) {
            all = false;
            break;
        }
    }
    if (all) {
        return at + (size_t)close_count;
    }
    if (!pt_contains_from(source, parser->close, at)) {
        pt_tfail(parser, "E_PARSE_UNTERMINATED_TAG", open, open + 1, "tag is not terminated");
    }
    zend_string *quoted = pt_quote_range(source, at, at + 1);
    zend_string *message = zend_strpprintf(0, "unexpected %s before the end of the tag", ZSTR_VAL(quoted));
    zend_string_release(quoted);
    pt_parse_fail(source, "E_PARSE_UNEXPECTED_TOKEN", at, at + 1, message);
}

static pt_s pt_copy(pt_tparser *parser, size_t start, size_t end)
{
    return pt_strdup(parser->source->arena, parser->source->text + start, end - start);
}

static bool pt_reserved(pt_s name)
{
    return PT_EQ(name, "true") || PT_EQ(name, "false") || PT_EQ(name, "null") || PT_EQ(name, "in");
}

ZEND_NORETURN static void pt_reserved_fail(pt_tparser *parser, pt_s name, size_t start)
{
    pt_parse_fail(parser->source, "E_PARSE_RESERVED_NAME", start, start + name.n, zend_strpprintf(0, "%s is a reserved word", name.s));
}

/* ---- block tag bodies (GRM-3, GRM-12 to GRM-15) ---- */

typedef struct pt_btoken {
    bool path;
    pt_s value;
    size_t start, end;
} pt_btoken;

static bool pt_path_char(int c)
{
    return pt_alpha(c) || pt_digit(c) || c == '_' || c == '.' || c == '/' || c == '-';
}

static bool pt_at_close(pt_tparser *parser, size_t index, int close_count)
{
    for (int k = 0; k < close_count; k++) {
        if (pt_char_at(parser->source, index + (size_t)k) != (unsigned char)parser->close) {
            return false;
        }
    }
    return true;
}

/* A quoted string or a run of path characters; false at the close delimiter or the end of input. */
static bool pt_read_btoken(pt_tparser *parser, size_t index, int close_count, pt_btoken *token)
{
    pt_source *source = parser->source;
    index = pt_skip_horizontal(source, index);
    if (index >= source->length || pt_at_close(parser, index, close_count)) {
        return false;
    }
    char c = source->text[index];
    if (c == '"' || c == '\'') {
        size_t end;
        token->value = pt_string_literal(source, index, &end);
        token->path = true;
        token->start = index;
        token->end = end;
        return true;
    }
    size_t end = index;
    while (end < source->length && pt_path_char((unsigned char)source->text[end])) {
        end++;
    }
    pt_s value = {source->text + index, end - index};
    if (memchr(value.s, '.', value.n) != NULL || memchr(value.s, '/', value.n) != NULL) {
        token->path = true;
        token->value = pt_copy(parser, index, end);
        token->start = index;
        token->end = end;
        return true;
    }
    if (value.n > 0 && pt_ident_start((unsigned char)value.s[0])) {
        token->path = false;
        token->value = pt_copy(parser, index, end);
        token->start = index;
        token->end = end;
        return true;
    }
    token->path = false;
    token->value = (pt_s){"", 0};
    token->start = index;
    token->end = index + 1;
    return true;
}

static pt_s pt_read_include_path(pt_tparser *parser, size_t index, int close_count, size_t *after)
{
    pt_source *source = parser->source;
    pt_btoken token;
    if (!pt_read_btoken(parser, index, close_count, &token) || token.value.n == 0) {
        size_t at = pt_skip_horizontal(source, index);
        pt_tfail(parser, "E_PARSE_INVALID_PATH", at, at + 1, "include requires a path");
    }
    if (!token.path) {
        zend_string *quoted = pt_json_quote(token.value.s, token.value.n);
        zend_string *message = zend_strpprintf(0, "%s is not a path", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        pt_parse_fail(source, "E_PARSE_INVALID_PATH", token.start, token.end, message);
    }
    *after = token.end;
    return token.value;
}

static size_t pt_read_block_body(pt_tparser *parser, size_t index, int close_count, pt_node *node)
{
    pt_source *source = parser->source;
    size_t cursor = index;
    pt_btoken token;
    if (!pt_read_btoken(parser, cursor, close_count, &token) || token.value.n == 0) {
        size_t at = pt_skip_horizontal(source, cursor);
        pt_tfail(parser, "E_PARSE_INVALID_BLOCK_TAG", at, at + 1, "block tag requires an identifier or a path");
    }
    if (token.path) {
        node->has_path = true;
        node->path = token.value;
        cursor = token.end;
    } else {
        node->has_id = true;
        node->text = token.value;
        cursor = token.end;
        pt_btoken next;
        if (pt_read_btoken(parser, cursor, close_count, &next) && next.path) {
            node->has_path = true;
            node->path = next.value;
            cursor = next.end;
        }
    }
    pt_scope_item *scope = NULL;
    uint32_t count = 0, capacity = 0;
    for (;;) {
        if (!pt_read_btoken(parser, cursor, close_count, &token)) {
            break;
        }
        if (token.path || token.value.n == 0) {
            zend_string *quoted = pt_quote_range(source, token.start, token.end);
            zend_string *message = zend_strpprintf(0, "unexpected %s in block tag", ZSTR_VAL(quoted));
            zend_string_release(quoted);
            pt_parse_fail(source, "E_PARSE_INVALID_BLOCK_TAG", token.start, token.end, message);
        }
        cursor = token.end;
        if (count == capacity) {
            capacity = capacity ? capacity * 2 : 4;
            pt_scope_item *grown = pt_alloc(source->arena, sizeof(pt_scope_item) * capacity);
            if (count) {
                memcpy(grown, scope, sizeof(pt_scope_item) * count);
            }
            scope = grown;
        }
        if (pt_char_at(source, cursor) == ':') {
            size_t value_start = cursor + 1;
            if (value_start >= source->length || pt_horizontal((unsigned char)source->text[value_start])) {
                pt_tfail(parser, "E_PARSE_INVALID_BLOCK_TAG", cursor, cursor + 1, "scope item requires a value after \":\"");
            }
            pt_eparser expression;
            pt_eparser_init(&expression, source, value_start, parser->close, close_count, false, 0);
            scope[count].name = token.value;
            scope[count].expr = pt_parse_postfix(&expression, true);
            cursor = pt_consumed_end(&expression.lexer);
        } else {
            pt_expr *variable = pt_expr_new(source, X_VAR, token.start, token.end);
            variable->name = token.value;
            scope[count].name = token.value;
            scope[count].expr = variable;
        }
        count++;
    }
    node->scope = scope;
    node->scope_count = count;
    return cursor;
}

/* ---- tags ---- */

static size_t pt_parse_comment(pt_tparser *parser, size_t start, size_t open, int close_count, int wrapper, size_t body_start)
{
    pt_source *source = parser->source;
    /* The terminator is `*` and the close sequence. */
    size_t at = body_start;
    bool found = false;
    while (at < source->length) {
        const char *star = memchr(source->text + at, '*', source->length - at);
        if (star == NULL) {
            break;
        }
        at = (size_t)(star - source->text);
        if (pt_at_close(parser, at + 1, close_count)) {
            found = true;
            break;
        }
        at++;
    }
    if (!found) {
        pt_tfail(parser, "E_PARSE_UNTERMINATED_COMMENT", open, open + 1, "comment is not terminated");
    }
    size_t end = pt_finish_tag(parser, start, wrapper, at + 1 + (size_t)close_count);
    /* The value starts after the sigil `*` (AST-9). */
    size_t value_start = pt_skip_horizontal(source, open + 1) + 1;
    if (parser->comment_count == parser->comment_capacity) {
        uint32_t capacity = parser->comment_capacity ? parser->comment_capacity * 2 : 4;
        pt_comment *grown = pt_alloc(source->arena, sizeof(pt_comment) * capacity);
        if (parser->comment_count) {
            memcpy(grown, parser->comments, sizeof(pt_comment) * parser->comment_count);
        }
        parser->comments = grown;
        parser->comment_capacity = capacity;
    }
    pt_comment *comment = &parser->comments[parser->comment_count++];
    comment->value = pt_copy(parser, value_start, at);
    comment->start = start;
    comment->end = end;
    return end;
}

static size_t pt_parse_loop(pt_tparser *parser, size_t start, size_t open, int close_count, int wrapper, size_t body_start)
{
    pt_source *source = parser->source;
    /* /^[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=/ */
    size_t i = body_start;
    while (i < source->length && pt_horizontal((unsigned char)source->text[i])) {
        i++;
    }
    size_t name_start = i;
    bool matched = i < source->length && pt_ident_start((unsigned char)source->text[i]);
    size_t name_end = name_start;
    if (matched) {
        name_end = i + 1;
        while (name_end < source->length && pt_ident_part((unsigned char)source->text[name_end])) {
            name_end++;
        }
        i = name_end;
        while (i < source->length && pt_horizontal((unsigned char)source->text[i])) {
            i++;
        }
        matched = i < source->length && source->text[i] == '=';
    }
    if (!matched) {
        size_t at = pt_skip_horizontal(source, body_start);
        pt_tfail(parser, "E_PARSE_UNEXPECTED_TOKEN", at, at + 1, "loop requires \"name = expression\"");
    }
    pt_s name = pt_copy(parser, name_start, name_end);
    if (pt_reserved(name)) {
        pt_reserved_fail(parser, name, name_start);
    }
    pt_eparser expression;
    pt_eparser_init(&expression, source, i + 1, parser->close, close_count, true, open);
    pt_expr *iter = pt_parse_expression(&expression);
    size_t end = pt_finish_tag(parser, start, wrapper, pt_expect_close(&expression));
    pt_node *node = pt_node_new(parser, N_FOR, start, end);
    node->text = name;
    node->expr = iter;
    pt_frame_push(parser, node, start);
    return end;
}

/* ^([A-Za-z_][A-Za-z0-9_]*)[ \t]*(\+\+|--|[-+*\/%]=|=(?![=>])) on at most `window` bytes. */
static bool pt_assign_head(const pt_source *source, size_t index, size_t window, size_t *name_end, size_t *operator_start, size_t *operator_end)
{
    size_t limit = index + window < source->length ? index + window : source->length;
    size_t i = index;
    if (i >= limit || !pt_ident_start((unsigned char)source->text[i])) {
        return false;
    }
    i++;
    while (i < limit && pt_ident_part((unsigned char)source->text[i])) {
        i++;
    }
    *name_end = i;
    while (i < limit && pt_horizontal((unsigned char)source->text[i])) {
        i++;
    }
    if (i >= limit) {
        return false;
    }
    char c = source->text[i];
    char d = i + 1 < limit ? source->text[i + 1] : '\0';
    bool has_d = i + 1 < limit;
    *operator_start = i;
    if (has_d && ((c == '+' && d == '+') || (c == '-' && d == '-'))) {
        *operator_end = i + 2;
        return true;
    }
    if (has_d && d == '=' && (c == '-' || c == '+' || c == '*' || c == '/' || c == '%')) {
        *operator_end = i + 2;
        return true;
    }
    if (c == '=' && !(has_d && (d == '=' || d == '>'))) {
        *operator_end = i + 1;
        return true;
    }
    return false;
}

static size_t pt_parse_assignment(pt_tparser *parser, size_t start, size_t open, int close_count, int wrapper, size_t body_start)
{
    pt_source *source = parser->source;
    size_t name_end, operator_start, operator_end;
    if (!pt_assign_head(source, body_start, source->length - body_start, &name_end, &operator_start, &operator_end)) {
        pt_tfail(parser, "E_PARSE_UNEXPECTED_TOKEN", body_start, body_start + 1, "unknown tag");
    }
    pt_s name = pt_copy(parser, body_start, name_end);
    size_t name_start = body_start;
    if (pt_reserved(name)) {
        pt_reserved_fail(parser, name, name_start);
    }
    pt_expr *variable = pt_expr_new(source, X_VAR, name_start, name_start + name.n);
    variable->name = name;
    char operator = source->text[operator_start];
    size_t operator_length = operator_end - operator_start;
    size_t after_operator = operator_end;
    pt_expr *expr;
    size_t end;
    if (operator_length == 2 && (operator == '+' || operator == '-') && source->text[operator_start + 1] == operator) {
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close_raw(parser, open, close_count, after_operator));
        pt_expr *one = pt_expr_new(source, X_LITERAL, after_operator - 2, after_operator);
        one->kind = L_NUMBER;
        one->literal = pt_number(1.0);
        expr = pt_expr_new(source, X_BINARY, body_start, after_operator);
        expr->op = operator == '+' ? OP_ADD : OP_SUB;
        expr->a = variable;
        expr->b = one;
    } else {
        pt_eparser expression;
        pt_eparser_init(&expression, source, after_operator, parser->close, close_count, true, open);
        pt_expr *value = pt_parse_expression(&expression);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close(&expression));
        if (operator_length == 1) {
            expr = value;
        } else {
            pt_operator op;
            switch (operator) {
                case '+': op = OP_ADD; break;
                case '-': op = OP_SUB; break;
                case '*': op = OP_MUL; break;
                case '/': op = OP_DIV; break;
                default: op = OP_MOD; break;
            }
            expr = pt_expr_new(source, X_BINARY, body_start, pt_consumed_end(&expression.lexer));
            expr->op = (uint8_t)op;
            expr->a = variable;
            expr->b = value;
        }
    }
    pt_node *node = pt_node_new(parser, N_SET, start, end);
    node->text = name;
    node->expr = expr;
    pt_push_node(parser, node);
    return end;
}

static size_t pt_parse_directive(pt_tparser *parser, size_t start, size_t open, int close_count, int wrapper, size_t body_start, bool first_tag)
{
    pt_source *source = parser->source;
    if (!first_tag || !parser->text_before_first_tag_is_whitespace) {
        pt_tfail(parser, "E_PARSE_INVALID_DIRECTIVE", start, start + 1, "delimiter directive is not the first tag");
    }
    size_t index = pt_skip_horizontal(source, body_start);
    if (!pt_starts_with(source, index, "delimiter", 9)) {
        pt_tfail(parser, "E_PARSE_INVALID_DIRECTIVE", start, start + 1, "directive is not \"delimiter\"");
    }
    index = pt_skip_horizontal(source, index + 9);
    char value[4];
    size_t length = 0;
    while (index < source->length && !pt_horizontal((unsigned char)source->text[index]) && !pt_at_close(parser, index, close_count)) {
        value[length++] = source->text[index];
        index++;
        if (length > 2) {
            break;
        }
    }
    char open_char, close_char;
    if (!pt_parse_delimiters(value, length, &open_char, &close_char)) {
        zend_string *quoted = pt_json_quote(value, length);
        zend_string *message = zend_strpprintf(0, "%s is not a delimiter pair", ZSTR_VAL(quoted));
        zend_string_release(quoted);
        pt_parse_fail(source, "E_PARSE_INVALID_DIRECTIVE", start, start + 1, message);
    }
    size_t end = pt_finish_tag(parser, start, wrapper, pt_expect_close_raw(parser, open, close_count, index));
    parser->open = open_char;
    parser->close = close_char;
    return end;
}

/* Parses one tag and returns the byte index after it. */
static size_t pt_parse_tag(pt_tparser *parser, size_t start, size_t open, int close_count, int wrapper)
{
    pt_source *source = parser->source;
    const char *sigil = pt_sigil_after(source, open);
    size_t body_start = sigil == NULL ? open + 1 : pt_skip_horizontal(source, pt_skip_horizontal(source, open + 1) + strlen(sigil));
    bool first_tag = !parser->saw_tag;
    parser->saw_tag = true;
    bool echo = false;
    size_t end;
    if (sigil == NULL) {
        pt_tfail(parser, "E_PARSE_UNEXPECTED_TOKEN", body_start, body_start + 1, "unknown tag");
    }
    if (strcmp(sigil, "*") == 0) {
        end = pt_parse_comment(parser, start, open, close_count, wrapper, body_start);
    } else if (strcmp(sigil, "=") == 0) {
        echo = true;
        pt_eparser expression;
        pt_eparser_init(&expression, source, body_start, parser->close, close_count, true, open);
        pt_expr *expr = pt_parse_expression(&expression);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close(&expression));
        pt_node *node = pt_node_new(parser, N_ECHO, start, end);
        node->expr = expr;
        pt_push_node(parser, node);
    } else if (strcmp(sigil, "@") == 0) {
        end = pt_parse_loop(parser, start, open, close_count, wrapper, body_start);
    } else if (strcmp(sigil, "?") == 0) {
        pt_eparser expression;
        pt_eparser_init(&expression, source, body_start, parser->close, close_count, true, open);
        pt_expr *test = pt_parse_expression(&expression);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close(&expression));
        pt_node *node = pt_node_new(parser, N_IF, start, end);
        pt_node_add_branch(parser, node, test, start, end);
        pt_frame_push(parser, node, start);
        pt_raw_add_branch(parser, parser->frames[parser->frame_count - 1].raw);
    } else if (strcmp(sigil, "?#") == 0) {
        pt_eparser expression;
        pt_eparser_init(&expression, source, body_start, parser->close, close_count, true, open);
        pt_token id = pt_expect(&expression, T_IDENT);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close(&expression));
        pt_node *node = pt_node_new(parser, N_IF_BLOCK, start, end);
        node->text = pt_copy(parser, id.start, id.end);
        pt_frame_push(parser, node, start);
    } else if (strcmp(sigil, ":?") == 0) {
        if (parser->frame_count == 0) {
            pt_tfail(parser, "E_PARSE_ELSE_OUTSIDE_BLOCK", start, start + 1, "\"{:?}\" outside of a block");
        }
        pt_frame *frame = &parser->frames[parser->frame_count - 1];
        if (frame->node->type != N_IF) {
            pt_tfail(parser, "E_PARSE_ELSEIF_NOT_IN_IF", start, start + 1, "\"{:?}\" inside a loop or if-block");
        }
        if (frame->has_else) {
            pt_tfail(parser, "E_PARSE_ELSEIF_AFTER_ELSE", start, start + 1, "\"{:?}\" after \"{:}\"");
        }
        pt_eparser expression;
        pt_eparser_init(&expression, source, body_start, parser->close, close_count, true, open);
        pt_expr *test = pt_parse_expression(&expression);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close(&expression));
        frame = &parser->frames[parser->frame_count - 1];
        pt_store_branch(frame);
        pt_node_add_branch(parser, frame->node, test, start, end);
        pt_raw_add_branch(parser, frame->raw);
        frame->items = pt_items_empty(source->arena);
    } else if (strcmp(sigil, ":") == 0) {
        size_t name_end, operator_start, operator_end;
        if (pt_assign_head(source, body_start, 80, &name_end, &operator_start, &operator_end)) {
            end = pt_parse_assignment(parser, start, open, close_count, wrapper, body_start);
        } else {
            if (parser->frame_count == 0) {
                pt_tfail(parser, "E_PARSE_ELSE_OUTSIDE_BLOCK", start, start + 1, "\"{:}\" outside of a block");
            }
            pt_frame *frame = &parser->frames[parser->frame_count - 1];
            if (frame->has_else) {
                pt_tfail(parser, "E_PARSE_DUPLICATE_ELSE", start, start + 1, "second \"{:}\" in the same block");
            }
            end = pt_finish_tag(parser, start, wrapper, pt_expect_close_raw(parser, open, close_count, body_start));
            pt_store_branch(frame);
            frame->has_else = true;
            frame->items = pt_items_empty(source->arena);
        }
    } else if (strcmp(sigil, "/") == 0) {
        if (parser->frame_count == 0) {
            pt_tfail(parser, "E_PARSE_UNEXPECTED_CLOSE", start, start + 1, "\"{/}\" without an open block");
        }
        pt_frame frame = parser->frames[--parser->frame_count];
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close_raw(parser, open, close_count, body_start));
        pt_store_branch(&frame);
        frame.node->start = frame.open_start;
        frame.node->end = end;
        frame.node->raw = frame.raw;
        pt_push_node(parser, frame.node);
    } else if (strcmp(sigil, "+") == 0) {
        size_t path_end;
        pt_s path = pt_read_include_path(parser, body_start, close_count, &path_end);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close_raw(parser, open, close_count, path_end));
        pt_node *node = pt_node_new(parser, N_INCLUDE, start, end);
        node->text = path;
        pt_push_node(parser, node);
    } else if (strcmp(sigil, "#") == 0) {
        pt_node *node = pt_node_new(parser, N_BLOCK, start, start);
        size_t body_end = pt_read_block_body(parser, body_start, close_count, node);
        end = pt_finish_tag(parser, start, wrapper, pt_expect_close_raw(parser, open, close_count, body_end));
        node->end = end;
        pt_push_node(parser, node);
    } else {
        end = pt_parse_directive(parser, start, open, close_count, wrapper, body_start, first_tag);
    }
    if (parser->tag_count == parser->tag_capacity) {
        uint32_t capacity = parser->tag_capacity ? parser->tag_capacity * 2 : 16;
        pt_tag *grown = pt_alloc(source->arena, sizeof(pt_tag) * capacity);
        if (parser->tag_count) {
            memcpy(grown, parser->tags, sizeof(pt_tag) * parser->tag_count);
        }
        parser->tags = grown;
        parser->tag_capacity = capacity;
    }
    parser->tags[parser->tag_count].start = start;
    parser->tags[parser->tag_count].end = end;
    parser->tags[parser->tag_count].echo = echo;
    parser->tag_count++;
    return end;
}

static void pt_scan(pt_tparser *parser)
{
    pt_source *source = parser->source;
    const char *text = source->text;
    size_t length = source->length;
    size_t index = 0, text_start = 0;
    while (index < length) {
        char c = text[index];
        char open = parser->open;
        if (c == '\\' && pt_char_at(source, index + 1) == (unsigned char)open && pt_starts_tag(source, index + 1, parser->close)) {
            pt_flush_text(parser, text_start, index);
            pt_push_text(parser, index, index + 2, pt_strdup(source->arena, &open, 1));
            index += 2;
            text_start = index;
            continue;
        }
        if (c == open && pt_starts_tag(source, index, parser->close)) {
            pt_flush_text(parser, text_start, index);
            index = pt_parse_tag(parser, index, index, 1, -1);
            text_start = index;
            continue;
        }
        int wrapper = pt_wrapped_tag_at(source, index, open, parser->close);
        if (wrapper >= 0) {
            pt_flush_text(parser, text_start, index);
            size_t open_index = pt_skip_horizontal(source, index + strlen(pt_wrappers[wrapper][0])) + 1;
            index = pt_parse_tag(parser, index, open_index, 2, wrapper);
            text_start = index;
            continue;
        }
        index++;
    }
    pt_flush_text(parser, text_start, length);
}

/* ---- standalone line groups (LEX-14, LEX-15) ---- */

typedef struct pt_range {
    size_t start, end;
} pt_range;

typedef struct pt_ranges {
    pt_range *v;
    uint32_t count;
} pt_ranges;

static size_t pt_line_of(const pt_lines *lines, size_t index)
{
    size_t low = 0, high = lines->count - 1;
    while (low < high) {
        size_t mid = (low + high + 1) / 2;
        if (lines->starts[mid] <= index) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
}

static pt_ranges pt_standalone(pt_tparser *parser)
{
    pt_source *source = parser->source;
    const pt_lines *lines = &source->lines;
    size_t line_count = lines->count;
    pt_ranges ranges = {NULL, 0};
    if (parser->tag_count == 0) {
        return ranges;
    }
    /* The tags are in source order, so the tags of a line are a contiguous run. */
    uint32_t *first = pt_alloc(source->arena, sizeof(uint32_t) * line_count);
    uint32_t *count = pt_alloc(source->arena, sizeof(uint32_t) * line_count);
    for (uint32_t t = 0; t < parser->tag_count; t++) {
        size_t line = pt_line_of(lines, parser->tags[t].start);
        if (count[line] == 0) {
            first[line] = t;
        }
        count[line]++;
    }
    ranges.v = pt_alloc(source->arena, sizeof(pt_range) * parser->tag_count);
    size_t line = 0;
    while (line < line_count) {
        size_t group_end = line;
        bool has_tag = false, has_echo = false;
        uint32_t group_first = UINT32_MAX, group_last = 0;
        for (size_t cursor = line; cursor <= group_end; cursor++) {
            for (uint32_t k = 0; k < count[cursor]; k++) {
                uint32_t t = first[cursor] + k;
                const pt_tag *tag = &parser->tags[t];
                has_tag = true;
                if (tag->echo) {
                    has_echo = true;
                }
                if (group_first == UINT32_MAX) {
                    group_first = t;
                }
                group_last = t;
                size_t last_byte = tag->end > tag->start ? tag->end - 1 : tag->start;
                size_t end_line = pt_line_of(lines, last_byte);
                if (end_line > group_end) {
                    group_end = end_line;
                }
            }
        }
        if (has_tag && !has_echo) {
            size_t start = lines->starts[line];
            size_t end = group_end + 1 < line_count ? lines->starts[group_end + 1] : source->length;
            bool only = true;
            size_t index = start;
            for (uint32_t t = group_first; t <= group_last && only; t++) {
                if (parser->tags[t].start > index && !pt_whitespace_only(source->text, index, parser->tags[t].start)) {
                    only = false;
                }
                index = parser->tags[t].end;
            }
            if (only && (end <= index || pt_whitespace_only(source->text, index, end))) {
                ranges.v[ranges.count].start = start;
                ranges.v[ranges.count].end = end;
                ranges.count++;
            }
        }
        line = group_end + 1;
    }
    return ranges;
}

/* ---- finalize: removal of standalone ranges and merging of text pieces ---- */

static pt_body pt_finalize(pt_tparser *parser, pt_items *items, const pt_ranges *removed);

static void pt_pending_push(pt_items *pending, size_t start, size_t end, pt_s value)
{
    pt_item item = {NULL, start, end, value};
    pt_items_push(pending, item);
}

static void pt_cut_piece(const pt_item *piece, const pt_ranges *removed, pt_items *pending)
{
    size_t cursor = piece->start;
    bool source_sized = piece->end - piece->start == piece->value.n;
    for (uint32_t r = 0; r < removed->count; r++) {
        size_t range_start = removed->v[r].start, range_end = removed->v[r].end;
        if (range_end <= cursor) {
            continue;
        }
        if (range_start >= piece->end) {
            break;
        }
        size_t until = range_start < piece->end ? range_start : piece->end;
        if (until > cursor) {
            pt_s value = source_sized ? (pt_s){piece->value.s + (cursor - piece->start), until - cursor} : piece->value;
            pt_pending_push(pending, cursor, until, value);
        }
        if (range_end > cursor) {
            cursor = range_end;
        }
    }
    if (piece->end > cursor) {
        pt_s value = source_sized ? (pt_s){piece->value.s + (cursor - piece->start), piece->end - cursor} : piece->value;
        pt_pending_push(pending, cursor, piece->end, value);
    }
}

typedef struct pt_nodes {
    pt_arena *arena;
    pt_node **v;
    uint32_t count, capacity;
} pt_nodes;

static void pt_nodes_push(pt_nodes *nodes, pt_node *node)
{
    if (nodes->count == nodes->capacity) {
        uint32_t capacity = nodes->capacity ? nodes->capacity * 2 : 8;
        pt_node **grown = pt_alloc(nodes->arena, sizeof(pt_node *) * capacity);
        if (nodes->count) {
            memcpy(grown, nodes->v, sizeof(pt_node *) * nodes->count);
        }
        nodes->v = grown;
        nodes->capacity = capacity;
    }
    nodes->v[nodes->count++] = node;
}

static void pt_flush_pending(pt_tparser *parser, pt_items *pending, pt_nodes *nodes)
{
    if (pending->count == 0) {
        return;
    }
    size_t total = 0;
    for (uint32_t i = 0; i < pending->count; i++) {
        total += pending->v[i].value.n;
    }
    if (total > 0) {
        char *value = pt_alloc(parser->source->arena, total + 1);
        size_t at = 0;
        for (uint32_t i = 0; i < pending->count; i++) {
            memcpy(value + at, pending->v[i].value.s, pending->v[i].value.n);
            at += pending->v[i].value.n;
        }
        pt_node *node = pt_node_new(parser, N_TEXT, pending->v[0].start, pending->v[pending->count - 1].end);
        node->text = (pt_s){value, total};
        pt_nodes_push(nodes, node);
    }
    pending->count = 0;
}

static void pt_finalize_node(pt_tparser *parser, pt_node *node, const pt_ranges *removed)
{
    if (node->type != N_IF && node->type != N_FOR && node->type != N_IF_BLOCK) {
        return;
    }
    pt_raw *raw = node->raw;
    node->raw = NULL;
    if (node->type == N_IF) {
        for (uint32_t b = 0; b < node->branch_count; b++) {
            node->branches[b].body = pt_finalize(parser, &raw->branches[b], removed);
        }
    } else {
        node->body = pt_finalize(parser, &raw->body, removed);
    }
    if (node->has_alt) {
        node->alt = pt_finalize(parser, &raw->alt, removed);
    }
}

static pt_body pt_finalize(pt_tparser *parser, pt_items *items, const pt_ranges *removed)
{
    pt_arena *arena = parser->source->arena;
    pt_nodes nodes = {arena, NULL, 0, 0};
    pt_items pending = pt_items_empty(arena);
    for (uint32_t i = 0; i < items->count; i++) {
        pt_item *item = &items->v[i];
        if (item->node == NULL) {
            pt_cut_piece(item, removed, &pending);
            continue;
        }
        pt_flush_pending(parser, &pending, &nodes);
        pt_finalize_node(parser, item->node, removed);
        pt_nodes_push(&nodes, item->node);
    }
    pt_flush_pending(parser, &pending, &nodes);
    pt_body body = {nodes.v, nodes.count};
    return body;
}

/* ----------------------------------------------------------------------------------------------- */
/* Entry                                                                                            */
/* ----------------------------------------------------------------------------------------------- */

pt_template *pt_parse(pt_run *run, const char *name, size_t name_length, const char *bytes, size_t length, char open, char close)
{
    size_t invalid = pt_utf8_first_invalid(bytes, length);
    if (invalid < length) {
        /* The line index of an invalid source is the index of its bytes (LEX-1). */
        pt_lines lines;
        pt_lines_build(&run->arena, &lines, bytes, length);
        pt_fail_at(run, "E_LEX_INVALID_UTF8", pt_strdup(&run->arena, name, name_length), &lines, invalid, invalid + 1, zend_strpprintf(0, "invalid UTF-8 byte at offset %zu", invalid));
    }
    /* The template owns its arena. A failed parse leaves it in the run, whose boundary releases it. */
    pt_template *template = ecalloc(1, sizeof(pt_template));
    pt_arena_init(&template->arena);
    template->refcount = 1;
    run->parsing = template;
    pt_arena *arena = &template->arena;
    pt_source source;
    source.run = run;
    source.arena = arena;
    source.name = pt_strdup(arena, name, name_length);
    template->name = source.name;
    if (length >= 3 && memcmp(bytes, "\xEF\xBB\xBF", 3) == 0) {
        bytes += 3;
        length -= 3;
    }
    pt_s text = pt_strdup(arena, bytes, length);
    source.text = text.s;
    source.length = text.n;
    template->text = text;
    pt_lines_build(arena, &source.lines, source.text, source.length);
    template->lines = source.lines;

    pt_tparser parser;
    memset(&parser, 0, sizeof(parser));
    parser.source = &source;
    parser.open = open;
    parser.close = close;
    parser.root = pt_items_empty(arena);
    parser.text_before_first_tag_is_whitespace = true;
    pt_scan(&parser);
    if (parser.frame_count > 0) {
        size_t at = parser.frames[parser.frame_count - 1].open_start;
        pt_tfail(&parser, "E_PARSE_UNCLOSED_BLOCK", at, at + 1, "block is not closed before the end of the file");
    }
    pt_ranges removed = pt_standalone(&parser);
    template->body = pt_finalize(&parser, &parser.root, &removed);
    template->comments = parser.comments;
    template->comment_count = parser.comment_count;
    run->parsing = NULL;
    return template;
}

void pt_template_release(pt_template *template)
{
    if (template == NULL) {
        return;
    }
    if (--template->refcount == 0) {
        if (template->version) {
            zend_string_release(template->version);
        }
        pt_arena_free(&template->arena);
        efree(template);
    }
}

const char *pt_operator_text(pt_operator op)
{
    static const char *const texts[] = {
        "!", "-", "+", "-", "*", "/", "%", "==", "!=", "===", "!==", "<", ">", "<=", ">=", "in", "&&", "||", "??",
    };
    return texts[op];
}
