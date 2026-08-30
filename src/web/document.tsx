import { createContext, useContext } from 'react';
import { useLocation, useMatches } from 'react-router';
import type { Location } from 'react-router';

/**
 * React Router's own `<Meta>`/`<Scripts>` only work inside Framework Mode's `<ServerRouter>`/
 * `<HydratedRouter>` (they read an internal context populated by the Vite build manifest). Data
 * mode has no such context, so these are standalone equivalents on public data-mode APIs
 * (`useMatches`, route `handle`) — the pattern from `workspace/react-router-bun`.
 */

export type MetaDescriptor =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { tagName: 'link'; rel: string; href: string; [k: string]: string };

export type MetaFunction<Data = unknown> = (args: {
  data: Data;
  params: Record<string, string | undefined>;
  location: Location;
}) => MetaDescriptor[];

export interface RouteHandle {
  meta?: MetaFunction<any>;
}

export function Meta() {
  const location = useLocation();
  const matches = useMatches();

  const descriptors: MetaDescriptor[] = [];
  for (const match of matches) {
    const meta = (match.handle as RouteHandle | undefined)?.meta;
    if (!meta) continue;
    descriptors.push(...meta({ data: match.loaderData, params: match.params, location }));
  }

  let title: string | undefined;
  const rest: Exclude<MetaDescriptor, { title: string }>[] = [];
  for (const d of descriptors) {
    if ('title' in d) title = d.title;
    else rest.push(d);
  }

  return (
    <>
      {title != null ? <title>{title}</title> : null}
      {rest.map((tag, i) => {
        if ('tagName' in tag && tag.tagName === 'link') {
          const { tagName, ...attrs } = tag;
          return <link key={i} {...attrs} />;
        }
        if ('name' in tag) return <meta key={i} name={tag.name} content={tag.content} />;
        return <meta key={i} property={(tag as { property: string }).property} content={tag.content} />;
      })}
    </>
  );
}

/** Set by the server for the SSR render only; absent on the client (the hydration payload has
 * already been read out of the DOM by the time this renders). */
export const DocumentContext = createContext<{ hydrationScript: string; entrySrc: string } | null>(null);

export function Scripts() {
  const doc = useContext(DocumentContext);
  return (
    <>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: doc?.hydrationScript ?? '' }} />
      <script type="module" src={doc?.entrySrc ?? '/_ratchet/entry.client.js'} />
    </>
  );
}
