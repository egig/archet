import { describe, expect, it } from 'bun:test';
import { defineModel, field, type PipelineFn } from '../src/core/index.js';
import { serializeModelMeta } from '../src/console/serialize-model.js';

const noop: PipelineFn = (ctx) => ctx;

describe('serializeModelMeta (src/console/serialize-model.ts)', () => {
  const Customer = defineModel('customers', {
    fields: {
      name: field.string({ required: true }),
      roleId: field.reference('roles', { required: false }),
      passwordHash: field.string({ required: true, sensitive: true, writeAs: 'password', displayText: 'Password' }),
    },
  });

  it('humanizes a field key into a label when displayText is not set', () => {
    const meta = serializeModelMeta(Customer);
    expect(meta.fields.find((f) => f.key === 'name')!.label).toBe('Name');
    expect(meta.fields.find((f) => f.key === 'roleId')!.label).toBe('Role Id');
  });

  it('uses displayText as the label when declared', () => {
    const meta = serializeModelMeta(Customer);
    expect(meta.fields.find((f) => f.key === 'passwordHash')!.label).toBe('Password');
  });

  it('infers displayField from the first string field when console.displayField is unset', () => {
    const meta = serializeModelMeta(Customer);
    expect(meta.displayField).toBe('name');
  });
});

describe('serializeModelMeta: custom operations (Q6/Q9/Q11/Q13/Q14/Q19)', () => {
  const Document = defineModel('opdocs3', {
    fields: {
      title: field.string({ required: true }),
      locked: field.boolean({ default: false }),
    },
    operations: {
      // a bare PipelineFn — no `console` block at all — still gets default presentation.
      archive: noop,
      lock: {
        pipeline: noop,
        console: {
          label: 'Lock',
          confirm: 'Really lock this document?',
          placement: ['row', 'detail'],
          visibleWhen: { field: 'locked', equals: false },
        },
      },
      retitle: {
        pipeline: noop,
        params: { title: field.string({ required: true, displayText: 'New title' }) },
      },
    },
  });

  it('excludes the three builtins from `operations` but keeps them in `operationNames`', () => {
    const meta = serializeModelMeta(Document);
    expect(meta.operationNames.sort()).toEqual(['archive', 'create', 'lock', 'remove', 'retitle', 'update']);
    expect(meta.operations.map((o) => o.name).sort()).toEqual(['archive', 'lock', 'retitle']);
  });

  it('a bare PipelineFn (no console block) gets a humanized default label, no params, row placement, no confirm/visibleWhen', () => {
    const meta = serializeModelMeta(Document);
    const archive = meta.operations.find((o) => o.name === 'archive')!;
    expect(archive).toEqual({ name: 'archive', label: 'Archive', params: [], confirm: undefined, placement: ['row'], visibleWhen: undefined });
  });

  it('a CustomOperationDefinition.console block is serialized as declared', () => {
    const meta = serializeModelMeta(Document);
    const lock = meta.operations.find((o) => o.name === 'lock')!;
    expect(lock.label).toBe('Lock');
    expect(lock.confirm).toBe('Really lock this document?');
    expect(lock.placement).toEqual(['row', 'detail']);
    expect(lock.visibleWhen).toEqual({ field: 'locked', equals: false });
  });

  it('params are serialized the same way model fields are (Q15)', () => {
    const meta = serializeModelMeta(Document);
    const retitle = meta.operations.find((o) => o.name === 'retitle')!;
    expect(retitle.params).toEqual([{ key: 'title', label: 'New title', kind: 'string', required: true, unique: false, indexed: false, sensitive: false }]);
  });
});
