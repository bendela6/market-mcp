import type { Vendor } from './vendor.js';
import type { VendorId } from './types.js';

export class VendorRegistry {
  private readonly byId = new Map<VendorId, Vendor>();

  constructor(vendors: Vendor[]) {
    for (const v of vendors) {
      if (this.byId.has(v.id)) {
        throw new Error(`Duplicate vendor id: ${v.id}`);
      }
      this.byId.set(v.id, v);
    }
  }

  get(id: VendorId): Vendor {
    const v = this.byId.get(id);
    if (!v) throw new Error(`Vendor not registered: ${id}`);
    return v;
  }

  has(id: VendorId): boolean {
    return this.byId.has(id);
  }

  list(): Vendor[] {
    return [...this.byId.values()];
  }

  ids(): VendorId[] {
    return [...this.byId.keys()];
  }
}

export function createRegistry(vendors: Vendor[]): VendorRegistry {
  return new VendorRegistry(vendors);
}
