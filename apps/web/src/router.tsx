import { lazy, Suspense } from 'react';
import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { WEB_PATHS } from '@market/contracts';
import { RootLayout }        from './layout/root-layout.js';
import { HomePage }          from './pages/home.js';
import { StoresListPage }    from './pages/stores/list.js';
import { StoreDetailPage }   from './pages/stores/detail.js';
import { ProductsListPage }  from './pages/products/list.js';
import { ProductDetailPage } from './pages/products/detail.js';
import { VendorsPage }       from './pages/vendors.js';
import { PlansListPage }     from './pages/plans/list.js';
import { PlanDetailPage }    from './pages/plans/detail.js';
import { MapPageSkeleton }   from './features/stores/map/map-page-skeleton.js';
import {
  storeListSearchSchema, itemListSearchSchema, planListSearchSchema,
  storeMapSearchSchema,
} from './search-schemas.js';

const StoresMapPage = lazy(() => import('./pages/stores/map.js'));

export const rootRoute = createRootRoute({ component: RootLayout });

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.home, component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.stores,
                component: StoresListPage, validateSearch: storeListSearchSchema }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: WEB_PATHS.storesMap,
    component: () => (
      <Suspense fallback={<MapPageSkeleton />}>
        <StoresMapPage />
      </Suspense>
    ),
    validateSearch: storeMapSearchSchema,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.storeDetail,
                component: StoreDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.products,
                component: ProductsListPage, validateSearch: itemListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.productDetail,
                component: ProductDetailPage }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.vendors, component: VendorsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.plans,
                component: PlansListPage, validateSearch: planListSearchSchema }),
  createRoute({ getParentRoute: () => rootRoute, path: WEB_PATHS.planDetail,
                component: PlanDetailPage }),
];

export const routeTree = rootRoute.addChildren(routes);
export const router = createRouter({ routeTree, defaultPreload: 'intent' });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router; }
}
