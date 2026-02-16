"use client";

import Link from "next/link";
import * as React from "react";

import FormTabs, { type TabKey } from "./_components/FormTabs";
import FormWorkspace from "./_components/FormWorkspace";
import { useFormDetail } from "./_lib/useFormDetail";
import type { FormStatus } from "./formDetail.types";

function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("de-CH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function FormDetailClient({ formId, initialTab }: { formId: string; initialTab: TabKey }) {
  const [tab, setTab] = React.useState<TabKey>(initialTab);

  const {
    loading,
    loadErr,
    form,
    refresh,

    toast,
    dismissToast,
    runToastAction,

    statusBusy,
    setStatus,

    fieldsOrdered,
    selectedId,
    setSelectedId,

    showInactive,
    setShowInactive,

    draft,
    setDraftPatch,

    saveState,
    saveErr,
    saveTraceId,

    createField,
    duplicateField,
    deleteField,

    patchFieldFlags,
    reorderVisible,
  } = useFormDetail(formId);

  const statuses: FormStatus[] = React.useMemo(() => ["DRAFT", "ACTIVE", "ARCHIVED"], []);

  React.useEffect(() => setTab(initialTab), [initialTab]);

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/forms" className="text-sm text-gray-600 hover:text-gray-900">
          ← Formulare
        </Link>

        {toast ? (
          <div className="flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
            <div>{toast.message}</div>
            {toast.actionLabel && toast.actionId ? (
              <button
                type="button"
                onClick={() => {
                  const id = toast.actionId;
                  if (id) void runToastAction(id);
                }}
                className="rounded-full border px-2 py-0.5 text-xs hover:bg-gray-50"
              >
                {toast.actionLabel}
              </button>
            ) : (
              <button type="button" onClick={dismissToast} className="rounded-full border px-2 py-0.5 text-xs hover:bg-gray-50">
                Schliessen
              </button>
            )}
          </div>
        ) : (
          <div />
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-9 w-2/3 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-5 w-1/3 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : loadErr ? (
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-lg font-semibold">Formular konnte nicht geladen werden</div>
          <div className="mt-2 text-sm text-gray-600">{loadErr.message}</div>
          <div className="mt-2 text-xs text-gray-500">
            {loadErr.code ? `Code: ${loadErr.code} · ` : null}
            {loadErr.traceId ? `Support-Code: ${loadErr.traceId}` : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void refresh()} className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-black/90">
              Erneut versuchen
            </button>
            <Link href="/admin/forms" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
              Zurück zur Liste
            </Link>
          </div>
        </div>
      ) : form ? (
        <>
          <div className="rounded-2xl border bg-white p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-2xl font-semibold text-gray-900">{form.name}</div>
                {form.description ? (
                  <div className="mt-1 text-sm text-gray-600">{form.description}</div>
                ) : (
                  <div className="mt-1 text-sm text-gray-400">Keine Beschreibung.</div>
                )}

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  <div>Erstellt: {formatDateTime(form.createdAt)}</div>
                  <div>Aktualisiert: {formatDateTime(form.updatedAt)}</div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3">
                <FormTabs value={tab} onChange={setTab} />

                <div className="flex items-center gap-2">
                  <div className="text-sm text-gray-500">Status</div>
                  <select
                    value={form.status}
                    onChange={(e) => void setStatus(e.target.value as FormStatus)}
                    disabled={statusBusy}
                    className="rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-50"
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="button" onClick={() => void refresh()} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50" disabled={loading}>
                  Aktualisieren
                </button>
              </div>
            </div>
          </div>

          {tab === "overview" ? (
            <div className="rounded-2xl border bg-white p-6">
              <div className="text-lg font-semibold">Übersicht</div>
              <div className="mt-2 text-sm text-gray-600">
                Der Builder ist der Primär-Workflow. (Overview kann später für Settings/Meta/Assignments ausgebaut werden.)
              </div>
            </div>
          ) : (
            <FormWorkspace
              form={form}
              fields={fieldsOrdered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showInactive={showInactive}
              onToggleShowInactive={setShowInactive}
              draft={draft}
              onDraftPatch={setDraftPatch}
              saveState={saveState}
              saveErr={saveErr}
              saveTraceId={saveTraceId}
              onAddField={createField}
              onDuplicateField={duplicateField}
              onDeleteField={deleteField}
              onPatchFieldFlags={patchFieldFlags}
              onReorderVisible={reorderVisible}
              statusBusy={statusBusy}
              onSetStatus={setStatus}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
