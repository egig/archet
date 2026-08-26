import type { ManyToManyFieldDefinition } from './field.js';
import { field } from './field.js';
import { defineModel, type ModelDefinition } from './model.js';
import { toSnakeCase } from './naming.js';

export interface ManyToManyRelation {
  /** the model that declared `field.manyToMany()` */
  sourceModel: ModelDefinition;
  /** the field key it was declared under, e.g. 'tags' */
  fieldKey: string;
  fieldDef: ManyToManyFieldDefinition;
}

/** every manyToMany field declared directly on `model` (the "source" side of the relation) — the
 * only direction that's actually stored on a model's own `fields`; the reverse direction is never
 * declared anywhere and has to be found by searching the registry (`findRelationsTargeting`). */
export function manyToManyFieldsOf(model: ModelDefinition): ManyToManyRelation[] {
  return Object.entries(model.fields)
    .filter((e): e is [string, ManyToManyFieldDefinition] => e[1].kind === 'manyToMany')
    .map(([fieldKey, fieldDef]) => ({ sourceModel: model, fieldKey, fieldDef }));
}

/** every manyToMany relation, declared on any model in the registry, whose target is `modelName` —
 * the reverse direction of a relation `modelName` never itself declared. Declaring
 * `tags: field.manyToMany('tags')` on `Post` makes both `?include=tags` (from `Post`) and
 * `?include=posts` (from `Tag`) work with no matching declaration needed on `Tag` — that reverse
 * lookup has to search every other model's fields, since `Tag` has nothing of its own to read. */
export function findRelationsTargeting(registry: Record<string, ModelDefinition>, modelName: string): ManyToManyRelation[] {
  return Object.values(registry).flatMap((m) => manyToManyFieldsOf(m).filter((r) => r.fieldDef.targetModel === modelName));
}

/** every manyToMany relation touching `modelName` at all, source or target side alike — used by
 * cascade-delete (`core/pipeline.ts`'s `persistRemove`), which must clear junction rows regardless
 * of which side of the relation `modelName` happens to be. */
export function allManyToManyRelationsInvolving(registry: Record<string, ModelDefinition>, modelName: string): ManyToManyRelation[] {
  const model = registry[modelName];
  const declared = model ? manyToManyFieldsOf(model) : [];
  return [...declared, ...findRelationsTargeting(registry, modelName)];
}

export interface JunctionColumns {
  tableName: string;
  /** FK column (camelCase model field key) pointing back at the declaring (source) model */
  sourceColumn: string;
  /** FK column (camelCase model field key) pointing at the relation's target model */
  targetColumn: string;
}

/** Deterministic, guess-free naming for the junction backing one manyToMany relation — computed
 * identically at codegen time (`codegen/schema-gen.ts`, to emit the table) and at request time
 * (`core/pipeline.ts`, `router/list.ts`, to read/write it), so it never needs to be looked up from
 * anywhere stored; every caller just recomputes it. Table name is `<sourceModel>_<fieldKey>` (e.g.
 * `posts_tags`) — namespaced by field key, not just the two model names, so a model with two
 * manyToMany fields to the same target (e.g. `tags` and `relatedTags`, both -> `tags`) still gets
 * two distinct junction tables. Column names are `<modelName>Id` verbatim (e.g. `postsId`,
 * `tagsId`) — deliberately not singularized: this framework never guesses plural/singular grammar
 * anywhere else (a model's name *is* its table name, no auto-pluralization, `docs/guide/models.md`),
 * and these columns are never seen by an API consumer or console user — the junction model this
 * backs is always `api.hidden`/`console: { hidden: true }` (see `buildJunctionModel`). */
export function junctionColumns(sourceModel: ModelDefinition, fieldKey: string, fieldDef: ManyToManyFieldDefinition): JunctionColumns {
  return {
    tableName: `${sourceModel.name}_${toSnakeCase(fieldKey)}`,
    sourceColumn: `${sourceModel.name}Id`,
    targetColumn: `${fieldDef.targetModel}Id`,
  };
}

export function junctionColumnsOf(relation: ManyToManyRelation): JunctionColumns {
  return junctionColumns(relation.sourceModel, relation.fieldKey, relation.fieldDef);
}

/** Given `relation` and the name of a model that's *either* its source or its target, the junction
 * column an instance of that model's id is stored under — used by cascade-delete, which reaches a
 * relation from either side (see `allManyToManyRelationsInvolving`) and needs to know which column
 * to match the removed row's id against. */
export function junctionColumnFor(relation: ManyToManyRelation, roleModelName: string): string {
  const cols = junctionColumnsOf(relation);
  if (roleModelName === relation.sourceModel.name) return cols.sourceColumn;
  if (roleModelName === relation.fieldDef.targetModel) return cols.targetColumn;
  throw new Error(
    `junctionColumnFor: '${roleModelName}' is neither side of relation '${relation.sourceModel.name}.${relation.fieldKey}'`,
  );
}

/** Synthesizes the hidden join model backing one manyToMany relation — a normal model (two
 * `reference` columns, plus the usual id/createdAt/updatedAt/deletedAt/createdById every model
 * gets) with `api.hidden` (no public routes — so it needs no `Permission` rows of its own, round 5
 * of the design discussion) and `console: { hidden: true }` (no sidebar entry — the real editing
 * surface is the source model's own tag-picker/`tagIds` write). Pure function of its inputs,
 * deliberately never registered anywhere: every caller (schema-gen at codegen time, the write/
 * cascade/include/filter logic at request time) just calls this again and gets back an identical
 * `ModelDefinition`, so there is nothing to keep in sync. */
export function buildJunctionModel(relation: ManyToManyRelation): ModelDefinition {
  const cols = junctionColumnsOf(relation);
  return defineModel(cols.tableName, {
    fields: {
      [cols.sourceColumn]: field.reference(relation.sourceModel.name, { required: true, indexed: true }),
      [cols.targetColumn]: field.reference(relation.fieldDef.targetModel, { required: true, indexed: true }),
    },
    api: { hidden: true },
    console: { hidden: true },
  });
}
