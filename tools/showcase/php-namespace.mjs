// The PHP namespace of the generated program of one showcase scenario. tools/showcase/adapters/php.php
// derives the same name: `compiler-coverage` becomes `Polyspec\Showcase\Generated\CompilerCoverage`.
export function showcasePhpNamespace(scenario) {
  const name = scenario.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
  return `Polyspec\\Showcase\\Generated\\${name}`;
}

// The directory of the generated program of one showcase scenario, relative to the repository: the PHP target writes
// one PSR-4 file per class there, which the namespace of showcasePhpNamespace maps to (T25.1).
export function showcasePhpDirectory(scenario) {
  return `tools/showcase/adapters/generated/php/${scenario}`;
}
