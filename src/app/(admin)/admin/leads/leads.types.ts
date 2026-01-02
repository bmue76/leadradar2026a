export type ApiOk<T> = { ok: true; data: T; traceId: string };
export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  traceId: string;
};
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type AdminLeadListItem = {
  id: string;
  formId: string;
  capturedAt: string; // ISO
  isDeleted: boolean;
  preview?: string | null; // optional server-provided
  values?: Record<string, unknown> | null; // optional server-provided
};

export type AdminLeadsListData = {
  items?: AdminLeadListItem[];
  leads?: AdminLeadListItem[];
  nextCursor?: string | null;
  cursor?: string | null;
};

export type AdminFormListItem = {
  id: string;
  name: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminFormsListData = {
  items?: AdminFormListItem[];
  forms?: AdminFormListItem[];
};

export type AdminLeadAttachment = {
  id: string;
  type: string; // IMAGE|PDF|OTHER (contract-driven)
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string;
  storageKey?: string | null;
};

export type AdminLeadDetail = {
  id: string;
  formId: string;
  capturedAt: string; // ISO
  isDeleted: boolean;
  deletedAt?: string | null;
  deletedReason?: string | null;
  values: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  attachments?: AdminLeadAttachment[];
};
