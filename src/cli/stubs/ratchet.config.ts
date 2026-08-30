import { defineConfig } from '@egig/ratchet/core';

export default defineConfig({
  db: { connectionString: process.env.DATABASE_URL! },
  modelsDir: 'models',
  generatedDir: '.ratchet',
  migrationsDir: 'migrations',
});
