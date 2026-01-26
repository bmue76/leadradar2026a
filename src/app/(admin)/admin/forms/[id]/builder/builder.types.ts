export type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "EMAIL"
  | "PHONE"
  | "CHECKBOX"
  | "SINGLE_SELECT"
  | "MULTI_SELECT";

export type BuilderField = {
  id: string;
  tenantId: string;
  formId: string;

  key: string;
  label: string;
  type: FieldType;

  required: boolean;
  isActive: boolean;
  sortOrder: number;

  placeholder: string | null;
  helpText: string | null;

  config: unknown | null;

  createdAt?: string;
  updatedAt?: string;
};

export type BuilderForm = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: string;
  config: unknown | null;
  createdAt?: string;
  updatedAt?: string;
  fields: BuilderField[];
};

export type ApiErrorShape = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiEnvelope<T> =
  | { ok: true; data: T; traceId?: string }
  | { ok: false; error: ApiErrorShape; traceId?: string };

export type DragKind = "library" | "canvas";

export type LibraryDragData = {
  kind: "library";
  fieldType: FieldType;
};

export type CanvasDragData = {
  kind: "canvas";
  fieldId: string;
};

export type DragData = LibraryDragData | CanvasDragData;

export type LibraryItem = {
  type: FieldType;
  title: string;
  hint?: string;
};
