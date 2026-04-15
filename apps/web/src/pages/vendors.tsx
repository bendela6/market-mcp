import { Card, CardContent, CardHeader, CardTitle } from '@market/ui';

const VENDORS = [
  { id: 'wolt',        name: 'Wolt' },
  { id: 'glovo',       name: 'Glovo' },
  { id: 'bolt-food',   name: 'Bolt Food' },
  { id: 'europroduct', name: 'Europroduct' },
  { id: 'goodwill',    name: 'Goodwill' },
];

export function VendorsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vendors</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {VENDORS.map((v) => (
          <Card key={v.id}>
            <CardHeader><CardTitle>{v.name}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">id: {v.id}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
