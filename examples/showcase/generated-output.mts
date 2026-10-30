// The outputs of the typed generator (examples/showcase/compile-generated.mts): the languages it compiles each showcase
// scenario into and the path of each generated artifact. The outputs are not tracked; make typed-generator writes them.
import { join } from 'node:path';
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
