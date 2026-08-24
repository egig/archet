import path from 'node:path';

/** The top-level `modelsDir` subdirectory `fileDir` lives under (ADR 0001: a Model's/Domain
 * Settings' Domain is inferred from folder structure, not a declared field) — e.g. a file under
 * `models/auth/` resolves to `'auth'`. Returns undefined for a file declared directly under
 * `modelsDir`, with no subdirectory. */
export function folderDomainOf(modelsDir: string, fileDir: string): string | undefined {
  const rel = path.relative(modelsDir, fileDir);
  if (rel === '' || rel.startsWith('..')) return undefined;
  return rel.split(path.sep)[0];
}
