import path from 'node:path';

/** Computes a relative ESM import specifier (posix separators, .js extension, explicit `./`). */
export function relativeImportSpecifier(fromDir: string, toFile: string): string {
  const rel = path.relative(fromDir, toFile).split(path.sep).join('/');
  const withoutTsExt = rel.replace(/\.ts$/, '.js');
  return withoutTsExt.startsWith('.') ? withoutTsExt : `./${withoutTsExt}`;
}

export function capitalize(name: string): string {
  return name.length === 0 ? name : name[0]!.toUpperCase() + name.slice(1);
}
