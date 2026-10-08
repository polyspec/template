# Changelog

[한국어](CHANGELOG.ko.md)

## Unreleased

- An instance of a class that the interpreter does not define binds as a native object (VAL-23), so a host function can return an assigned object, such as `pick(order)`; before, it failed with `E_DATA_UNSUPPORTED_TYPE`.
- A built-in with no upper argument limit called with too few arguments raises `E_RUNTIME_ARITY`; before, the message raised `OverflowError`.
