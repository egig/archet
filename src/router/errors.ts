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

/** §5: every rejected request gets a framework-normalized `{ error: { code, ... } }` shape — never a raw driver/DB error. */
export function toErrorResponse(err: unknown): ErrorResponse {
  if (err instanceof PipelineError) {
    return {
      status: err.status,
      body: { error: { code: err.code, ...(err.fields ? { fields: err.fields } : {}) } },
    };
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR' } } };
}
