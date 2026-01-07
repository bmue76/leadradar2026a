"use client";

import * as React from "react";
import { adminFetchJson } from "../../../_lib/adminFetch";
import type { ApiResponse, FormDetail, FormField } from "../formDetail.types";
import { sortFieldsStable } from "../_lib/sort";

import FieldsList from "./workspace/FieldsList";
import PreviewPane from "./workspace/PreviewPane";
import InspectorPane, { type DraftState } from "./workspace/InspectorPane";

type InlineError = { message: string; code?: string; traceId?: string } | null;

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getErrMessage(res: unknown): { message: string; code?: string; traceId?: string } {
  if (isRecord(res)) {
    const traceId = typeof res.traceId === "string" ? res.traceId : undefined;

    if (res.ok === false && isRecord(res.error)) {
      const msg = typeof res.error.message === "string" ? res.error.message : "Request failed.";
      const code = typeof res.error.code === "string" ? res.error.code : undefined;
      return { message: msg, code, traceId };
    }

    const msg2 =
      typeof res.message === "string"
        ? res.message
        : typeof res.error === "string"
          ? res.error
          : "Request failed.";
    return { message: msg2, traceId };
  }

  return { message: "Request failed." };
}

async function api<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    return (await adminFetchJson(path, init)) as ApiResponse<T>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error.";
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: msg },
      traceId: "no-trace-id",
    };
  }
}

export default function FormWorkspace({
  formId,
  form,
  setForm,
  refresh,
  showToast,
}: {
  formId: string;
  form: FormDetail;
  setForm: (f: FormDetail) => void;
  refresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const mountedRef = React.useRef(true);

  const [selectedId, setSelectedId] = React.useState<string>("");

  const [saving, setSaving] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState<InlineError>(null);

  const fields = React.useMemo(() => sortFieldsStable(form.fields || []), [form.fields]);
  const selected = React.useMemo(
    () => fields.find((f) => f.id === selectedId) || null,
    [fields, selectedId]
  );

  const [draft, setDraft] = React.useState<DraftState | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    // Ensure selection stays valid after updates
    const exists = selectedId && (form.fields || []).some((f) => f.id === selectedId);
    const next = exists ? selectedId : (form.fields || [])[0]?.id || "";
    setSelectedId(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id, form.fields]);

  React.useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }

    setDraft({
      key: selected.key || "",
      label: selected.label || "",
      type: String(selected.type || "").toUpperCase(),
      required: Boolean(selected.required),
      isActive: Boolean(selected.isActive),
      placeholder: selected.placeholder ?? "",
      helpText: selected.helpText ?? "",
      optionsText: "", // InspectorPane will populate based on config when needed
      checkboxDefault: false,
      config: selected.config ?? null,
    });

    setSaveErr(null);
  }, [selected]);

  async function createField() {
    setSaveErr(null);

    const key = `field_${Date.now()}`;
    const payload = {
      key,
      label: "New field",
      type: "TEXT",
      required: false,
      isActive: true,
      placeholder: null,
      helpText: null,
      config: null,
    };

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr({ message: err.message, code: err.code, traceId: err.traceId });
      return;
    }

    setForm(res.data);

    // Try to select the newly created field by key
    const created = (res.data.fields || []).find((f) => f.key === key);
    setSelectedId(created?.id || (res.data.fields || [])[0]?.id || "");

    showToast("Field created.");
  }

  async function saveField(next: DraftState) {
    if (!selected) return;

    setSaving(true);
    setSaveErr(null);

    const payload: Record<string, unknown> = {
      key: next.key.trim(),
      label: next.label.trim(),
      type: next.type.toUpperCase(),
      required: Boolean(next.required),
      isActive: Boolean(next.isActive),
      placeholder: next.placeholder.trim().length ? next.placeholder.trim() : null,
      helpText: next.helpText.trim().length ? next.helpText.trim() : null,
      config: next.config ?? null,
    };

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}/fields/${selected.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!mountedRef.current) return;

    setSaving(false);

    if (!res.ok) {
      const err = getErrMessage(res);
      setSaveErr({ message: err.message, code: err.code, traceId: err.traceId });
      return;
    }

    setForm(res.data);
    showToast("Saved.");
  }

  const activeFields = React.useMemo(
    () => (fields || []).filter((f) => Boolean(f.isActive)),
    [fields]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr_360px]">
      <FieldsList
        fields={fields}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={() => void createField()}
      />

      <PreviewPane fields={activeFields} />

      <InspectorPane
        field={selected as FormField | null}
        draft={draft}
        setDraft={setDraft}
        saving={saving}
        saveError={saveErr}
        onSave={(d) => void saveField(d)}
        onRefresh={() => void refresh()}
      />
    </div>
  );
}
