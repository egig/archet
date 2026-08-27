import { describe, expect, it } from 'bun:test';
import { defineModel, field } from '../src/core/index.js';
import { serializeModelMeta } from '../src/console/serialize-model.js';

// `console/client/custom-forms.tsx` transitively imports `api.ts`, which reads
// `__CONSOLE_PATH__` at module-evaluation time — normally inlined by `Bun.build`'s `define` (see
// build-console.ts), which never runs under `bun test`. A dynamic `import()` (not a static one,
// which ESM hoists ahead of this assignment) lets these stand in for that, same as the browser
// bundle would provide.
(globalThis as Record<string, unknown>).__CONSOLE_PATH__ = '/console';
(globalThis as Record<string, unknown>).__CONSOLE_BRAND__ = {};
const { createModelFieldRenderers } = await import('../src/console/client/custom-forms.js');

describe('createModelFieldRenderers (src/console/client/custom-forms.tsx)', () => {
  const Customer = defineModel('customers', {
    fields: {
      name: field.string({ required: true }),
      passwordHash: field.string({ required: true, sensitive: true, writeAs: 'password' }),
      internalNote: field.string({ required: false, sensitive: true }),
    },
  });
  const model = serializeModelMeta(Customer);

  it('keys a plain field by its own key, with inputKey equal to that key', () => {
    const renderers = createModelFieldRenderers(model, 'create');
    expect(renderers.name?.inputKey).toBe('name');
    expect(renderers.name?.meta.key).toBe('name');
    expect(typeof renderers.name?.render).toBe('function');
  });

  it("keys a sensitive+writeAs field by its own key, but inputKey is the field's writeAs", () => {
    const renderers = createModelFieldRenderers(model, 'create');
    expect(renderers.passwordHash?.inputKey).toBe('password');
    expect(renderers.passwordHash?.meta.writeAs).toBe('password');
  });

  it('omits a sensitive field with no writeAs entirely — never writable through a declared key', () => {
    const renderers = createModelFieldRenderers(model, 'create');
    expect(renderers.internalNote).toBeUndefined();
  });
});
