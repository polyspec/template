// Reads the names exposed by a TypeScript source entry, including local star re-exports.
import { dirname, resolve } from 'node:path';
import { parseSync, type ModuleExportName } from 'oxc-parser';

const exportName = (name: ModuleExportName): string => name.type === 'Literal' ? name.value : name.name;

export function typescriptExports(entry: string, read: (file: string) => string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>();
  if (seen.has(entry)) return names;
  seen.add(entry);
  const { program, errors } = parseSync(entry, read(entry));
  if (errors.length) throw new Error(`${entry}: ${errors.map(error => error.message).join('; ')}`);
  for (const statement of program.body) {
    if (statement.type === 'ExportAllDeclaration') {
      if (statement.exported) {
        names.add(exportName(statement.exported));
      } else {
        const specifier = statement.source.value;
        if (!specifier.startsWith('.')) throw new Error(`${entry}: external star export ${specifier} has no local source`);
        const file = resolve(dirname(entry), specifier.replace(/\.([mc]?)js$/, '.$1ts'));
        for (const name of typescriptExports(file, read, seen)) {
          if (name !== 'default') names.add(name);
        }
      }
    } else if (statement.type === 'ExportNamedDeclaration') {
      for (const specifier of statement.specifiers) names.add(exportName(specifier.exported));
      const declaration = statement.declaration;
      if (declaration?.type === 'VariableDeclaration') {
        for (const variable of declaration.declarations) {
          if (variable.id.type === 'Identifier') names.add(variable.id.name);
        }
      } else if (declaration && 'id' in declaration && declaration.id?.type === 'Identifier') {
        names.add(declaration.id.name);
      }
    } else if (statement.type === 'ExportDefaultDeclaration') names.add('default');
  }
  return names;
}
