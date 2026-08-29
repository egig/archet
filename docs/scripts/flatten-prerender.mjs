// react-router's static prerender writes each route's HTML under a folder named
// after `basename` (react-router.config.ts) — e.g. build/client/ratchet/docs/....
// GitHub Pages already serves this repo's Pages artifact rooted at
// https://egig.github.io/ratchet/, so that nesting would double the "/ratchet"
// segment. Flatten it back to the artifact root, and turn react-router's SPA
// fallback shell into the GitHub Pages 404.html convention (served verbatim,
// with a 404 status, for any URL that wasn't prerendered).
import { readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

// Keep in sync with `basename` in react-router.config.ts and `base` in vite.config.ts.
const basenameSegment = 'ratchet';

const clientDir = path.resolve(import.meta.dirname, '..', 'build', 'client');
const nestedDir = path.join(clientDir, basenameSegment);

await rename(path.join(clientDir, 'index.html'), path.join(clientDir, '404.html'));

for (const entry of await readdir(nestedDir)) {
  await rename(path.join(nestedDir, entry), path.join(clientDir, entry));
}

await rm(nestedDir, { recursive: true });
