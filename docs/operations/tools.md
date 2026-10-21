<!-- doc-id: docs-operations-tools -->
# Repository tools

[한국어](/ko/operations/tools).

These rules of the showcase contract were moved out of the specification because they bind the repository's showcase
adapters and tools, not the template language. Every implementation of the template language does not need them.

- The shared render request maps to each language's native API without change: a native map, object or JSON value is an
  adapter representation, so the field names, nesting and value types of the request stay as they are.
- An adapter may decode the shared JSON and construct the native API values, but it must not add controller data, rename
  fields, apply filters or otherwise reshape the request.
