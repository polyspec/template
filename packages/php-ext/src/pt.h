/*
 * Internal declarations of the polyspec_template extension: memory, values, the AST, the parser, the
 * renderer and the host binding. The behaviour is the behaviour of the specification in docs/spec/.
 */
#ifndef PT_H
#define PT_H

#include "php.h"
#include "Zend/zend_smart_str.h"
#include <setjmp.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "pt_error_codes.h"

/* ---------------------------------------------------------------------------------------------------
 * Memory: an arena owns the allocations of one parse, one render, one template or one bound map. It
 * also holds PHP values (objects, arrays) that must stay alive as long as the arena and are released
 * when the arena is freed. Every allocation uses the request allocator, so a fatal error of PHP that
 * leaves a run never leaks past the request.
 * ------------------------------------------------------------------------------------------------- */

typedef struct pt_chunk pt_chunk;

typedef struct pt_arena {
    pt_chunk *chunks;
    zval *keep;
    uint32_t keep_count, keep_capacity;
} pt_arena;

void pt_arena_init(pt_arena *arena);
void pt_arena_free(pt_arena *arena);
void *pt_alloc(pt_arena *arena, size_t size);
/* Keeps a copy of a PHP value alive until the arena is freed. */
void pt_arena_keep(pt_arena *arena, zval *value);

/* A byte string that is not owned by its holder; arena strings carry a terminating NUL byte. */
typedef struct pt_s {
    const char *s;
    size_t n;
} pt_s;

#define PT_S(literal) ((pt_s){(literal), sizeof(literal) - 1})

pt_s pt_strdup(pt_arena *arena, const char *bytes, size_t length);
bool pt_eq(pt_s a, const char *bytes, size_t length);
#define PT_EQ(string, literal) pt_eq((string), (literal), sizeof(literal) - 1)

/* A growable byte buffer in an arena. */
typedef struct pt_buf {
    pt_arena *arena;
    char *s;
    size_t n, cap;
} pt_buf;

void pt_buf_init(pt_buf *buf, pt_arena *arena);
void pt_buf_add(pt_buf *buf, const char *bytes, size_t length);
void pt_buf_addc(pt_buf *buf, char byte);
#define PT_BUF_LIT(buf, literal) pt_buf_add((buf), (literal), sizeof(literal) - 1)
void pt_buf_adds(pt_buf *buf, pt_s string);
pt_s pt_buf_done(pt_buf *buf);

/* ---------------------------------------------------------------------------------------------------
 * Errors (ERR-1). A run holds the jump target of its boundary; a failure fills the error of the run
 * and jumps back to the boundary, which turns it into a PHP exception and frees the arena of the run.
 * Code between the boundary and a failure is C code of this extension only: no failure jumps across a
 * frame of the Zend engine.
 * ------------------------------------------------------------------------------------------------- */

typedef struct pt_error {
    const char *code;     /* a static error code such as PT_E_PARSE_UNCLOSED_BLOCK; NULL when unset */
    zend_string *template;
    zend_long line, col, offset, end;
    zend_string *message;
    /* A native TemplateError that host code threw; it passes to the caller unchanged. */
    zend_object *exception;
} pt_error;

typedef struct pt_template pt_template;

typedef struct pt_run {
    jmp_buf jump;
    pt_arena arena;
    pt_error error;
    pt_template *parsing; /* the template that a failed parse leaves to the boundary to release */
    pt_template **held;   /* the templates that a render uses; the boundary releases them */
    uint32_t held_count, held_capacity;
} pt_run;

/* The line index of a source: the byte offsets of the line starts (LEX-16). */
typedef struct pt_lines {
    size_t *starts;
    size_t count;
} pt_lines;

void pt_lines_build(pt_arena *arena, pt_lines *lines, const char *text, size_t length);
void pt_position(const pt_lines *lines, size_t offset, zend_long *line, zend_long *col);

ZEND_NORETURN void pt_fail_at(pt_run *run, const char *code, pt_s template, const pt_lines *lines, size_t start, size_t end, zend_string *message);
ZEND_NORETURN void pt_fail_bare(pt_run *run, const char *code, pt_s template, zend_string *message);
void pt_error_clear(pt_error *error);

/* The work of one run and its input, which a failure leaves through longjmp. Runs `work` with `input` as one run
 * and ends it: a failure throws its error and the result is false. */
