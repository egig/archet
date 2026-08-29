// Regenerates content/docs/changelog.mdx from the root CHANGELOG.md so the docs
// site doesn't carry a second, hand-maintained copy of the same content.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const docsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(docsDir, '..', '..');

const source = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
// Drop the leading "# Changelog" heading — the page's own title comes from frontmatter.
const body = source.replace(/^# Changelog\n+/, '');

const frontmatter = ['---', 'title: Changelog', 'description: Notable changes to Ratchet.', '---', ''].join(
  '\n',
);

writeFileSync(path.join(docsDir, '..', 'content', 'docs', 'changelog.mdx'), frontmatter + '\n' + body);
