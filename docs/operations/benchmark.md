# Performance measurements

The example site records repeatable measurements for this implementation with:

```sh
make showcase
```

AST and generated modes use the same scenario source graph, assign data, definitions and expected HTML. Measurement starts only after output bytes, SHA-256 and repeated-render equality pass. Final-page caching is disabled.

The site records per-scenario warm render measurements as diagnostic data. These values explain relative runtime cost inside one run; they are not cold process or end-to-end request measurements. Generated artifacts are built before render timing, while AST measurements use the committed parsed artifact.