typedef void (*pt_work)(pt_run *run, void *input);
bool pt_run_work(pt_work work, void *input);

/* JSON text of a string for a message, as json_encode writes it. */
zend_string *pt_json_quote(const char *bytes, size_t length);

/* ---------------------------------------------------------------------------------------------------
 * Values (docs/spec/data-model.md). A value is null, bool, number, string, safe string, list, map or a
 * native object. Lists and maps are immutable once they are built; only the map of the local variables
 * of a scope and the data map of a block are changed, and both are new maps of the render.
 * ------------------------------------------------------------------------------------------------- */

typedef enum pt_type {
    PT_NULL,
    PT_BOOL,
    PT_NUMBER,
    PT_STRING,
    PT_SAFE,
    PT_LIST,
    PT_MAP,
    PT_OBJECT,
} pt_type;

typedef struct pt_list pt_list;
typedef struct pt_map pt_map;

typedef struct pt_value {
    uint8_t type;
    union {
        bool b;
        double number;
        pt_s str;
        pt_list *list;
        pt_map *map;
        zend_object *object;
    } u;
} pt_value;

struct pt_list {
    uint32_t count;
    pt_value *items;
};

typedef struct pt_entry {
    pt_s key;
    pt_value value;
    bool live;
} pt_entry;

struct pt_map {
    pt_arena *arena;
    uint32_t count, used, capacity;
    pt_entry *entries;
    HashTable *index;
};

#define PT_MAX_SAFE 9007199254740991.0
#define PT_MAX_DEPTH 64

static inline pt_value pt_null(void) { pt_value v; v.type = PT_NULL; v.u.number = 0; return v; }
static inline pt_value pt_bool(bool b) { pt_value v; v.type = PT_BOOL; v.u.b = b; return v; }
static inline pt_value pt_number(double n) { pt_value v; v.type = PT_NUMBER; v.u.number = n; return v; }
static inline pt_value pt_string(pt_s s) { pt_value v; v.type = PT_STRING; v.u.str = s; return v; }
static inline pt_value pt_safe(pt_s s) { pt_value v; v.type = PT_SAFE; v.u.str = s; return v; }
static inline pt_value pt_list_value(pt_list *l) { pt_value v; v.type = PT_LIST; v.u.list = l; return v; }
static inline pt_value pt_map_value(pt_map *m) { pt_value v; v.type = PT_MAP; v.u.map = m; return v; }
static inline bool pt_is_string(pt_value v) { return v.type == PT_STRING || v.type == PT_SAFE; }

pt_list *pt_list_new(pt_arena *arena, uint32_t count);

pt_map *pt_map_new(pt_arena *arena, uint32_t capacity);
pt_map *pt_map_copy(pt_arena *arena, const pt_map *map);
pt_value *pt_map_get(const pt_map *map, const char *key, size_t length);
void pt_map_set(pt_map *map, pt_s key, pt_value value);
void pt_map_remove(pt_map *map, const char *key, size_t length);

/* A growable list of values. */
typedef struct pt_vec {
    pt_arena *arena;
    pt_value *items;
    uint32_t count, capacity;
} pt_vec;

void pt_vec_init(pt_vec *vec, pt_arena *arena);
void pt_vec_push(pt_vec *vec, pt_value value);
pt_list *pt_vec_list(pt_vec *vec);

const char *pt_type_name(pt_value value);
bool pt_truthy(pt_value value);
/* VAL-8: the text of a value; false for a list, a map or an object. */
bool pt_stringify(pt_arena *arena, pt_value value, pt_s *text);
/* VAL-9: ECMAScript Number::toString. */
pt_s pt_number_text(pt_arena *arena, double value);
/* The shortest round-trip digits of a finite non-zero magnitude and n with value = 0.digits * 10^n. */
void pt_shortest_digits(double value, bool *negative, char *digits, size_t *count, int *exponent);
bool pt_is_integer(double value);
/* EXP-23: the number of a numeric string, or false. */
bool pt_numeric_string(const char *text, size_t length, double *number);
bool pt_loose_equals(pt_value a, pt_value b);
bool pt_strict_equals(pt_value a, pt_value b);
/* EXP-38: -1, 0 or 1; false when the pair has no order. */
bool pt_compare(pt_value a, pt_value b, int *order);
/* VAL-20: whether the depth of a value is at most limit. */
bool pt_depth_within(pt_value value, int limit);

