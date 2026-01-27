"use client";

import * as React from "react";
import { Button } from "../_ui/Button";
import { adminFetchJson } from "../_lib/adminFetch";

type FetchErr = { ok: false; code: string; message: string; traceId?: string; status?: number };
type FetchOk<T> = { ok: true; data: T; traceId?: string };

type TemplateListItem = {
  id: string;
  name: string;
  category: string | null;
  fieldsCount?: number | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type Mode = "blank" | "template";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toNumOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function extractCreatedFormId(dto: unknown): string | null {
  if (!isRecord(dto)) return null;

  const id = toStringOrNull(dto.id);
  if (id) return id;

  const formId = toStringOrNull(dto.formId);
  if (formId) return formId;

  const form = dto.form;
  if (isRecord(form)) {
    const fid = toStringOrNull(form.id);
    if (fid) return fid;
  }

  return null;
}

function normalizeTemplatesPayload(dto: unknown): TemplateListItem[] {
  const arr =
    Array.isArray(dto) ? dto : isRecord(dto) && Array.isArray(dto.items) ? dto.items : isRecord(dto) && Array.isArray(dto.templates) ? dto.templates : null;

  if (!arr) return [];

  const out: TemplateListItem[] = [];
  for (const row of arr) {
    if (!isRecord(row)) continue;
    const id = toStringOrNull(row.id);
    const name = toStringOrNull(row.name);
    if (!id || !name) continue;

    const category = (toStringOrNull(row.category) ?? null) as string | null;

    // accept either `fieldsCount` or Prisma `_count.fields`
    const fieldsCount =
      toNumOrNull(row.fieldsCount) ??
      (isRecord(row._count) ? toNumOrNull(row._count.fields) : null);

    out.push({
      id,
      name,
      category,
      fieldsCount,
      updatedAt: toStringOrNull(row.updatedAt),
      createdAt: toStringOrNull(row.createdAt),
    });
  }
  return out;
}

function ModalShell({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="text-base font-semibold">{title}</div>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-50"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function SegButton(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        "h-9 rounded-lg px-3 text-sm font-semibold",
        props.active ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

export function CreateFormModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated: (formId: string) => void;
}) {
  const { open, onClose, onCreated } = props;

  const [mode, setMode] = React.useState<Mode>("blank");

  // blank form
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");

  // templates
  const [tplLoading, setTplLoading] = React.useState(false);
  const [tplItems, setTplItems] = React.useState<TemplateListItem[]>([]);
  const [tplQ, setTplQ] = React.useState("");
  const [tplCategory, setTplCategory] = React.useState<string>("ALL");
  const [tplSelectedId, setTplSelectedId] = React.useState<string | null>(null);
  const [tplFormName, setTplFormName] = React.useState<string>("");

  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = React.useState<string | null>(null);

  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    setMode("blank");

    setName("");
    setDescription("");

    setTplQ("");
    setTplCategory("ALL");
    setTplSelectedId(null);
    setTplFormName("");

    setTplLoading(false);
    setTplItems([]);

    setBusy(false);
    setErrorMsg(null);
    setErrorTraceId(null);

    window.setTimeout(() => nameRef.current?.focus(), 0);
  }, [open]);

  const fetchTemplates = React.useCallback(async () => {
    setTplLoading(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    const res = await adminFetchJson<unknown>("/api/admin/v1/templates", { method: "GET" });
    if (!res.ok) {
      setTplItems([]);
      setTplLoading(false);
      setErrorMsg(res.message || "Couldn’t load templates.");
      setErrorTraceId(res.traceId || null);
      return;
    }

    setTplItems(normalizeTemplatesPayload(res.data));
    setTplLoading(false);
  }, []);

  // lazy-load templates when switching to template mode
  React.useEffect(() => {
    if (!open) return;
    if (mode !== "template") return;
    if (tplItems.length) return;
    void fetchTemplates();
  }, [open, mode, tplItems.length, fetchTemplates]);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of tplItems) {
      const c = (t.category ?? "").trim();
      if (c) set.add(c);
    }
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [tplItems]);

  const filtered = React.useMemo(() => {
    const q = tplQ.trim().toLowerCase();
    const cat = tplCategory;

    return tplItems
      .filter((t) => {
        if (cat !== "ALL") {
          if ((t.category ?? "").trim() !== cat) return false;
        }
        if (!q) return true;
        const hay = `${t.name} ${t.category ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const au = a.updatedAt ?? a.createdAt ?? "";
        const bu = b.updatedAt ?? b.createdAt ?? "";
        return bu.localeCompare(au);
      });
  }, [tplItems, tplQ, tplCategory]);

  const selected = React.useMemo(() => filtered.find((t) => t.id === tplSelectedId) ?? null, [filtered, tplSelectedId]);

  React.useEffect(() => {
    if (!open) return;
    if (mode !== "template") return;
    if (!selected) return;

    // default suggested form name when selecting template
    setTplFormName((cur) => (cur.trim().length ? cur : selected.name));
  }, [open, mode, selected]);

  const canSubmitBlank = name.trim().length > 0 && !busy;
  const canSubmitTemplate = Boolean(selected) && tplFormName.trim().length > 0 && !busy;

  const submitBlank = React.useCallback(async () => {
    const n = name.trim();
    const d = description.trim();

    if (!n.length) return;

    setBusy(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    const res = await adminFetchJson<unknown>("/api/admin/v1/forms", {
      method: "POST",
      body: JSON.stringify({
        name: n,
        description: d.length ? d : undefined,
      }),
    });

    if (!res.ok) {
      setBusy(false);
      setErrorMsg(res.message || "Couldn’t create form.");
      setErrorTraceId(res.traceId || null);
      return;
    }

    const formId = extractCreatedFormId(res.data);
    if (!formId) {
      setBusy(false);
      setErrorMsg("Unexpected response.");
      setErrorTraceId(res.traceId || null);
      return;
    }

    setBusy(false);
    onClose();
    onCreated(formId);
  }, [name, description, onClose, onCreated]);

  const submitFromTemplate = React.useCallback(async () => {
    if (!selected) return;

    const n = tplFormName.trim();
    if (!n.length) return;

    setBusy(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    const res = await adminFetchJson<unknown>("/api/admin/v1/forms/from-template", {
      method: "POST",
      body: JSON.stringify({
        templateId: selected.id,
        name: n,
      }),
    });

    if (!res.ok) {
      setBusy(false);
      setErrorMsg(res.message || "Couldn’t create form from template.");
      setErrorTraceId(res.traceId || null);
      return;
    }

    const formId = extractCreatedFormId(res.data);
    if (!formId) {
      setBusy(false);
      setErrorMsg("Unexpected response.");
      setErrorTraceId(res.traceId || null);
      return;
    }

    setBusy(false);
    onClose();
    onCreated(formId);
  }, [selected, tplFormName, onClose, onCreated]);

  return (
    <ModalShell open={open} onClose={onClose} title="Create form">
      {errorMsg ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{errorMsg}</div>
          {errorTraceId ? <div className="mt-1 text-xs opacity-80">Trace: {errorTraceId}</div> : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1">
        <SegButton
          active={mode === "blank"}
          onClick={() => {
            setMode("blank");
            window.setTimeout(() => nameRef.current?.focus(), 0);
          }}
        >
          Blank
        </SegButton>
        <SegButton
          active={mode === "template"}
          onClick={() => {
            setMode("template");
          }}
        >
          From template
        </SegButton>
      </div>

      {mode === "blank" ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-600">Form name</div>
            <input
              ref={nameRef}
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Visitor lead"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitBlank();
                }
              }}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600">Description (optional)</div>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Short internal note…"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submitBlank()} disabled={!canSubmitBlank}>
              {busy ? "Creating…" : "Create form"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={tplQ}
                onChange={(e) => setTplQ(e.target.value)}
                placeholder="Search templates…"
              />
              <select
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={tplCategory}
                onChange={(e) => setTplCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "ALL" ? "All" : c}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                <div className="text-xs font-semibold text-slate-600">Templates</div>
                <button
                  type="button"
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  onClick={() => void fetchTemplates()}
                  disabled={tplLoading}
                >
                  {tplLoading ? "Loading…" : "Refresh"}
                </button>
              </div>

              <div className="max-h-[340px] overflow-auto p-2">
                {tplLoading ? (
                  <div className="p-3 text-sm text-slate-500">Loading…</div>
                ) : filtered.length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">No templates found.</div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((t) => {
                      const active = t.id === tplSelectedId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTplSelectedId(t.id)}
                          className={[
                            "w-full rounded-xl border px-3 py-2 text-left",
                            active ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                            <div className="text-xs text-slate-500">{formatDateShort(t.updatedAt ?? t.createdAt)}</div>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600">
                            <div className="truncate">{t.category ? t.category : "—"}</div>
                            <div>{typeof t.fieldsCount === "number" ? `${t.fieldsCount} field(s)` : ""}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-600">Selected template</div>

              {selected ? (
                <>
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">{selected.name}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Category: <span className="font-semibold">{selected.category ?? "—"}</span>
                      {typeof selected.fieldsCount === "number" ? (
                        <>
                          {" "}
                          · Fields: <span className="font-semibold">{selected.fieldsCount}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-semibold text-slate-600">New form name</div>
                    <input
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                      value={tplFormName}
                      onChange={(e) => setTplFormName(e.target.value)}
                      placeholder="e.g. Visitor lead (Swissbau 2026)"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitFromTemplate();
                        }
                      }}
                    />
                    <div className="mt-1 text-[11px] text-slate-500">
                      Tip: templates stay generic — you can rename forms anytime.
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm text-slate-500">Pick a template on the left.</div>
              )}

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <Button variant="ghost" onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void submitFromTemplate()} disabled={!canSubmitTemplate}>
                  {busy ? "Creating…" : "Create from template"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
