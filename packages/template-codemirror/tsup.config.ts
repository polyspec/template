import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts' } },
  clean: true,
  sourcemap: true,
  platform: 'browser',
  target: 'es2022',
  outExtension() {
    return { js: '.mjs' };
  },
});
