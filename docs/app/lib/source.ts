import { loader } from 'fumadocs-core/source';
import { defineDocs } from 'fumadocs-mdx/macro';
import { docsRoute } from './shared';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    async: true,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
});
