import { Link, NavLink, Outlet, isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';
import { Meta, Scripts, getWebContext } from '@egig/ratchet/web';
import { sql } from 'drizzle-orm';
import type { LoaderFunctionArgs } from 'react-router';

// The root route renders the whole HTML document. Its loader reads the console-editable "website"
// Domain Settings (site title, description, favicon, siteUrl, noindex) plus the published pages
// that opted into the header/footer nav (Pages → Navigation in the console).
interface NavPage {
  slug: string;
  title: string;
  navLocation: 'header' | 'footer';
}

export async function loader({ context }: LoaderFunctionArgs) {
  const { db, settings } = getWebContext(context);
  const [site, navRows] = await Promise.all([
    settings.get('website'),
    db.execute(
      sql`select slug, title, nav_location as "navLocation" from pages
          where status = 'published' and nav_location in ('header', 'footer') and deleted_at is null
          order by nav_order asc, title asc`,
    ),
  ]);
  return { site, nav: navRows as unknown as NavPage[] };
}

export const meta = ({ data }: { data: Awaited<ReturnType<typeof loader>> }) => {
  const site = data?.site ?? {};
  const title = typeof site.title === 'string' && site.title ? site.title : 'My site';
  const description = typeof site.description === 'string' ? site.description : '';
  const faviconUrl =
    site.favicon && typeof site.favicon === 'object' && 'url' in site.favicon ? String((site.favicon as { url: unknown }).url) : '';
  return [
    { title },
    ...(description ? [{ name: 'description', content: description }] : []),
    ...(site.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ...(faviconUrl ? [{ tagName: 'link' as const, rel: 'icon', href: faviconUrl }] : []),
  ];
};

export default function Root() {
  const { site, nav } = useLoaderData<typeof loader>();
  const siteName = typeof site.title === 'string' && site.title ? site.title : 'My site';
  const header = nav.filter((p) => p.navLocation === 'header');
  const footer = nav.filter((p) => p.navLocation === 'footer');
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/theme.css" />
        <Meta />
      </head>
      <body>
        <header className="site-header">
          <div className="container site-header__inner">
            <Link to="/" className="site-header__brand">
              {siteName}
            </Link>
            <nav className="site-nav">
              {header.map((p) => (
                <NavLink key={p.slug} to={`/${p.slug}`} className="site-nav__link">
                  {p.title}
                </NavLink>
              ))}
              <NavLink to="/contact" className="site-nav__link site-nav__link--cta">
                Contact
              </NavLink>
            </nav>
          </div>
        </header>

        <main className="site-main">
          <Outlet />
        </main>

        <footer className="site-footer">
          <div className="container site-footer__inner">
            <span>
              © {new Date().getFullYear()} {siteName}
            </span>
            <nav className="site-footer__nav">
              {footer.map((p) => (
                <Link key={p.slug} to={`/${p.slug}`}>
                  {p.title}
                </Link>
              ))}
            </nav>
          </div>
        </footer>

        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const heading = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'Something went wrong';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{heading}</title>
        <link rel="stylesheet" href="/theme.css" />
      </head>
      <body>
        <main className="site-main">
          <div className="container prose">
            <h1>{is404 ? 'Page not found' : heading}</h1>
            <p>{is404 ? "That page doesn't exist." : 'Please try again in a moment.'}</p>
            <p>
              <a href="/">Back to home</a>
            </p>
          </div>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
