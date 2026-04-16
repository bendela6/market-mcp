import { Link, Outlet } from '@tanstack/react-router';
import { Toaster } from '@market/ui';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/stores', label: 'Stores' },
  { to: '/stores/map', label: 'Map' },
  { to: '/products', label: 'Products' },
  { to: '/vendors', label: 'Vendors' },
  { to: '/plans', label: 'Plans' },
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
