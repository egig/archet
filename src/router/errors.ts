import { PipelineError } from '../core/pipeline.js';

export interface ErrorResponseBody {
  error: {
    code: string;
    message?: string;
    fields?: Record<string, string>;
  };
}

export interface ErrorResponse {
  status: number;
  body: ErrorResponseBody;
}

/**
 * `instanceof PipelineError` fails when the thrower and this check load `archet` as two separate
 * module instances (e.g. a generated file importing the bare `archet/*` specifier resolves to a
 * different install/build than a relative `../core/pipeline.js` import elsewhere) — a real risk
 * with symlinked/self-referenced packages, not just a theoretical one. Falling back to a
 * structural check keeps the "every rejected request gets a normalized shape" guarantee even
 * across that boundary.
 */
function isPipelineError(err: unknown): err is PipelineError {
  if (err instanceof PipelineError) return true;
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'PipelineError' &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}

/** §5: every rejected request gets a framework-normalized `{ error: { code, ... } }` shape — never a raw driver/DB error. */
export function toErrorResponse(err: unknown): ErrorResponse {
  if (isPipelineError(err)) {
    return {
      status: err.status,
      body: { error: { code: err.code, ...(err.fields ? { fields: err.fields } : {}) } },
    };
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR' } } };
}
