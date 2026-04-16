import { Link, Outlet } from '@tanstack/react-router';
import { Toaster } from '@market/ui';
import { WEB_PATHS } from '@market/contracts';

const NAV = [
  { to: WEB_PATHS.home,      label: 'Home' },
  { to: WEB_PATHS.stores,    label: 'Stores' },
  { to: WEB_PATHS.storesMap, label: 'Map' },
  { to: WEB_PATHS.products,  label: 'Products' },
  { to: WEB_PATHS.vendors,   label: 'Vendors' },
  { to: WEB_PATHS.plans,     label: 'Plans' },
];

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav className="container mx-auto flex items-center gap-6 px-6 py-4">
          <span className="font-semibold">Market</span>
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-sm text-muted-foreground hover:text-foreground [&.active]:text-foreground [&.active]:font-medium">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="container mx-auto px-6 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
