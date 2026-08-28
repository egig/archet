import type { ModelDefinition } from '../core/model.js';
import type { DomainDefinition } from '../core/domain.js';
import { injectInverseReferenceFields } from '../core/reference-to-many.js';

function isModelDefinition(value: unknown): value is ModelDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ModelDefinition).name === 'string' &&
    typeof (value as ModelDefinition).operations === 'object'
  );
}

/** Turns the generated registry module's named exports into a name -> ModelDefinition lookup, keyed
 * by the model's declared route segment (§5) — not by whatever the model file's export was called.
 * Every `referenceToMany` declared on any model gets its inverse `reference` field injected onto the
 * target model (e.g. `Article.comments` -> `Comment.articleId`), so the column the codegen step
 * emitted is a real, validation-/read-/form-aware field at runtime too. */
export function buildRegistryMap(registryModule: Record<string, unknown>): Record<string, ModelDefinition> {
  const map: Record<string, ModelDefinition> = {};
  for (const value of Object.values(registryModule)) {
    if (isModelDefinition(value)) {
      map[value.name] = value;
    }
  }
  for (const m of injectInverseReferenceFields(Object.values(map))) {
    map[m.name] = m;
  }
  return map;
}

function isDomainDefinition(value: unknown): value is DomainDefinition {
  return typeof value === 'object' && value !== null && typeof (value as DomainDefinition).name === 'string';
}

/** Turns the generated `domains.ts` module's named exports into a name -> DomainDefinition lookup,
 * keyed by the declared `name` — mirrors `buildRegistryMap` above. */
export function buildDomainSettingsRegistryMap(domainsModule: Record<string, unknown>): Record<string, DomainDefinition> {
  const map: Record<string, DomainDefinition> = {};
  for (const value of Object.values(domainsModule)) {
    if (isDomainDefinition(value)) {
      map[value.name] = value;
    }
  }
  return map;
}
