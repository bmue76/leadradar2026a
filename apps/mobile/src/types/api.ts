export type JsonOk<T> = {
  ok: true;
  data: T;
  traceId?: string;
};

export type JsonError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  traceId?: string;
};
