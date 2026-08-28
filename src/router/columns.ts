import type { ModelDefinition } from '../core/model.js';

const AUTO_COLUMNS = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdById'] as const;

/** camelCase JS keys for every column on a model's table, auto columns first. A manyToMany field
 * has no column of its own (it's backed by a separate junction table, core/many-to-many.ts) so
 * it's excluded here. Neither does a `referenceToMany` field — its FK column lives on the *target*
 * model (core/reference-to-many.ts), not on this declaring model — so it too is excluded and
 * populated separately, as an array, by `router/list.ts`'s `attachReferenceToManyIncludes`, only
 * when explicitly `?include=`d. */
export function allColumnKeys(model: ModelDefinition): string[] {
  return [
    ...AUTO_COLUMNS,
    ...Object.entries(model.fields)
      .filter(([, f]) => f.kind !== 'manyToMany' && f.kind !== 'referenceToMany')
      .map(([key]) => key),
  ];
}
