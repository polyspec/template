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
    const char *code;     /* a static error code such as "E_PARSE_UNCLOSED_BLOCK"; NULL when unset */
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
};

/* Parses a source into a new template (LEX-*, GRM-*, AST-*). A failure jumps to the boundary of the
 * run; the template is then freed by the run. */
pt_template *pt_parse(pt_run *run, const char *name, size_t name_length, const char *source, size_t length, char open, char close);
void pt_template_release(pt_template *template);

/* LEX-21. */
bool pt_parse_delimiters(const char *value, size_t length, char *open, char *close);

/* The AST as nested PHP arrays (RT-2). */
void pt_ast_to_zval(const pt_template *template, zval *result);

/* ---------------------------------------------------------------------------------------------------
 * The engine state that a render reads.
 * ------------------------------------------------------------------------------------------------- */

typedef struct pt_limits {
    zend_long iterations, depth, output_bytes, expression_depth;
} pt_limits;

typedef struct pt_engine {
    zend_string *root; /* the real path of the loader root, or NULL without a loader */
    char open, close;
    pt_limits limits;
    HashTable functions; /* name => callable */
    HashTable classes;   /* "Class::method" => callable */
    HashTable cache;     /* name => pt_template* */
} pt_engine;

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

/* JSON (VAL-12, FUN-26). */
typedef struct pt_bind_error {
    const char *code;
    zend_string *message;
} pt_bind_error;

bool pt_json_parse(pt_arena *arena, const char *text, size_t length, pt_value *result, pt_bind_error *error);
void pt_json_write(pt_buf *buf, pt_value value);

/* Template names (RT-7, RT-8): false when the path leaves the loader root. */
bool pt_resolve_path(pt_arena *arena, pt_s current, pt_s path, pt_s *name);

/* ---------------------------------------------------------------------------------------------------
 * Host binding (VAL-11, VAL-14, VAL-17 to VAL-22).
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

static inline pt_bound *pt_bound_from(zend_object *object) {
    return (pt_bound *)((char *)object - XtOffsetOf(pt_bound, std));
}

/* The bound map of a PHP value, or NULL. */
pt_bound *pt_bound_of(zval *value);

bool pt_bind_value(pt_arena *arena, zval *input, pt_value *result, pt_bind_error *error);
/* RT-4: null and the empty array give the empty map; a bound map of the extension gives its map. */
bool pt_bind_map(pt_arena *arena, zval *input, pt_map **result, pt_bind_error *error);
/* VAL-21: the host form of a value. */
void pt_host_value(pt_value value, zval *result);
/* VAL-19: the public properties of an object, by name. */
bool pt_object_property(pt_arena *arena, zend_object *object, pt_s name, pt_value *result, bool *found, pt_bind_error *error);

/* Takes the pending exception of host code: its message, or the exception itself when it is a native
 * TemplateError, which passes unchanged. */
zend_string *pt_take_exception(zend_object **passthrough);

/* ---------------------------------------------------------------------------------------------------
 * Rendering (RT-*).
 * ------------------------------------------------------------------------------------------------- */

typedef struct pt_request {
    pt_s name;
    pt_map *data;
    HashTable *defines; /* id => pt_define* (ZVAL_PTR), owned by the run */
    pt_env env;
} pt_request;

/* Renders the template `name`; the output is appended to `output`. */
void pt_render(pt_run *run, pt_engine *engine, const pt_request *request, smart_str *output);

/* Releases the templates that a run holds. */
void pt_run_release_templates(pt_run *run);

#endif
