import type { DomainSettingsDefinition } from '../core/domain.js';
import { humanize, serializeField, type ConsoleFieldMeta } from './serialize-model.js';

export interface ConsoleDomainMeta {
  name: string;
  label: string;
  fields: ConsoleFieldMeta[];
}

/** Strips a `DomainSettingsDefinition` down to what the console client needs to render a
 * settings form — served by `GET /meta/domains[/:name]` (see `console/router.ts`), mirroring
 * `serializeModelMeta` (`serialize-model.ts`). */
export function serializeDomainSettingsMeta(def: DomainSettingsDefinition): ConsoleDomainMeta {
  return {
    name: def.domain,
    label: def.label ?? humanize(def.domain),
    fields: Object.entries(def.fields).map(([key, f]) => serializeField(key, f)),
  };
}
