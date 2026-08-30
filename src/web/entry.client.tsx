import { hydrateRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, type HydrationState } from 'react-router';
import { createSingleFetchDataStrategy } from './single-fetch.js';
// `ratchet:app-routes` is a virtual module — `appRoutesVirtualPlugin` (build-web-client.ts)
// resolves it to the consuming project's generated `.ratchet/app-routes.client.ts`. There is no
// per-app client entry to author; this framework-owned shell is identical for every project.
import { routes } from 'ratchet:app-routes';

declare global {
  interface Window {
    __staticRouterHydrationData?: HydrationState;
  }
}

const router = createBrowserRouter(routes, {
  hydrationData: window.__staticRouterHydrationData,
  dataStrategy: createSingleFetchDataStrategy(),
});

// The root route renders the whole <html> (routes/root.tsx), so hydrate the document, not a
// container inside it.
hydrateRoot(document, <RouterProvider router={router} />);
