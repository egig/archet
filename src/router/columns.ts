import type { ModelDefinition } from '../core/model.js';

const AUTO_COLUMNS = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdById'] as const;

/** camelCase JS keys for every column on a model's table, auto columns first. */
export function allColumnKeys(model: ModelDefinition): string[] {
  return [...AUTO_COLUMNS, ...Object.keys(model.fields)];
}
