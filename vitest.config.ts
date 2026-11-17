import { configDefaults, defineConfig } from 'vitest/config';

// A timeout of 0 gives a test and a hook no time limit; the defaults of vitest are 5 s and 10 s (T28.146).
export default defineConfig({
  test: {
    testTimeout: 0,
    hookTimeout: 0,
    exclude: [...configDefaults.exclude, 'var/**'],
  },
});
