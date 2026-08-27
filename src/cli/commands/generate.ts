import path from 'node:path';
import { generate } from '../../codegen/generate.js';
import { loadConfig, resolveDirs } from '../load-config.js';

export async function runGenerate(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const { modelsDir, generatedDir } = resolveDirs(cwd, config);

  const { modelCount, domainCount, formCount, fieldInputCount, files } = await generate({ modelsDir, generatedDir });

  console.log(
    `generated ${modelCount} model(s), ${domainCount} domain settings, ${formCount} custom console form(s), ${fieldInputCount} custom console field input(s) -> ${path.relative(cwd, generatedDir)}/`,
  );
  for (const file of files) {
    console.log(`  ${path.relative(cwd, file)}`);
  }
}
