import type { ConsoleMenuItem, DomainDefinition } from '../core/domain.js';
import { humanize, serializeField, type ConsoleFieldMeta } from './serialize-model.js';

export interface ConsoleDomainMeta {
  name: string;
  label: string;
  fields: ConsoleFieldMeta[];
  consoleMenu: ConsoleMenuItem[];
}

/** Strips a `DomainDefinition` down to what the console client needs to render a settings form
 * and its sidebar section — served by `GET /meta/domains[/:name]` (see `console/router.ts`),
 * mirroring `serializeModelMeta` (`serialize-model.ts`). */
export function serializeDomainSettingsMeta(def: DomainDefinition): ConsoleDomainMeta {
  return {
    name: def.name,
    label: def.label ?? humanize(def.name),
    fields: Object.entries(def.settingFields ?? {}).map(([key, f]) => serializeField(key, f)),
    consoleMenu: def.consoleMenu ?? [],
  };
}
