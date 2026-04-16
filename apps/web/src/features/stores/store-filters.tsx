import { useEffect, useState } from 'react';
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@market/ui';
import type { ProductLine, VendorId } from '@market/contracts';

const VENDORS: Array<{ value: VendorId; label: string }> = [
  { value: 'wolt',        label: 'Wolt' },
  { value: 'glovo',       label: 'Glovo' },
  { value: 'bolt-food',   label: 'Bolt Food' },
  { value: 'europroduct', label: 'Europroduct' },
  { value: 'goodwill',    label: 'Goodwill' },
];

const PRODUCT_LINES: Array<{ value: ProductLine; label: string }> = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'store',      label: 'Store' },
  { value: 'grocery',    label: 'Grocery' },
  { value: 'pharmacy',   label: 'Pharmacy' },
  { value: 'other',      label: 'Other' },
];

const ANY = '__any__';

export interface StoreFiltersValue {
  q?:           string;
  vendor?:      VendorId;
  productLine?: ProductLine;
  online?:      boolean;
}

interface Props {
  value:    StoreFiltersValue;
  onChange: (next: StoreFiltersValue) => void;
  /** Debounce ms for the search input. Default 300. */
  searchDebounceMs?: number;
}

export function StoreFilters({ value, onChange, searchDebounceMs = 300 }: Props) {
  const [qLocal, setQLocal] = useState(value.q ?? '');

  useEffect(() => { setQLocal(value.q ?? ''); }, [value.q]);

  useEffect(() => {
    const next = qLocal.trim() || undefined;
    if (next === value.q) return;
    const t = setTimeout(() => onChange({ ...value, q: next }), searchDebounceMs);
    return () => clearTimeout(t);
  }, [qLocal, value, onChange, searchDebounceMs]);

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search stores…"
        value={qLocal}
        onChange={(e) => setQLocal(e.target.value)}
        aria-label="Search stores"
      />

      <Select
        value={value.vendor ?? ANY}
        onValueChange={(v) =>
          onChange({ ...value, vendor: v === ANY ? undefined : (v as VendorId) })
        }
      >
        <SelectTrigger><SelectValue placeholder="Any vendor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any vendor</SelectItem>
          {VENDORS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.productLine ?? ANY}
        onValueChange={(v) =>
          onChange({ ...value, productLine: v === ANY ? undefined : (v as ProductLine) })
        }
      >
        <SelectTrigger><SelectValue placeholder="Any type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any type</SelectItem>
          {PRODUCT_LINES.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={value.online === true}
          onChange={(e) => onChange({ ...value, online: e.target.checked ? true : undefined })}
        />
        Online only
      </label>
    </div>
  );
}
