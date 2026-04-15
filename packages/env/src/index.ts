import * as v from 'valibot';

export interface ParseEnvOptions<S extends v.GenericSchema> {
  schema: S;
  source: unknown;
  label: string;
  /**
   * Called with the formatted error message when parsing fails. Must terminate
   * (return `never`) — typically `(msg) => { console.error(msg); process.exit(1); }`
   * in Node entry points, or omitted in browser code where the thrown error
   * should propagate.
   */
  onError?: (message: string) => never;
}

function formatIssues(issues: readonly v.BaseIssue<unknown>[]): string {
  return issues
    .map((i) => {
      const path = (i.path ?? []).map((p) => (p as { key?: string }).key ?? '').join('.');
      return `  - ${path || '(root)'}: ${i.message}`;
    })
    .join('\n');
}

export function parseEnv<S extends v.GenericSchema>(
  opts: ParseEnvOptions<S>,
): Readonly<v.InferOutput<S>> {
  const result = v.safeParse(opts.schema, opts.source);
  if (result.success) {
    return Object.freeze(result.output) as Readonly<v.InferOutput<S>>;
  }
  const message = `[${opts.label}] invalid environment:\n${formatIssues(result.issues)}`;
  if (opts.onError) {
    opts.onError(message);
  }
  throw new Error(message);
}
