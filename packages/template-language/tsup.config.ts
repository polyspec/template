import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/main.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' }, compilerOptions: { types: ['node'] } },
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'es2022',
  outExtension() {
    return { js: '.mjs' };
  },
});
