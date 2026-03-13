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
  eventId?: string | null; // optional for list views / filters
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

export type AdminLeadFormRef = {
  id: string;
  name: string;
};

export type AdminLeadAttachment = {
  id: string;
  type: string; // BUSINESS_CARD_IMAGE|IMAGE|PDF|OTHER|... (contract-driven, keep open-ended)
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string | null;
  storageKey?: string | null;
};

export type AdminLeadContact = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneRaw?: string | null;
  mobile?: string | null;
  source?: string | null;
  updatedAt?: string | null;
};

export type AdminLeadDetail = {
  id: string;
  formId: string;
  eventId?: string | null;

  capturedAt: string; // ISO
  createdAt?: string | null; // API currently mirrors capturedAt
  updatedAt?: string | null; // API currently mirrors capturedAt

  isDeleted: boolean;
  deletedAt?: string | null;
  deletedReason?: string | null;
  deletedByUserId?: string | null;

  values: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;

  reviewedAt?: string | null;
  reviewStatus?: "NEW" | "REVIEWED" | string;
  adminNotes?: string | null;
  sourceDeviceName?: string | null;
  hasCardAttachment?: boolean;

  form?: AdminLeadFormRef | null;
  contact?: AdminLeadContact | null;
  attachments?: AdminLeadAttachment[];

  // compatibility for older / mixed UI usage
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactMobile?: string | null;
  contactCompany?: string | null;
  contactTitle?: string | null;
  contactWebsite?: string | null;
  contactStreet?: string | null;
  contactZip?: string | null;
  contactCity?: string | null;
  contactCountry?: string | null;
  contactSource?: string | null;
  contactUpdatedAt?: string | null;
  contactOcrResultId?: string | null;
};
