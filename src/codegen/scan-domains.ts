import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import type { DomainSettingsDefinition } from '../core/domain.js';
import { folderDomainOf } from './domain-path.js';

export interface ScannedDomain {
  filePath: string;
  exportName: string;
  domainSettings: DomainSettingsDefinition;
}

function isDomainSettingsDefinition(value: unknown): value is DomainSettingsDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DomainSettingsDefinition).domain === 'string' &&
    typeof (value as DomainSettingsDefinition).fields === 'object'
  );
}

async function findDomainFiles(modelsDir: string): Promise<string[]> {
  const entries = await readdir(modelsDir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.domain.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Loads every `models/**\/*.domain.ts` file's `defineDomainSettings()` exports, mirroring
 * `scanModels` (scan.ts). Does *not* validate the result — `generate()` runs
 * `assertNoDuplicateDomainNames`/`assertDomainMatchesFolder` itself once the whole list is in hand. */
export async function scanDomains(modelsDir: string): Promise<ScannedDomain[]> {
  const files = await findDomainFiles(modelsDir);
  const scanned: ScannedDomain[] = [];

  for (const filePath of files) {
    const moduleUrl = pathToFileURL(filePath).href;
    const mod = (await tsImport(moduleUrl, import.meta.url)) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod)) {
      if (isDomainSettingsDefinition(value)) {
        scanned.push({ filePath, exportName, domainSettings: value });
      }
    }
  }

  return scanned;
}

export function assertNoDuplicateDomainNames(scanned: ScannedDomain[]): void {
  const seen = new Map<string, string>();
  for (const { domainSettings, filePath } of scanned) {
    const existing = seen.get(domainSettings.domain);
    if (existing) {
      throw new Error(
        `duplicate Domain Settings for domain '${domainSettings.domain}' declared in both '${existing}' and '${filePath}' — a Domain has at most one Domain Settings definition.`,
      );
    }
    seen.set(domainSettings.domain, filePath);
  }
}

/** ADR 0001: a Model's Domain is inferred from folder structure, and Domain Settings must agree
 * with it — a `defineDomainSettings('auth', ...)` declared outside `models/auth/` (or at
 * `modelsDir`'s root) would silently apply to a Domain no model actually belongs to. */
export function assertDomainMatchesFolder(modelsDir: string, scanned: ScannedDomain[]): void {
  for (const { domainSettings, filePath } of scanned) {
    const folderDomain = folderDomainOf(modelsDir, path.dirname(filePath));
    if (folderDomain !== domainSettings.domain) {
      const foundIn = folderDomain ? `models/${folderDomain}/` : 'modelsDir root';
      throw new Error(
        `Domain Settings for '${domainSettings.domain}' (declared in '${filePath}') must live under 'models/${domainSettings.domain}/' — found under '${foundIn}' instead.`,
      );
    }
  }
}
