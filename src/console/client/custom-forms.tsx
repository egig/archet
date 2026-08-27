import { createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { ConsoleModelMeta } from '../serialize-model.js';

/** Props a `<name>.form.tsx` component receives in place of the generated create/edit form —
 * see `ModelFormPage.tsx`, which renders it instead of its own field list once one is registered
 * for `model.name`. A custom form owns its data fetching/mutations entirely (via `getRow` /
 * `createRow` / `updateRow`, exported from `console/client`, the same helpers the generated form
 * itself uses) — there's no partial hand-off of just the field list, so a custom form isn't stuck
 * threading state through props it didn't design. */
export interface ModelFormProps {
  model: ConsoleModelMeta;
  mode: 'create' | 'update';
  /** the row id being edited; absent in create mode. */
  id?: string;
  /** call once the form is done — a successful save, or the user cancelling — same as the
   * generated form's own `onDone` (see `ModelFormPage.tsx`). Closes the dialog/returns to the
   * page it's layered over. */
  onDone: () => void;
}

export type ModelFormComponent = ComponentType<ModelFormProps>;

const CustomFormsContext = createContext<Record<string, ModelFormComponent>>({});

export function CustomFormsProvider({
  forms,
  children,
}: {
  forms: Record<string, ModelFormComponent>;
  children: ReactNode;
}) {
  return <CustomFormsContext.Provider value={forms}>{children}</CustomFormsContext.Provider>;
}

export function useCustomForms(): Record<string, ModelFormComponent> {
  return useContext(CustomFormsContext);
}
