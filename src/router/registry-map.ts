import type { ModelDefinition } from '../core/model.js';

function isModelDefinition(value: unknown): value is ModelDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ModelDefinition).name === 'string' &&
    typeof (value as ModelDefinition).operations === 'object'
  );
}

/** Turns the generated registry module's named exports into a name -> ModelDefinition lookup, keyed
 * by the model's declared route segment (§5) — not by whatever the model file's export was called. */
export function buildRegistryMap(registryModule: Record<string, unknown>): Record<string, ModelDefinition> {
  const map: Record<string, ModelDefinition> = {};
  for (const value of Object.values(registryModule)) {
    if (isModelDefinition(value)) {
      map[value.name] = value;
    }
  }
  return map;
}
