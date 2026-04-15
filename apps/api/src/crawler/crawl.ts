import { closeDb, getDb } from '../db/client.js';
import { getVendorRegistry } from '../vendor-registry.js';
import { createCatalogService } from '../services/catalog.js';
import { environment } from '../environment.js';
import type { VendorId } from '@market/vendor-core';

function arg(name: string): string | undefined {
  // This CLI is allowed to read argv; it's not process.env.
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const MIN_INTERVAL_MS = 400;

async function main(): Promise<void> {
  const flags = new Set(process.argv.slice(2).filter((x) => x.startsWith('--')));
  const vendorArg = arg('--vendor') as VendorId | undefined;
  const slugArg = arg('--venue');
  const db = getDb();
  const catalog = createCatalogService(db);
  const registry = getVendorRegistry();

  const vendorIds: VendorId[] = vendorArg ? [vendorArg] : registry.ids();

  console.error(`[crawl] vendors=${vendorIds.join(',')} venuesOnly=${flags.has('--venues-only')}`);

  let totalVenues = 0;
  let totalItems = 0;
  let errors = 0;

  for (const vid of vendorIds) {
    const vendor = registry.get(vid);
    console.error(`[crawl] [${vid}] discovering venues...`);
    const list = await vendor.discoverVenues({
      lat: environment.WOLT_LAT,
      lon: environment.WOLT_LON,
    });
    console.error(`[crawl] [${vid}] found ${list.length} venues`);
    await catalog.upsertStores(vid, list);
    totalVenues += list.length;

    if (flags.has('--venues-only')) continue;

    const targetSlugs = slugArg ? [slugArg] : list.map((v) => v.slug);
    for (let i = 0; i < targetSlugs.length; i++) {
      const slug = targetSlugs[i]!;
      try {
        const index = await vendor.getAssortmentIndex(slug);
        await catalog.upsertCategories(vid, slug, index.categories);
        const flat: typeof index.categories = [];
        const walk = (l: typeof index.categories) => {
          for (const c of l) {
            flat.push(c);
            if (c.subcategories?.length) walk(c.subcategories);
          }
        };
        walk(index.categories);

        for (const cat of flat) {
          await sleep(MIN_INTERVAL_MS);
          try {
            const page = await vendor.getCategoryItems(slug, cat.slug);
            totalItems += await catalog.upsertItems(vid, slug, page.items);
          } catch (err) {
            errors++;
            console.error(`[crawl] [${vid}] ${slug}/${cat.slug} failed: ${String(err).slice(0, 160)}`);
          }
        }
        await catalog.touchStoreAssortmentRefresh(vid, slug);
        if (i % 10 === 0) console.error(`[crawl] [${vid}] ${i}/${targetSlugs.length} ${slug}`);
      } catch (err) {
        errors++;
        console.error(`[crawl] [${vid}] ${slug} failed: ${String(err).slice(0, 160)}`);
      }
    }
  }

  console.error(`[crawl] done. venues=${totalVenues} items=${totalItems} errors=${errors}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
