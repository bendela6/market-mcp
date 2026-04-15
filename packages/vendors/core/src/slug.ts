import { createHash } from 'node:crypto';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildStoreSlug(vendor: string, vendorSlug: string): string {
  return `${vendor}-${slugify(vendorSlug)}`;
}

export function buildCategorySlug(storeSlug: string, vendorCategorySlug: string): string {
  return `${storeSlug}-${slugify(vendorCategorySlug)}`;
}

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 6);
}

export function buildItemSlug(
  storeSlug: string,
  itemName: string,
  vendorItemId: string,
): string {
  const base = slugify(itemName) || 'item';
  return `${storeSlug}-${base}-${shortHash(vendorItemId)}`;
}
