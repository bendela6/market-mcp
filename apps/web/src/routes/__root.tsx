import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from '@market/ui';

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
});
