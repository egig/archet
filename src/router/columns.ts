import type { ModelDefinition } from '../core/model.js';

const AUTO_COLUMNS = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdById'] as const;

/** camelCase JS keys for every column on a model's table, auto columns first. A manyToMany field
 * has no column of its own (it's backed by a separate junction table, core/many-to-many.ts) so
 * it's excluded here — it's populated separately, as an array, by `router/list.ts`'s
 * `attachManyToManyIncludes`, only when explicitly `?include=`d. */
export function allColumnKeys(model: ModelDefinition): string[] {
  return [
    ...AUTO_COLUMNS,
    ...Object.entries(model.fields)
      .filter(([, f]) => f.kind !== 'manyToMany')
      .map(([key]) => key),
  ];
}
