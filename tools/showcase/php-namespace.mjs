// The PHP namespace of the generated program of one showcase scenario. tools/showcase/adapters/php.php
// derives the same name: `compiler-coverage` becomes `Polyspec\Showcase\Generated\CompilerCoverage`.
export function showcasePhpNamespace(scenario) {
  const name = scenario.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
  return `Polyspec\\Showcase\\Generated\\${name}`;
}
