#!/usr/bin/env node
import { Command } from 'commander';
import { runInit } from './commands/init.js';
import { runGenerate } from './commands/generate.js';
import { runMigrate } from './commands/migrate.js';
import { runStudio } from './commands/studio.js';
import { runDev } from './commands/dev.js';
import { runServe } from './commands/serve.js';
import { runBuild } from './commands/build.js';

const program = new Command();
program.name('ratchet').description('Model -> Postgres schema, codegen, and composable pipelines.');

program
  .command('init')
  .description('Scaffold a new project: package.json, tsconfig.json, ratchet.config.ts, and an example model')
  .action(async () => {
    await runInit(process.cwd());
  });

program
  .command('generate')
  .description('Read models/**/*.model.ts and emit the Drizzle schema, Zod validators, and model registry')
  .action(async () => {
    await runGenerate(process.cwd());
  });

program
  .command('migrate')
  .description('Regenerate the schema, then run drizzle-kit generate + migrate against drizzle/migrations')
  .action(async () => {
    await runMigrate(process.cwd());
  });

program
  .command('studio')
  .description('Proxy to `drizzle-kit studio`')
  .action(async () => {
    await runStudio(process.cwd());
  });

program
  .command('dev')
  .description('Watch models/**/*.model.ts; on change, regenerate, `drizzle-kit push`, and restart the dev server')
  .action(async () => {
    await runDev(process.cwd());
  });

program
  .command('serve')
  .description('Boot the API server: ratchet.config.ts + the generated registry -> a listening /api/:model router')
  .action(async () => {
    await runServe(process.cwd());
  });

program
  .command('build')
  .description('Build the admin client (esbuild + Tailwind, hashed + manifest) and a bundled server artifact')
  .action(async () => {
    await runBuild(process.cwd());
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
