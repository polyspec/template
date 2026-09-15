# Template function inventory

The inventory tool reads only tracked `.tpl` files from an explicitly supplied source tree. It records function-shaped calls by category and excludes ordinary JavaScript, CSS, comments and raw PHP blocks.

Run it with:

```sh
make template-function-inventory TEMPLATE_APP_ROOT=/path/to/template-source
```

The report distinguishes simple calls, qualified names, static methods and instance methods. A name in the report is an observed source form, not an approved template function. Approval requires a signature, return type, effects, error behavior and support status in the function contract described in [functions](../spec/functions).

The scanner is deliberately read-only. It does not compile, execute or modify the supplied source tree.
