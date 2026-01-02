export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiOk<T> = { ok: true; data: T; traceId: string };
export type ApiErr = { ok: false; error: ApiError; traceId: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED" | (string & {});

export type FormField = {
  id: string;
  formId?: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  placeholder?: string | null;
  helpText?: string | null;
  config?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export type FormDetail = {
  id: string;
  name: string;
  description?: string | null;
  status: FormStatus;
  config?: unknown;
  createdAt?: string;
  updatedAt?: string;
  fields: FormField[];
};

export type FieldUpsertInput = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  isActive: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  config?: unknown;
};
