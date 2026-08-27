import { createContext, useContext, type ReactNode } from 'react';
import type { FieldRenderer } from './field-renderers.js';

/** modelName -> fieldKey -> renderer — one entry per `<model>.<field>.input.tsx` under
 * `modelsDir` (see scan-field-inputs.ts/field-inputs-gen.ts). Distinct from `FieldRenderersProvider`
 * (field-renderers.tsx), which is keyed by a `field.custom()` type name declared in the model
 * itself: this one needs no change to the model definition at all, just a file on disk naming the
 * exact model+field it replaces. */
export type FieldInputOverrides = Record<string, Record<string, FieldRenderer>>;

const FieldInputOverridesContext = createContext<FieldInputOverrides>({});

export function FieldInputOverridesProvider({
  overrides,
  children,
}: {
  overrides: FieldInputOverrides;
  children: ReactNode;
}) {
  return <FieldInputOverridesContext.Provider value={overrides}>{children}</FieldInputOverridesContext.Provider>;
}

export function useFieldInputOverrides(): FieldInputOverrides {
  return useContext(FieldInputOverridesContext);
}
