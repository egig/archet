import { describe, expect, it } from 'vitest';
import { defineModel, field, type PipelineFn } from '../src/core/index.js';

const noop: PipelineFn = (ctx) => ctx;

describe('defineModel: custom operations (Q11/Q17/Q19)', () => {
  it('accepts a bare PipelineFn or a full CustomOperationDefinition as a custom operation', () => {
    const model = defineModel('widgets1', {
      fields: { name: field.string({ required: true }) },
      operations: {
        archive: noop,
        lock: { pipeline: noop, console: { label: 'Lock' } },
      },
    });
    expect(typeof model.operations.archive).toBe('function');
    expect(model.operations.lock).toMatchObject({ pipeline: noop, console: { label: 'Lock' } });
    expect(Object.keys(model.operations).sort()).toEqual(['archive', 'create', 'lock', 'remove', 'update']);
  });

  it.each(['read', 'upload', '*'])("rejects a custom operation named the reserved word '%s'", (name) => {
    expect(() =>
      defineModel('widgets2', {
        fields: { name: field.string({ required: true }) },
        operations: { [name]: noop },
      }),
    ).toThrow(/reserved operation name/);
  });

  it('a `create`/`update`/`remove` key in `operations` overrides the builtin pipeline, not a reserved-name violation', () => {
    expect(() =>
      defineModel('widgets3', {
        fields: { name: field.string({ required: true }) },
        operations: { create: noop, update: noop, remove: noop },
      }),
    ).not.toThrow();
  });

  it("rejects placement: 'bulk' combined with params (Q17 — bulk-select only supports param-less operations)", () => {
    expect(() =>
      defineModel('widgets4', {
        fields: { name: field.string({ required: true }) },
        operations: {
          reject: {
            pipeline: noop,
            params: { reason: field.string({ required: true }) },
            console: { placement: ['bulk'] },
          },
        },
      }),
    ).toThrow(/placement 'bulk' with params/);
  });

  it("placement: 'bulk' alone (no params) is fine", () => {
    expect(() =>
      defineModel('widgets5', {
        fields: { name: field.string({ required: true }) },
        operations: { archive: { pipeline: noop, console: { placement: ['bulk'] } } },
      }),
    ).not.toThrow();
  });
});
