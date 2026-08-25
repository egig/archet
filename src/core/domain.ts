import type { FieldDefinition } from './field.js';

export interface DomainSettingsDefinition {
  /** the Domain (see CONTEXT.md) this settings object belongs to — must match the top-level
   * `modelsDir` subdirectory it's declared in (ADR 0001), enforced by codegen at generate time. */
  domain: string;
  /** sidebar/settings-page heading text; defaults to a capitalized `domain` when omitted. */
  label?: string;
  fields: Record<string, FieldDefinition>;
}

export interface DefineDomainSettingsConfig {
  label?: string;
  fields: Record<string, FieldDefinition>;
}

/** Declares a Domain's Domain Settings (see CONTEXT.md) — typed, DB-backed, console-editable
 * values scoped to that Domain, read by that Domain's business logic (pipeline functions) at
 * request time (ADR 0002). Reuses `field.*` the same way `defineModel` does, but unlike a model,
 * a settings object has no table of its own: all Domains' values live in one shared
 * `ratchet_domain_settings` row-per-domain table (see `core/domain-settings-persistence.ts`),
 * since — unlike a model's records — there's always exactly one settings value per Domain. */
export function defineDomainSettings(domain: string, config: DefineDomainSettingsConfig): DomainSettingsDefinition {
  return { domain, label: config.label, fields: config.fields };
}
