import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { scanModels } from './scan.js';
import { generateSchemaSource } from './schema-gen.js';
import { generateValidatorsSource } from './validators-gen.js';
import { generateRegistrySource } from './registry-gen.js';

export interface GenerateOptions {
  modelsDir: string;
  generatedDir: string;
}

export interface GenerateResult {
  modelCount: number;
  files: string[];
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const scanned = await scanModels(opts.modelsDir);

  await mkdir(opts.generatedDir, { recursive: true });

  const schemaSrc = generateSchemaSource(scanned);
  const validatorsSrc = generateValidatorsSource(scanned, opts.generatedDir);
  const registrySrc = generateRegistrySource(scanned, opts.generatedDir);

  const schemaFile = path.join(opts.generatedDir, 'schema.ts');
  const validatorsFile = path.join(opts.generatedDir, 'validators.ts');
  const registryFile = path.join(opts.generatedDir, 'registry.ts');

  await writeFile(schemaFile, schemaSrc, 'utf8');
  await writeFile(validatorsFile, validatorsSrc, 'utf8');
  await writeFile(registryFile, registrySrc, 'utf8');

  return { modelCount: scanned.length, files: [schemaFile, validatorsFile, registryFile] };
}
