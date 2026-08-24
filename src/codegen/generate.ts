import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertNoDuplicateNames, assertReferencesResolve, scanModels } from './scan.js';
import { assertDomainMatchesFolder, assertNoDuplicateDomainNames, scanDomains } from './scan-domains.js';
import { BUILTIN_MODELS } from './builtins.js';
import { generateSchemaSource } from './schema-gen.js';
import { generateValidatorsSource } from './validators-gen.js';
import { generateRegistrySource } from './registry-gen.js';
import { generateDomainsSource } from './domains-gen.js';

export interface GenerateOptions {
  modelsDir: string;
  generatedDir: string;
}

export interface GenerateResult {
  modelCount: number;
  domainCount: number;
  files: string[];
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const scanned = [...BUILTIN_MODELS, ...(await scanModels(opts.modelsDir))];
  assertNoDuplicateNames(scanned);
  assertReferencesResolve(scanned);

  const scannedDomains = await scanDomains(opts.modelsDir);
  assertNoDuplicateDomainNames(scannedDomains);
  assertDomainMatchesFolder(opts.modelsDir, scannedDomains);

  await mkdir(opts.generatedDir, { recursive: true });

  const schemaSrc = generateSchemaSource(scanned);
  const validatorsSrc = generateValidatorsSource(scanned, opts.generatedDir);
  const registrySrc = generateRegistrySource(scanned, opts.generatedDir);
  const domainsSrc = generateDomainsSource(scannedDomains, opts.generatedDir);

  const schemaFile = path.join(opts.generatedDir, 'schema.ts');
  const validatorsFile = path.join(opts.generatedDir, 'validators.ts');
  const registryFile = path.join(opts.generatedDir, 'registry.ts');
  const domainsFile = path.join(opts.generatedDir, 'domains.ts');

  await writeFile(schemaFile, schemaSrc, 'utf8');
  await writeFile(validatorsFile, validatorsSrc, 'utf8');
  await writeFile(registryFile, registrySrc, 'utf8');
  await writeFile(domainsFile, domainsSrc, 'utf8');

  return {
    modelCount: scanned.length,
    domainCount: scannedDomains.length,
    files: [schemaFile, validatorsFile, registryFile, domainsFile],
  };
}
