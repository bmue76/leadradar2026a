import type { FieldType } from "@prisma/client";
import { adminFetchJson } from "@/app/(admin)/admin/_lib/adminFetch";
import type { FormDto, FormFieldDto } from "./_components/builder.types";

export async function loadForm(formId: string) {
  return adminFetchJson<FormDto>(`/api/admin/v1/forms/${formId}`, { method: "GET" });
}

export type CreateFieldInput = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  placeholder?: string | null;
  helpText?: string | null;
  config?: unknown;
};

export async function createField(formId: string, input: CreateFieldInput) {
  return adminFetchJson<FormFieldDto>(`/api/admin/v1/forms/${formId}/fields`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type PatchFieldInput = Partial<{
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  isActive: boolean;
  placeholder: string | null;
  helpText: string | null;
  config: unknown;
}>;

export async function patchField(formId: string, fieldId: string, patch: PatchFieldInput) {
  return adminFetchJson<FormFieldDto>(`/api/admin/v1/forms/${formId}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteField(formId: string, fieldId: string) {
  return adminFetchJson<{ ok: true }>(`/api/admin/v1/forms/${formId}/fields/${fieldId}`, { method: "DELETE" });
}

export async function reorderFields(formId: string, orderedIds: string[]) {
  return adminFetchJson<{ formId: string; updated: number; orderedIds: string[] }>(
    `/api/admin/v1/forms/${formId}/fields/reorder`,
    { method: "POST", body: JSON.stringify({ orderedIds }) }
  );
}
