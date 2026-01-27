"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { TemplateSummary } from "@/lib/templates/shared";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

function isApiOk<T>(v: ApiResp<T>): v is ApiOk<T> {
  return (v as { ok?: unknown }).ok === true;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<ApiResp<T>> {
  const res = await fetch(input, init);
  return (await res.json()) as ApiResp<T>;
}

export function FormsActionsClient() {
  const router = useRouter();

  const [templates, setTemplates] = React.useState<TemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>("");

  const [loading, setLoading] = React.useState<boolean>(false);
  const [creating, setCreating] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadTemplates = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const r = await fetchJson<TemplateSummary[]>("/api/admin/v1/templates", { method: "GET" });
      if (!isApiOk(r)) {
        setError(r.error.message || "Could not load templates.");
        setTemplates([]);
        return;
      }
      setTemplates(r.data);
    } catch {
      setError("Could not load templates.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const onCreateFromTemplate = React.useCallback(async () => {
    if (!selectedTemplateId) return;

    setCreating(true);
    setError(null);

    try {
      const r = await fetchJson<{ formId: string }>("/api/admin/v1/forms/from-template", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });

      if (!isApiOk(r)) {
        setError(r.error.message || "Could not create form from template.");
        return;
      }

      router.push(`/admin/forms/${r.data.formId}/builder`);
    } catch {
      setError("Could not create form from template.");
    } finally {
      setCreating(false);
    }
  }, [router, selectedTemplateId]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        onClick={() => void loadTemplates()}
        disabled={loading}
        title="Reload templates"
      >
        {loading ? "Loading templates…" : "Reload templates"}
      </button>

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
          value={selectedTemplateId}
          onChange={(e) => setSelectedTemplateId(e.target.value)}
          aria-label="Template"
        >
          <option value="">Choose template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.category ? ` · ${t.category}` : ""}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          onClick={() => void onCreateFromTemplate()}
          disabled={!selectedTemplateId || creating}
          title="Create form from selected template"
        >
          {creating ? "Creating…" : "Create from template"}
        </button>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}

export default FormsActionsClient;
