import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { RootLayout }        from './layout/root-layout.js';
import { HomePage }          from './pages/home.js';
import { StoresListPage }    from './pages/stores/list.js';
import { StoreDetailPage }   from './pages/stores/detail.js';
import { ProductsListPage }  from './pages/products/list.js';
import { ProductDetailPage } from './pages/products/detail.js';
import { VendorsPage }       from './pages/vendors.js';
import { PlansListPage }     from './pages/plans/list.js';
import { PlanDetailPage }    from './pages/plans/detail.js';
import {
  storeListSearchSchema, itemListSearchSchema, planListSearchSchema,
} from './search-schemas.js';

export const rootRoute = createRootRoute({ component: RootLayout });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/stores',
                component: StoresListPage, validateSearch: storeListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: '/stores/$idOrSlug',
                component: StoreDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/products',
                component: ProductsListPage, validateSearch: itemListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: '/products/$idOrSlug',
                component: ProductDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/vendors', component: VendorsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/plans',
                component: PlansListPage, validateSearch: planListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: '/plans/$idOrSlug',
                component: PlanDetailPage }),
];

export const routeTree = rootRoute.addChildren(routes);
export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
