// The Python module of the generated program of one showcase scenario: a module name holds no `-`, so
// `compiler-coverage` becomes generated/typed/compiler_coverage.py, the module generated.typed.compiler_coverage that
// examples/showcase/adapters/python.py imports with an import statement.
export function showcasePythonModule(scenario) {
  return scenario.replaceAll('-', '_');
}