/* UTF-8 (LEX-1, VAL-17). */
size_t pt_utf8_first_invalid(const char *bytes, size_t length); /* length when valid */
void pt_utf8_append(pt_buf *buf, uint32_t code);
size_t pt_utf8_length(const char *bytes, size_t length);
/* The byte length of the code point that starts at bytes[0] of valid UTF-8. */
size_t pt_utf8_width(unsigned char lead);

/* HTML escaping (RT-32, FUN-10). */
void pt_escape_html(pt_buf *buf, pt_s text);

/* ---------------------------------------------------------------------------------------------------
 * The AST (docs/spec/ast.md).
 * ------------------------------------------------------------------------------------------------- */

typedef enum pt_expr_type {
    X_LITERAL,
    X_VAR,
    X_LOOP_META,
    X_MEMBER,
    X_MEMBER_CALL,
    X_CLASS_CALL,
    X_INDEX,
    X_CALL,
    X_UNARY,
    X_BINARY,
    X_TERNARY,
    X_LIST,
    X_MAP,
    X_SPREAD,
    X_PAIR, /* a key and a value of a map literal; not a node of its own */
} pt_expr_type;

typedef enum pt_literal_kind { L_NULL, L_BOOL, L_NUMBER, L_STRING } pt_literal_kind;

typedef enum pt_operator {
    OP_NOT, OP_NEG,
    OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_MOD,
    OP_EQ, OP_NE, OP_SEQ, OP_SNE,
    OP_LT, OP_GT, OP_LE, OP_GE, OP_IN,
    OP_AND, OP_OR, OP_COALESCE,
} pt_operator;

const char *pt_operator_text(pt_operator op);

typedef struct pt_expr pt_expr;

struct pt_expr {
    uint8_t type;
    uint8_t op;       /* X_UNARY, X_BINARY */
    uint8_t kind;     /* X_LITERAL */
    size_t start, end;
    pt_value literal; /* X_LITERAL */
    pt_s name;        /* Var name, LoopMeta loop, Member key, MemberCall method, Call name, ClassCall className */
    pt_s name2;       /* LoopMeta field, ClassCall method */
    pt_expr *a;       /* object, operand, left, test, spread expr, pair key */
    pt_expr *b;       /* index, right, then (NULL for ?:), pair value */
    pt_expr *c;       /* else */
    pt_expr **items;  /* args, list items, map entries */
    uint32_t count;
};

typedef enum pt_node_type { N_TEXT, N_ECHO, N_IF, N_FOR, N_SET, N_INCLUDE, N_BLOCK, N_IF_BLOCK } pt_node_type;

typedef struct pt_node pt_node;

typedef struct pt_body {
    pt_node **nodes;
    uint32_t count;
} pt_body;

typedef struct pt_branch {
    pt_expr *test;
    pt_body body;
    size_t start, end;
} pt_branch;

typedef struct pt_scope_item {
    pt_s name;
    pt_expr *expr;
} pt_scope_item;

struct pt_node {
    uint8_t type;
    bool has_id, has_path, has_alt;
    size_t start, end;
    pt_s text;      /* Text value, Set name, Include path, For name, IfBlock id, Block id */
    pt_s path;      /* Block path */
    pt_expr *expr;  /* Echo expr, Set expr, For iter */
    pt_branch *branches;
    uint32_t branch_count;
    pt_body body;   /* For body, IfBlock body */
    pt_body alt;    /* If else, For empty, IfBlock else */
    pt_scope_item *scope;
    uint32_t scope_count;
    void *raw;      /* the unfinished bodies while the parser runs */
};

typedef struct pt_comment {
    pt_s value;
    size_t start, end;
} pt_comment;

/* A parsed template with its source and line index; cached by an engine and shared by the renders
 * that use it. */
struct pt_template {
    uint32_t refcount;
    pt_arena arena;
    pt_s name;
    pt_s text;
    pt_lines lines;
    pt_body body;
    pt_comment *comments;
    uint32_t comment_count;
    zend_string *version;
    zval ast; /* the AST array that a loader gave, kept as it is (RT-40); UNDEF (zeroed) for a source */
};

/* Parses a source into a new template (LEX-*, GRM-*, AST-*). A failure jumps to the boundary of the
 * run; the template is then freed by the run. */
pt_template *pt_parse(pt_run *run, const char *name, size_t name_length, const char *source, size_t length, char open, char close);
void pt_template_release(pt_template *template);

