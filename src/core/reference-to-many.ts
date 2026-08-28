import type { ReferenceFieldDefinition, ReferenceToManyFieldDefinition } from './field.js';
import type { ModelDefinition } from './model.js';

export interface ReferenceToManyRelation {
  /** the model that declared `field.referenceToMany()` */
  sourceModel: ModelDefinition;
  /** the field key it was declared under, e.g. 'comments' */
  fieldKey: string;
  fieldDef: ReferenceToManyFieldDefinition;
}

/** every referenceToMany field declared directly on `model` (the "one"/source side of the relation)
 * — the only direction that's actually stored on a model's own `fields`; the inverse FK lives on the
 * target, found by searching the registry (`findRelationsTargeting`). */
export function referenceToManyFieldsOf(model: ModelDefinition): ReferenceToManyRelation[] {
  return Object.entries(model.fields)
    .filter((e): e is [string, ReferenceToManyFieldDefinition] => e[1].kind === 'referenceToMany')
    .map(([fieldKey, fieldDef]) => ({ sourceModel: model, fieldKey, fieldDef }));
}

/** The FK column name on the target model — `<declaringModelName>Id` by default (e.g. an
 * `Article` declaring `comments: field.referenceToMany('Comment')` puts `articleId` on `Comment`),
 * or `fieldDef.inverseColumn` when the declaration overrides it. */
export function inverseColumnName(relation: ReferenceToManyRelation): string {
  return relation.fieldDef.inverseColumn ?? `${relation.sourceModel.name}Id`;
}

/** every referenceToMany relation, declared on any model in the registry, whose target is
 * `modelName` — the reverse direction of a relation `modelName` never itself declared, the same as
 * `core/many-to-many.ts`'s `findRelationsTargeting`. Lets the framework find the children of a parent
 * (forward) and, via the auto-injected inverse `reference` field, the parent of a child (reverse). */
export function findRelationsTargeting(
  registry: Record<string, ModelDefinition>,
  modelName: string,
): ReferenceToManyRelation[] {
  return Object.values(registry)
    .flatMap((m) => referenceToManyFieldsOf(m))
    .filter((r) => r.fieldDef.targetModel === modelName);
}

/** every referenceToMany relation touching `modelName` at all, source or target side alike — used by
 * cascade-detach (`core/pipeline.ts`'s `detachReferenceToManyChildren`), which must clear the
 * inverse FK regardless of which side of the relation `modelName` happens to be. */
export function allRelationsInvolving(
  registry: Record<string, ModelDefinition>,
  modelName: string,
): ReferenceToManyRelation[] {
  const model = registry[modelName];
  const declared = model ? referenceToManyFieldsOf(model) : [];
  return [...declared, ...findRelationsTargeting(registry, modelName)];
}

/** The inverse `reference` field the *target* model physically stores (`<Source>Id`, or
 * `fieldDef.inverseColumn`) — a normal `reference` to the declaring side, so the column, validation,
 * reads, and the target's own console form all work for free. `indexed` (not `required`/`unique`):
 * a child may be orphaned (parent = null) but the `WHERE <inverseCol> = <parentId>` lookups the
 * parent-side read/write sync issues want an index. */
export function inverseReferenceFieldDef(relation: ReferenceToManyRelation): ReferenceFieldDefinition {
  return {
    kind: 'reference',
    targetModel: relation.sourceModel.name,
    required: false,
    default: undefined,
    unique: false,
    indexed: true,
    sensitive: false,
  };
}

/** Returns clones of `models` with, for each `referenceToMany`, the matching inverse `reference` field
 * injected onto its target model. A target field whose key already exists as a `reference` to the right
 * source is left alone (so a developer may declare the inverse explicitly, or two relations sharing a
 * target dedupe to one column). Throws on a genuine column-name clash — e.g. two `referenceToMany`
 * declarations resolving to the same inverse column without distinct `inverseColumn`s. Used by codegen
 * (to emit the column) and `buildRegistryMap` (to make the inverse a real field at runtime). */
export function injectInverseReferenceFields(models: ModelDefinition[]): ModelDefinition[] {
  const out = models.map((m) => ({ ...m, fields: { ...m.fields } }));
  const outByName = new Map(out.map((m) => [m.name, m]));
  const usedInverse = new Map<string, { sourceModel: string; fieldKey: string }>();

  for (const m of models) {
    for (const rel of referenceToManyFieldsOf(m)) {
      const target = outByName.get(rel.fieldDef.targetModel);
      if (!target) continue; // unresolved target — caught by assertReferencesResolve
      const key = inverseColumnName(rel);
      const existing = target.fields[key];
      if (existing) {
        if (existing.kind === 'reference' && existing.targetModel === rel.sourceModel.name) continue;
        throw new Error(
          `model '${target.name}': referenceToMany '${m.name}.${rel.fieldKey}' needs inverse column '${key}', but that field already exists as a ${existing.kind}` +
            (existing.kind === 'reference' ? ` to '${existing.targetModel}'` : '') +
            `. Use a distinct \`inverseColumn\`.`,
        );
      }
      const mapKey = `${target.name}:${key}`;
      const prior = usedInverse.get(mapKey);
      if (prior) {
        throw new Error(
          `model '${target.name}': referenceToMany '${m.name}.${rel.fieldKey}' and '${prior.sourceModel}.${prior.fieldKey}' both resolve to inverse column '${key}' — give one an explicit \`inverseColumn\`.`,
        );
      }
      usedInverse.set(mapKey, { sourceModel: m.name, fieldKey: rel.fieldKey });
      target.fields[key] = inverseReferenceFieldDef(rel);
    }
  }
  return out;
}
