import { describe, expect, it } from 'vitest';
import { defineModel, field } from '../src/core/index.js';
import { serializeModelMeta } from '../src/console/serialize-model.js';

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
