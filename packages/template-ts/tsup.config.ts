import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    render: 'src/render.ts',
    node: 'src/node/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: { compilerOptions: { types: ['node'] } },
  clean: true,
  sourcemap: true,
  platform: 'neutral',
  target: 'es2022',
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' };
  },
});
