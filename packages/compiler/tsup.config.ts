import { defineConfig } from 'tsup';

// The entries are the modules that package.json exports. The repository runs the sources of src/ with Node.js, which strips
// their types; the published package runs this build.
export default defineConfig({
  entry: {
    compiler: 'src/compiler.mts',
    'ast-artifact': 'src/ast-artifact.mts',
    'type-manifest': 'src/type-manifest.mts',
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
