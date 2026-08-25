import type { FieldDefinition } from './field.js';

/** One extra sidebar link rendered under a Domain's console section, above its models — e.g. the
 * Automation Domain's Chat link, which has no model of its own to derive a link from. */
export interface ConsoleMenuItem {
  /** link text shown in the sidebar. */
  label: string;
  /** route path the link points to, e.g. '/chat'. */
  to: string;
}

export interface DomainDefinition {
  /** the Domain's name (see CONTEXT.md) — must match the top-level `modelsDir` subdirectory it's
   * declared in (ADR 0001), enforced by codegen at generate time. */
  name: string;
  /** sidebar/settings-page heading text; defaults to a capitalized `name` when omitted. */
  label?: string;
  /** typed, DB-backed, console-editable Domain Settings fields (ADR 0002); omit for a Domain that
   * only exists to declare a console menu, with no settings of its own. */
  settingFields?: Record<string, FieldDefinition>;
  /** extra sidebar links for this Domain's console section, rendered above its models. */
  consoleMenu?: ConsoleMenuItem[];
}

export interface DefineDomainConfig {
  label?: string;
  settings?: Record<string, FieldDefinition>;
  consoleMenu?: ConsoleMenuItem[];
}

/** Declares a Domain (see CONTEXT.md): its display label, its Domain Settings (typed, DB-backed,
 * console-editable values scoped to the Domain, read by its pipeline functions at request time —
 * ADR 0002), and any extra console sidebar links beyond the ones auto-derived from its models.
 * `settings` reuses `field.*` the same way `defineModel` does, but unlike a model, a Domain has no
 * table of its own: all Domains' settings values live in one shared `ratchet_domain_settings`
 * row-per-domain table (see `core/domain-settings-persistence.ts`), since there's always exactly
 * one settings value per Domain. Both `settings` and `consoleMenu` are optional — a Domain can
 * declare either, both, or (rarely) neither. */
export function defineDomain(name: string, config: DefineDomainConfig = {}): DomainDefinition {
  return { name, label: config.label, settingFields: config.settings, consoleMenu: config.consoleMenu };
}
