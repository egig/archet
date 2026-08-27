import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface ScannedForm {
  filePath: string;
  /** the model this form replaces, taken from the filename itself (`customers.form.tsx` ->
   * `'customers'`) — mirrors `*.model.ts`/`*.domain.ts`, neither of which need their file
   * contents inspected to know what they declare either. Unlike those, a `.form.tsx` file is
   * never `import()`-ed by codegen (it's a React component meant for the browser bundle, not the
   * Node process `ratchet generate` runs in) — the filename is the only signal we need, and
   * checking it against the real model list (`assertFormModelsResolve`) catches a typo. */
  modelName: string;
}

async function findFormFiles(modelsDir: string): Promise<string[]> {
  const entries = await readdir(modelsDir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.form.tsx'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Collects every `models/**\/*.form.tsx` file's target model name from its filename. Does *not*
 * validate the result — `generate()` runs `assertNoDuplicateFormModels`/`assertFormModelsResolve`
 * itself once the whole list is in hand, mirroring `scanModels`/`scanDomains`. */
export async function scanForms(modelsDir: string): Promise<ScannedForm[]> {
  const files = await findFormFiles(modelsDir);
  return files.map((filePath) => ({
    filePath,
    modelName: path.basename(filePath, '.form.tsx'),
  }));
}

export function assertNoDuplicateFormModels(scanned: ScannedForm[]): void {
  const seen = new Map<string, string>();
  for (const { modelName, filePath } of scanned) {
    const existing = seen.get(modelName);
    if (existing) {
      throw new Error(
        `duplicate console form for model '${modelName}' declared in both '${existing}' and '${filePath}' — a model has at most one '<name>.form.tsx'.`,
      );
    }
    seen.set(modelName, filePath);
  }
}

/** A `<name>.form.tsx`'s `name` must be a real model's name (the same identifier `defineModel()`
 * was called with, e.g. `'customers'`) — not the `.model.ts` file's own basename, and not its
 * export name. Catches a typo the same way `assertReferencesResolve` (scan.ts) does for a
 * `field.reference()` target. */
export function assertFormModelsResolve(scanned: ScannedForm[], knownModelNames: Set<string>): void {
  for (const { modelName, filePath } of scanned) {
    if (!knownModelNames.has(modelName)) {
      throw new Error(
        `console form '${filePath}' declares a form for unknown model '${modelName}'. ` +
          `Known models: ${[...knownModelNames].join(', ') || '(none)'}`,
      );
    }
  }
}