/* An accepted tag (EDT-8): its kind, its byte range and the byte range of its body between the open and the close
 * delimiters, sigil included. */
typedef struct pt_syntax_tag {
    size_t start, end, body_start, body_end;
    bool echo;
    const char *kind; /* "assignment", "block", "close", "comment", "directive", "echo", "else", ... */
} pt_syntax_tag;

/* A classified range of an accepted tag (EDT-8). */
typedef struct pt_syntax_token {
    size_t start, end;
    const char *kind; /* "delimiter", "keyword", "variable", "property", "function", "string", ... */
} pt_syntax_token;

/* The accepted tags and their tokens in source order; the arrays live in the arena of the template. */
typedef struct pt_analysis {
    pt_syntax_tag *tags;
    uint32_t tag_count;
    pt_syntax_token *tokens;
    uint32_t token_count;
} pt_analysis;

/* Parses a source like pt_parse and fills the accepted tags and their EDT-8 tokens, with byte offsets after a
 * leading byte order mark. */
pt_template *pt_analyze(pt_run *run, const char *name, size_t name_length, const char *source, size_t length, char open, char close, pt_analysis *analysis);

/* The analysis of a template as the array of Parser::analyze: `ast`, `tags` and `tokens` (EDT-8). */
void pt_analysis_to_zval(const pt_template *template, const pt_analysis *analysis, zval *result);

/* EDT-11: arena-owned parser state remains readable after a parser error. */
typedef struct pt_tparser pt_prefix_parser;
pt_prefix_parser *pt_prefix_start(pt_run *run, const char *name, size_t name_length, const char *bytes, size_t length,
    char open, char close);
void pt_prefix_scan(pt_prefix_parser *parser);
void pt_prefix_to_zval(const pt_prefix_parser *parser, zval *result);

/* The class BlockTag of Polyspec\Template\Parser: its create_object and handlers (pt_parse.c). */
void pt_block_tag_register(zend_class_entry *ce);

/* The tables of the tag scanner: the sigils (LEX-5) and the wrappers [opener, closer] (LEX-17, LEX-18). */
#define PT_SIGIL_COUNT 11
#define PT_WRAPPER_COUNT 4
extern const char *const pt_sigils[PT_SIGIL_COUNT];
extern const char *const pt_wrappers[PT_WRAPPER_COUNT][2];

/* The scanner over bytes; see pt_parse.c. Offsets are not negative. */
size_t pt_scan_skip_horizontal(const char *text, size_t length, size_t index);
bool pt_scan_is_horizontal(const char *text, size_t length);
const char *pt_scan_sigil_after(const char *text, size_t length, size_t open);
bool pt_scan_starts_tag(const char *text, size_t length, size_t open, int close);
int pt_scan_wrapped_tag_at(const char *text, size_t length, size_t index, int open, int close);
bool pt_scan_delimiter_char(const char *text, size_t length);

/* A byte range that a standalone line group removes (LEX-14, LEX-15). */
typedef struct pt_range {
    size_t start, end;
} pt_range;

typedef struct pt_ranges {
    pt_range *v;
    uint32_t count;
} pt_ranges;

/* The ranges that the standalone tags of the accepted tags (in source order) remove from a text with the given lines. */
pt_ranges pt_standalone_ranges(pt_arena *arena, const pt_lines *lines, const char *text, size_t length, const pt_syntax_tag *tags, uint32_t tag_count);

/* The classes Ast, Parser\Scanner and Parser\Standalone (pt_scanner.c). */
void pt_ast_declare_constants(zend_class_entry *ce);
void pt_scanner_declare_constants(zend_class_entry *ce);
/* The classes FormatError, FormatResult, the Analyzer interface and PackageAnalyzer of the formatter (pt_format.c). */
void pt_format_register(zend_class_entry *error, zend_class_entry *result, zend_class_entry *analyzer,
    zend_class_entry *package_analyzer);
/* An expression token of the formatter: its text and its EDT-8 kind, borrowed from the caller. */
typedef struct pt_format_token {
    pt_s text;
    pt_s kind;
} pt_format_token;
/* Expression::join (pt_format.c): the tokens joined with the separators of the formatting style, as a new string; the
 * caller frees nothing but the array. The count is not zero. */
