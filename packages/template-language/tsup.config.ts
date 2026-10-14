import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/main.ts',
    command: 'src/cli/command.ts',
  },
  format: ['esm'],
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'es2022',
  outExtension() {
    return { js: '.mjs' };
  },
});
