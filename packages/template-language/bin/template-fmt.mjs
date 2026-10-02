#!/usr/bin/env node
// Command line entry of template-fmt; the implementation is src/cli/main.ts.
import { main } from '../dist/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
