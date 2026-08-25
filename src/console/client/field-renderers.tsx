import { createContext, useContext, type ReactNode } from 'react';
import type { FieldInputProps } from './fields.js';

/** Renders a form editor for one field, given the same props the built-in `FieldInput` switch
 * receives — registered against a `field.custom()` name (see `core/field.ts`). */
export type FieldRenderer = (props: FieldInputProps) => ReactNode;

const FieldRenderersContext = createContext<Record<string, FieldRenderer>>({});

export function FieldRenderersProvider({
  renderers,
  children,
}: {
  renderers: Record<string, FieldRenderer>;
  children: ReactNode;
}) {
  return <FieldRenderersContext.Provider value={renderers}>{children}</FieldRenderersContext.Provider>;
}

export function useFieldRenderers(): Record<string, FieldRenderer> {
  return useContext(FieldRenderersContext);
}
