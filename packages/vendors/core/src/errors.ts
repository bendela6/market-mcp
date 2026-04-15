export class VendorError extends Error {
  constructor(
    public readonly vendorId: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[${vendorId}] ${message}`);
    this.name = 'VendorError';
  }
}

export class NotImplementedError extends VendorError {
  constructor(vendorId: string, method: string) {
    super(vendorId, `${method} not implemented`);
    this.name = 'NotImplementedError';
  }
}
