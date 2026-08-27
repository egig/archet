import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ScannedModel } from './scan.js';

export interface ScannedFieldInput {
  filePath: string;
  /** the model and field this input replaces, taken from the filename itself
   * (`customers.email.input.tsx` -> `'customers'`/`'email'`) — mirrors `*.form.tsx`
   * (scan-forms.ts): never `import()`-ed by codegen (it's a React component meant for the
   * browser bundle), so the filename is the only signal needed, checked against the real
   * model/field list by `assertFieldInputsResolve`. */
  modelName: string;
  fieldName: string;
}

async function findFieldInputFiles(modelsDir: string): Promise<string[]> {
  const entries = await readdir(modelsDir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.input.tsx'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Collects every `models/**\/*.input.tsx` file's target model/field from its filename. Does
 * *not* validate the result — `generate()` runs `assertNoDuplicateFieldInputs`/
 * `assertFieldInputsResolve` itself once the whole list is in hand, mirroring `scanForms`. */
export async function scanFieldInputs(modelsDir: string): Promise<ScannedFieldInput[]> {
  const files = await findFieldInputFiles(modelsDir);
  return files.map((filePath) => {
    const base = path.basename(filePath, '.input.tsx'); // e.g. 'customers.email'
    const dot = base.indexOf('.');
    if (dot === -1) {
      throw new Error(
        `console field input '${filePath}' must be named '<model>.<field>.input.tsx' ` +
          `(e.g. 'customers.email.input.tsx') — got '${path.basename(filePath)}'.`,
      );
    }
    return { filePath, modelName: base.slice(0, dot), fieldName: base.slice(dot + 1) };
  });
}

export function assertNoDuplicateFieldInputs(scanned: ScannedFieldInput[]): void {
  const seen = new Map<string, string>();
  for (const { modelName, fieldName, filePath } of scanned) {
    const id = `${modelName}.${fieldName}`;
    const existing = seen.get(id);
    if (existing) {
      throw new Error(
        `duplicate console field input for '${id}' declared in both '${existing}' and '${filePath}' — ` +
          `a field has at most one '<model>.<field>.input.tsx'.`,
      );
    }
    seen.set(id, filePath);
  }
}

/** A `<model>.<field>.input.tsx`'s `model`/`field` must be a real model's name and one of its
 * declared field keys — not the `.model.ts` file's own basename. Catches a typo the same way
 * `assertReferencesResolve` (scan.ts) does for a `field.reference()` target. */
export function assertFieldInputsResolve(scanned: ScannedFieldInput[], models: ScannedModel[]): void {
  const byName = new Map(models.map(({ model }) => [model.name, model]));
  for (const { modelName, fieldName, filePath } of scanned) {
    const model = byName.get(modelName);
    if (!model) {
      throw new Error(
        `console field input '${filePath}' declares an input for unknown model '${modelName}'. ` +
          `Known models: ${[...byName.keys()].join(', ') || '(none)'}`,
      );
    }
    if (!(fieldName in model.fields)) {
      throw new Error(
        `console field input '${filePath}' declares an input for unknown field '${fieldName}' on model '${modelName}'. ` +
          `Known fields: ${Object.keys(model.fields).join(', ') || '(none)'}`,
      );
    }
  }
}
