#!/usr/bin/env node
// Command line entry of template-language, the conformance command of the formatter (CNF-4); the implementation is
// src/cli/command.ts.
import { main } from '../dist/command.mjs';

process.exitCode = main(process.argv.slice(2));
