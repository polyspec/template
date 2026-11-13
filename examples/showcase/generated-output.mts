// The outputs of the typed generator (examples/showcase/compile-generated.mts): the languages it compiles each showcase
// scenario into and the path of each generated artifact. The outputs are not tracked; make typed-generator writes them.
import { join } from 'node:path';
import { filesUnder } from '../../packages/compiler/src/package-root.mts';
import { root } from '../../tests/runner/drivers.mts';
import { showcasePhpDirectory } from './php-namespace.mts';
import { showcasePythonModule } from './python-module.mts';

export const adapterRoot = join(root, 'examples/showcase/adapters');

/** The languages that the typed generator compiles every scenario into; it delivers the TypeScript program as `js` too. */
export const generatedLanguages = ['ts', 'go', 'rust', 'php', 'python'] as const;

/** The generated artifact of a scenario in a target: a file, or the directory of the PHP files. */
export function generatedOutput(id: string, language: string): string {
  if (language === 'go') return join(adapterRoot, 'go/generated', id, 'generated.go');
  if (language === 'js') return join(adapterRoot, 'generated/javascript', `${id}.js`);
  if (language === 'php') return join(root, showcasePhpDirectory(id));
  if (language === 'python') return join(adapterRoot, 'generated/typed', `${showcasePythonModule(id)}.py`);
  return join(adapterRoot, 'generated/typed', `${id}.${language}`);
}

/**
 * The files of the compiler that a compilation of the typed generator reads (T28.26): the sources of packages/compiler/src,
 * the Go of the Go backend under packages/compiler/backends and the function contract packages/compiler/functions.json.
 * Every target reads them all, since the backends share the modules of the compiler.
 */
export function compilerInputs(): string[] {
  const compiler = join(root, 'packages/compiler');
  return [
    ...['src', 'backends'].flatMap(directory => filesUnder(join(compiler, directory)).map(file => join(compiler, directory, file))),
    join(compiler, 'functions.json'),
  ];
}