zend_string *pt_format_join(const pt_format_token *tokens, uint32_t count);
void pt_ast_is_loop_meta_field(INTERNAL_FUNCTION_PARAMETERS);
void pt_ast_node(INTERNAL_FUNCTION_PARAMETERS);
void pt_ast_to_json(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_skip_horizontal_space(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_is_horizontal_space(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_sigil_after(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_starts_tag(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_wrapped_tag_at(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_is_delimiter_char(INTERNAL_FUNCTION_PARAMETERS);
void pt_scanner_parse_delimiters(INTERNAL_FUNCTION_PARAMETERS);
void pt_standalone_ranges_of(INTERNAL_FUNCTION_PARAMETERS);

/* LEX-21. */
bool pt_parse_delimiters(const char *value, size_t length, char *open, char *close);

/* The AST as nested PHP arrays (RT-2). */
void pt_ast_to_zval(const pt_template *template, zval *result);

/* One expression node as the nested PHP array of the AST (EXP-7 to EXP-16, AST-4). */
void pt_expr_zval(const pt_expr *expr, zval *result);
/* The id, the path and the scope items of a block node, as the AST array and readBlockBody write them (pt_ast.c). */
void pt_add_block_target(zval *result, const pt_node *node);
/* `$object->name(...)`, or `Class::name(...)` when object is NULL, of a method that the class declares (polyspec_template.c). */
void pt_call_method(zend_class_entry *ce, zend_object *object, const char *name, size_t length, zval *result, uint32_t count, zval *args);

/* The classes Token, Lexer and Parser of Polyspec\Template\Expr (pt_parse.c). */
void pt_expr_register(zend_class_entry *token, zend_class_entry *lexer, zend_class_entry *parser);

/* The template of an AST given as nested PHP arrays, with no source and no line index; an array that is not an AST is
 * an internal failure. */
pt_template *pt_ast_from_zval(pt_run *run, zval *ast);
/* AstDecoder::decode (AST-10): the JSON text as the AST array, validated against the contract schema; the failure is
 * the JsonException or the AstDecodeError that the library throws. Also AstProgram::decodeTemplate. */
void pt_ast_decode(zend_string *json, zval *return_value);
extern zend_class_entry *pt_ast_decode_error_ce;

/* The line index of a template, or NULL for a template that has no source. */
static inline const pt_lines *pt_template_lines(const pt_template *template)
{
    return template->lines.starts != NULL ? &template->lines : NULL;
}

/* ---------------------------------------------------------------------------------------------------
 * The engine state that a render reads.
 * ------------------------------------------------------------------------------------------------- */

typedef struct pt_limits {
    zend_long iterations, depth, output_bytes, expression_depth;
} pt_limits;

/* The runtime services of a render: the limits and the registered callables (RT-33, FUN-43). The state lives in a
 * RuntimeEnvironment object, which an engine holds. */
typedef struct pt_runtime {
    pt_limits limits;
    HashTable functions; /* name => callable */
    HashTable classes;   /* "Class::method" => callable */
} pt_runtime;

typedef struct pt_runtime_object {
    pt_runtime runtime;
    zend_object std;
} pt_runtime_object;

static inline pt_runtime *pt_runtime_of(zend_object *object)
{
    return &((pt_runtime_object *)((char *)object - XtOffsetOf(pt_runtime_object, std)))->runtime;
}

typedef struct pt_engine {
    zend_string *root; /* the real path of the loader root, or NULL without a loader */
    char open, close;
    zval runtime;       /* the RuntimeEnvironment object whose functions and limits a render reads */
    HashTable cache;     /* name => pt_template* */
    HashTable files;     /* "device:inode" => the name under which the loader read the file (RT-10) */
    zval loader;         /* the loader object of an AstProgram; UNDEF for the built-in filesystem loader */
    uint8_t refresh;     /* the artifact refresh policy of the loader object */
} pt_engine;

static inline pt_runtime *pt_engine_runtime(const pt_engine *engine)
{
    return pt_runtime_of(Z_OBJ(engine->runtime));
}

enum { PT_REFRESH_TRUE, PT_REFRESH_DEV, PT_REFRESH_FALSE };

typedef struct pt_env {
    pt_s timezone;
    double now;
} pt_env;

/* A template definition (RT-24). */
typedef struct pt_define {
    bool html;
    pt_s template; /* the resolved name, or the HTML */
    pt_map *data;  /* NULL without data */
} pt_define;

/* Built-in functions (docs/spec/functions.md). */
typedef struct pt_function_error {
    const char *code;
    zend_string *message;
} pt_function_error;

typedef bool (*pt_builtin_fn)(pt_arena *arena, const pt_env *env, pt_value *args, uint32_t count, pt_value *result, pt_function_error *error);

typedef struct pt_builtin {
    const char *name;
    uint32_t min, max;
    pt_builtin_fn call;
} pt_builtin;

const pt_builtin *pt_builtin_find(const char *name, size_t length);

/* The date operations of pt_functions.c, which Functions\Dates (pt_groups.c) and the date built-in function share. */
bool pt_parse_offset(pt_s text, zend_long *offset);
bool pt_tag_int(HashTable *tag, const char *key, zend_long *value);
zend_long pt_days_from_civil(zend_long year, zend_long month, zend_long day);
void pt_civil_from_days(zend_long days, zend_long *year, zend_long *month, zend_long *day);
bool pt_unix_seconds(pt_value value, zend_long env_offset, zend_long *seconds, pt_function_error *error);
pt_s pt_format_date(pt_arena *arena, zend_long seconds, pt_s format, zend_long offset);

/* JSON (VAL-12, FUN-26). */
typedef struct pt_bind_error {
    const char *code;
    zend_string *message;
} pt_bind_error;

bool pt_json_parse(pt_arena *arena, const char *text, size_t length, pt_value *result, pt_bind_error *error);
/* FUN-26: false for a value that is or holds a native object, which has no JSON text (VAL-19). */
bool pt_json_write(pt_buf *buf, pt_value value);

/* Template names (RT-7, RT-8): false when the path leaves the loader root. */
bool pt_resolve_path(pt_arena *arena, pt_s current, pt_s path, pt_s *name);

/* ---------------------------------------------------------------------------------------------------
 * Host binding (VAL-11, VAL-17 to VAL-22).
 * ------------------------------------------------------------------------------------------------- */

/* A bound map of the extension (VAL-22); the zend_object is the last member. */
typedef struct pt_bound {
    pt_arena arena;
    pt_map *map;
    zend_object *sources[2]; /* the bound maps that a merge read; they own the values */
    zend_object std;
} pt_bound;

extern zend_class_entry *pt_bound_ce;
extern zend_class_entry *pt_error_ce;
extern zend_class_entry *pt_source_ce;
/* A TemplateError object with the fields of an error, and the 1-based line and column of an offset in a PHP list of
 * line starts (the error of a source and Source::position). */
zend_object *pt_error_object(const char *code, zend_string *template, zend_long line, zend_long col, zend_long offset, zend_long end, zend_string *message);
void pt_error_position(HashTable *lines, zend_long offset, zend_long *line, zend_long *col);
extern zend_class_entry *pt_safe_string_ce;
extern zend_class_entry *pt_map_value_ce;

static inline pt_bound *pt_bound_from(zend_object *object) {
    return (pt_bound *)((char *)object - XtOffsetOf(pt_bound, std));
}

/* The bound map of a PHP value, or NULL. */
pt_bound *pt_bound_of(zval *value);

bool pt_bind_value(pt_arena *arena, zval *input, pt_value *result, pt_bind_error *error);
/* RT-4: null and the empty array give the empty map; a bound map of the extension gives its map. */
bool pt_bind_map(pt_arena *arena, zval *input, pt_map **result, pt_bind_error *error);
/* The PHP value of a library value (VAL-17), and the exceptions that a failure throws: each one takes the code and
 * the message of the failure and releases the message (polyspec_template.c). */
void pt_library_value(pt_value value, zval *result);
void pt_throw_bind_error(const char *code, zend_string *message);
void pt_throw_function_error(const char *code, zend_string *message);
/* VAL-21: the host form of a value. */
void pt_host_value(pt_value value, zval *result);
/* The PHP value of a bound value for the library (true: SafeString, MapValue) or for the host (false: text, PHP array). */
void pt_php_value(pt_value value, zval *result, bool library);
/* VAL-19: the public properties of an object, by name. */
bool pt_object_property(pt_arena *arena, zend_object *object, pt_s name, pt_value *result, bool *found, pt_bind_error *error);

/* Takes the pending exception of host code: its message, or the exception itself when it is a native
 * TemplateError, which passes unchanged. */
zend_string *pt_take_exception(zend_object **passthrough);

/* The arity message of a built-in call (E_RUNTIME_ARITY), or NULL when count is within min..max. */
zend_string *pt_arity_message(const char *name, const pt_builtin *builtin, uint32_t count);

/* The message of a failed host call (E_RUNTIME_HOST_FUNCTION): "<name> failed: <message>" for the pending exception.
 * A native TemplateError passes unchanged: NULL is returned and *passthrough is set. */
zend_string *pt_host_failure(const char *name, zend_object **passthrough);

/* ---------------------------------------------------------------------------------------------------
 * Value, Number and HostArgument on PHP values (pt_values.c): EXP-33 to EXP-38, VAL-8, VAL-9, VAL-21, FUN-20 to FUN-25.
 * A function that returns false has set an exception.
 * ------------------------------------------------------------------------------------------------- */

bool pt_host_loose_equals(zval *a, zval *b);
bool pt_host_strict_equals(zval *a, zval *b);
bool pt_host_compare(zval *a, zval *b, zend_long *order);
const char *pt_host_type_name(zval *value);
bool pt_host_truthy(zval *value);
bool pt_host_stringify(zval *value, zval *result);
/* Value::isString and the text of a value that it accepts (the text is borrowed from the value). */
bool pt_host_is_string(zval *value);
zend_string *pt_host_text_of(zval *value);
bool pt_number_host_text(double value, zval *result);
bool pt_number_shortest_digits(double value, zval *result);
bool pt_number_positional(double value, zval *result);
bool pt_number_round_decimal(double value, zend_long decimals, zval *result);
bool pt_number_round(double value, zend_long decimals, zval *result);
bool pt_number_format(double value, zend_long decimals, zend_string *dec, zend_string *thousands, zval *result);
void pt_host_argument(zval *value, zval *result);
void pt_host_argument_list(HashTable *args, zval *result);

/* The function groups Functions\Strings, Functions\Numbers, Functions\Encoding and Functions\Collection (pt_groups.c):
 * MINIT registers them with the classes of the group interface, and their table() methods give the library tables;
 * Encoding::toJson and Encoding::percentEncode are the methods of the encoding group. Functions\Dates (FUN-37 to FUN-42)
 * takes the environment as its second argument, and its methods are the date operations of the library. */
void pt_groups_register(zend_class_entry *strings, zend_class_entry *numbers, zend_class_entry *encoding,
                        zend_class_entry *collection, zend_class_entry *dates);
void pt_strings_table(INTERNAL_FUNCTION_PARAMETERS);
void pt_numbers_table(INTERNAL_FUNCTION_PARAMETERS);
void pt_encoding_table(INTERNAL_FUNCTION_PARAMETERS);
void pt_collection_table(INTERNAL_FUNCTION_PARAMETERS);
void pt_encoding_to_json(INTERNAL_FUNCTION_PARAMETERS);
void pt_encoding_percent_encode(INTERNAL_FUNCTION_PARAMETERS);
void pt_dates_table(INTERNAL_FUNCTION_PARAMETERS);
/* Functions\Registry (pt_groups.c): builtins joins the tables of the groups; isBuiltin reads the table of the renderer. */
void pt_registry_builtins(INTERNAL_FUNCTION_PARAMETERS);
void pt_registry_is_builtin(INTERNAL_FUNCTION_PARAMETERS);
void pt_dates_parse_offset(INTERNAL_FUNCTION_PARAMETERS);
void pt_dates_days_from_civil(INTERNAL_FUNCTION_PARAMETERS);
void pt_dates_civil_from_days(INTERNAL_FUNCTION_PARAMETERS);
void pt_dates_to_unix_seconds(INTERNAL_FUNCTION_PARAMETERS);
void pt_dates_format(INTERNAL_FUNCTION_PARAMETERS);

/* ---------------------------------------------------------------------------------------------------
 * Rendering (RT-*).
 * ------------------------------------------------------------------------------------------------- */

typedef struct pt_request {
    pt_s name;
    pt_map *data;
    HashTable *defines; /* id => pt_define* (ZVAL_PTR), owned by the run */
    pt_env env;
    pt_template *root; /* the prepared entry template, or NULL when the engine loads it by name */
} pt_request;

/* Resolves the entry template of a request like pt_render does, loads it, and keeps it beyond the run (RT-61). The
 * template of `ast` is the entry when `ast` is not UNDEF. */
pt_template *pt_prepare_root(pt_run *run, pt_engine *engine, const pt_request *request, zval *ast);

/* AstProgram::loadTemplate (RT-9, RT-40): loads `name` with the loader and the cache of the engine, as a render does. A
 * failure is located at the frame `frame_name` and `frame_lines` and the span `start` to `end` when `located`, else
 * named after `name`. The template is held by the run. */
pt_template *pt_load_named(pt_run *run, pt_engine *engine, pt_s name, bool located, pt_s frame_name, const pt_lines *frame_lines, size_t start, size_t end);

/* Renders the template `name`; the output is appended to `output`. */
void pt_render(pt_run *run, pt_engine *engine, const pt_request *request, smart_str *output);

/* Releases the templates that a run holds. */
void pt_run_release_templates(pt_run *run);

/* ---------------------------------------------------------------------------------------------------
 * Render state (S10): the classes Frame, Scope and Context of the library (pt_render_state.c). The
 * methods are forwarded by the ZEND_METHOD functions of polyspec_template.c.
 * ------------------------------------------------------------------------------------------------- */

/* Called once by MINIT, after the classes that these classes refer to are registered. */
void pt_render_state_register(zend_class_entry *runtime_services, zend_class_entry *frame, zend_class_entry *scope, zend_class_entry *context);
void pt_frame_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_scope_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_scope_lookup(INTERNAL_FUNCTION_PARAMETERS);
void pt_scope_loop_meta(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_write(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_output(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_at(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_fail(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_enter(INTERNAL_FUNCTION_PARAMETERS);
void pt_context_leave(INTERNAL_FUNCTION_PARAMETERS);

/* ---------------------------------------------------------------------------------------------------
 * Runtime bindings (S10): RuntimeBindings (pt_bindings.c) and the operations it shares with the render
 * state (pt_render_state.c), the functions and the values of this extension.
 * ------------------------------------------------------------------------------------------------- */

extern zend_class_entry *pt_frame_ce, *pt_context_ce;
extern zend_class_entry *pt_function_error_ce, *pt_bind_error_ce;
bool pt_context_limit(zval *context, const char *name, size_t length, zend_long *value);
void pt_context_error(zval *context, zend_string *code, zval *frame, zval *span, zend_string *message, zval *error);
void pt_context_throw(zval *context, const char *code, zval *frame, zval *span, zend_string *message);
bool pt_helper_number(zval *value, double *number);
bool pt_zval_depth_within(zval *value, zend_long limit);
bool pt_canonical_digits(pt_s text, zend_long *index);
/* Escape::html of a string. */
zend_string *pt_escape_html_string(zend_string *text);

void pt_bindings_register(zend_class_entry *ce);
void pt_bindings_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_truthy(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_unary(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_binary(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_stringify(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_escape(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_number(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_finite(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_equal(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_compare(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_member(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_member_call(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_class_call(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_index(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_depth(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_entries(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_list_spread(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_map_spread(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_call(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_limit(INTERNAL_FUNCTION_PARAMETERS);
void pt_bindings_error(INTERNAL_FUNCTION_PARAMETERS);

/* Evaluator and Renderer (pt_render_classes.c): registered by MINIT with the classes they use. */
void pt_render_classes_register(zend_class_entry *evaluator, zend_class_entry *renderer, zend_class_entry *runtime_bindings,
                                zend_class_entry *scope, zend_class_entry *path, zend_class_entry *program);
void pt_evaluator_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_evaluator_evaluate(INTERNAL_FUNCTION_PARAMETERS);
void pt_renderer_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_renderer_render_nodes(INTERNAL_FUNCTION_PARAMETERS);

/* PageCache (pt_page_cache.c): the final HTML pages of the library, held by the object. */
void pt_page_cache_register(zend_class_entry *ce);
void pt_page_cache_construct(INTERNAL_FUNCTION_PARAMETERS);
void pt_page_cache_get(INTERNAL_FUNCTION_PARAMETERS);
void pt_page_cache_set(INTERNAL_FUNCTION_PARAMETERS);
void pt_page_cache_get_or_set(INTERNAL_FUNCTION_PARAMETERS);
void pt_page_cache_delete(INTERNAL_FUNCTION_PARAMETERS);
void pt_page_cache_clear(INTERNAL_FUNCTION_PARAMETERS);

#endif
