export { ConsoleApp } from './ConsoleApp.js';
export type { ConsoleAppProps } from './ConsoleApp.js';
export type { FieldRenderer } from './field-renderers.js';
export { FieldInput } from './fields.js';
export type { FieldInputProps } from './fields.js';

// The surface a `<name>.form.tsx` (see docs/guide/console.md) authors against: `ModelFormProps`
// is the props shape it receives (including `fields`, its per-field bound renderers — call
// `fields[name].render({ value, onChange, ... })` instead of wiring `FieldInput` up by hand), and
// the rest are what the generated form itself uses to fetch the row, save it, and render those
// same field editors — reused here rather than making a custom form reinvent them.
export type { ModelFormProps, ModelFormComponent, ModelFieldRenderers, BoundField, BoundFieldProps } from './custom-forms.js';
export { createModelFieldRenderers } from './custom-forms.js';
export { useModels } from './models.js';
export { useAuth } from './auth.js';
export type { AuthUser } from './api.js';
export { getRow, createRow, updateRow, hasPermission, ApiRequestError } from './api.js';
