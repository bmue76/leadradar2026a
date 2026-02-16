"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TemplateSource = "SYSTEM" | "TENANT";
type SourceFilter = "ALL" | "SYSTEM" | "TENANT";
type SortKey = "updatedAt" | "name";
type SortDir = "asc" | "desc";

type TemplateItem = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  source: TemplateSource;
  fieldCount: number;
  updatedAt: string; // ISO
};

type ListResp = { items: TemplateItem[] };

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toIsoDateShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("de-CH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function normalizeLegacySort(rawSort: string | null): { sort: SortKey; dir: SortDir } {
  const s = (rawSort ?? "").trim();
  if (!s) return { sort: "updatedAt", dir: "desc" };

  const parts = s.split("_");
  if (parts.length === 2) {
    const [k, d] = parts;
    const dir: SortDir = d === "asc" ? "asc" : "desc";
    if (k === "name") return { sort: "name", dir };
    if (k === "updated" || k === "updatedAt") return { sort: "updatedAt", dir };
  }

  if (s === "name") return { sort: "name", dir: "asc" };
  if (s === "updatedAt") return { sort: "updatedAt", dir: "desc" };

  return { sort: "updatedAt", dir: "desc" };
}

function pickSource(raw: string | null): SourceFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "SYSTEM") return "SYSTEM";
  if (v === "TENANT") return "TENANT";
  return "ALL";
}

function pickSortKey(raw: string | null): SortKey {
  const v = (raw ?? "").trim();
  if (v === "name") return "name";
  return "updatedAt";
}

function pickDir(raw: string | null): SortDir {
  const v = (raw ?? "").trim();
  return v === "asc" ? "asc" : "desc";
}

function extractFormId(dto: unknown): string | null {
  if (!isRecord(dto)) return null;

  const direct = dto.formId;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const id = dto.id;
  if (typeof id === "string" && id.trim()) return id.trim();

  const data = dto.data;
  if (isRecord(data)) {
    const fid = data.formId;
    if (typeof fid === "string" && fid.trim()) return fid.trim();
    const fid2 = data.id;
    if (typeof fid2 === "string" && fid2.trim()) return fid2.trim();
    const form = data.form;
    if (isRecord(form)) {
      const fid3 = form.id;
      if (typeof fid3 === "string" && fid3.trim()) return fid3.trim();
    }
  }
  return null;
}

function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Schliessen" onClick={props.onCancel} />
      <div className="absolute left-1/2 top-1/2 w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="text-sm font-semibold text-slate-900">{props.title}</div>
            {props.description ? <div className="mt-1 text-sm text-slate-600">{props.description}</div> : null}
          </div>
          <div className="flex items-center justify-end gap-2 px-6 py-4">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={props.onCancel}
              disabled={props.busy}
            >
              Abbrechen
            </button>
            <button
              type="button"
              className={cx(
                "rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-60",
                props.danger
                  ? "border-rose-200 bg-rose-600 text-white hover:bg-rose-700"
                  : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
              )}
              onClick={props.onConfirm}
              disabled={props.busy}
            >
              {props.confirmLabel ?? "Bestätigen"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourcePill(props: { source: TemplateSource }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        props.source === "SYSTEM" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
      )}
      title={props.source === "SYSTEM" ? "Systemvorlage" : "Eigene Vorlage"}
    >
      {props.source === "SYSTEM" ? "System" : "Eigen"}
    </span>
  );
}

function CreateFromTemplateModal(props: {
  template: TemplateItem;
  busy?: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const t = props.template;

  // lint-clean: initialize once on mount; modal is unmounted on close
  const [name, setName] = useState<string>(() => `${t.name} (Kopie)`);

  return (
    <div className="fixed inset-0 z-[82]">
      <button type="button" className="absolute inset-0 bg-black/25" aria-label="Schliessen" onClick={props.onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(640px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900">Formular erstellen</div>
              <div className="mt-0.5 truncate text-xs text-slate-500">
                Vorlage: <span className="font-semibold text-slate-700">{t.name}</span> · Kategorie:{" "}
                <span className="font-semibold text-slate-700">{t.category ?? "—"}</span> · Quelle:{" "}
                <span className="font-semibold text-slate-700">{t.source === "SYSTEM" ? "System" : "Eigen"}</span>
              </div>
            </div>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              onClick={props.onClose}
              disabled={props.busy}
            >
              Schliessen
            </button>
          </header>

          <div className="p-5">
            <div className="grid gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Formularname</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Messekontakt Swissbau 2026"
                />
                <div className="mt-1 text-xs text-slate-500">Wird als DRAFT erstellt und im Builder geöffnet.</div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  onClick={props.onClose}
                  disabled={props.busy}
                >
                  Abbrechen
                </button>
                <button
                  className={cx(
                    "rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800",
                    props.busy && "opacity-60"
                  )}
                  disabled={props.busy || name.trim().length === 0}
                  onClick={() => props.onCreate(name.trim())}
                >
                  {props.busy ? "Erstellen…" : "Erstellen"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function TemplatesScreenClient() {
  const router = useRouter();
  const sp = useSearchParams();

  // for stable deps
  const spKey = sp.toString();
  const sourceParam = sp.get("source");
  const sortParam = sp.get("sort");
  const dirParam = sp.get("dir");

  // --- URL state (robust defaults) ---
  const q = (sp.get("q") ?? "").trim();

  const categoryRaw = (sp.get("category") ?? "").trim();
  const category = categoryRaw && categoryRaw !== "ALL" ? categoryRaw : "";

  const source: SourceFilter = pickSource(sourceParam);

  const legacy = normalizeLegacySort(sortParam);
  const sort: SortKey = dirParam ? pickSortKey(sortParam) : legacy.sort;
  const dir: SortDir = dirParam ? pickDir(dirParam) : legacy.dir;

  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<null | { kind: "error" | "success"; message: string }>(null);

  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; name: string }>(null);
  const [createModal, setCreateModal] = useState<null | TemplateItem>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const c = (it.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());

      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }

      if (next.get("sort")?.includes("_")) {
        const n = normalizeLegacySort(next.get("sort"));
        next.set("sort", n.sort);
        next.set("dir", n.dir);
      } else {
        if (!next.get("sort")) next.set("sort", "updatedAt");
        if (!next.get("dir")) next.set("dir", "desc");
      }

      if (!next.get("source")) next.set("source", "ALL");

      const qs = next.toString();
      router.push(qs ? `/admin/templates?${qs}` : "/admin/templates");
    },
    [router, sp]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const qp = new URLSearchParams();
      if (q) qp.set("q", q);
      if (category) qp.set("category", category);
      if (source) qp.set("source", source);
      qp.set("sort", sort);
      qp.set("dir", dir);
      qp.set("take", "50");

      const res = await fetch(`/api/admin/v1/templates?${qp.toString()}`, { method: "GET", cache: "no-store" });
      const txt = await res.text();
      const json = JSON.parse(txt) as ApiResp<ListResp>;

      if (!json || typeof json !== "object") {
        setError("Ungültige Serverantwort (non-JSON).");
        setLoading(false);
        return;
      }
      if (!json.ok) {
        setError(json.error?.message || "Konnte Vorlagen nicht laden.");
        setLoading(false);
        return;
      }

      setItems(Array.isArray(json.data.items) ? json.data.items : []);
      setLoading(false);
    } catch {
      setError("Konnte Vorlagen nicht laden.");
      setLoading(false);
    }
  }, [q, category, source, sort, dir]);

  useEffect(() => {
    if (!sourceParam || sortParam?.includes("_") || !dirParam) {
      setParam({
        source: sourceParam ? sourceParam : "ALL",
        sort: sortParam,
        dir: dirParam,
      });
      return;
    }
    void load();
  }, [spKey, sourceParam, sortParam, dirParam, load, setParam]);

  const onCreateFromTemplate = useCallback(
    async (templateId: string, name: string) => {
      setBusy(true);
      setToast(null);

      try {
        const res = await fetch(`/api/admin/v1/templates/${templateId}/create-form`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });

        const txt = await res.text();
        const json = JSON.parse(txt) as ApiResp<unknown>;

        if (!json || typeof json !== "object") {
          setToast({ kind: "error", message: "Ungültige Serverantwort (non-JSON)." });
          setBusy(false);
          return;
        }
        if (!json.ok) {
          setToast({ kind: "error", message: json.error?.message || "Konnte Formular nicht erstellen." });
          setBusy(false);
          return;
        }

        const formId = extractFormId(json);
        if (!formId) {
          setToast({ kind: "error", message: "Serverantwort ohne formId." });
          setBusy(false);
          return;
        }

        setToast({ kind: "success", message: "Formular erstellt." });
        setCreateModal(null);
        router.push(`/admin/forms/${formId}/builder`);
      } catch {
        setToast({ kind: "error", message: "Konnte Formular nicht erstellen." });
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const doDelete = useCallback(async () => {
    if (!confirmDelete) return;

    setBusy(true);
    setToast(null);

    try {
      const res = await fetch(`/api/admin/v1/templates/${confirmDelete.id}`, { method: "DELETE" });
      const txt = await res.text();
      const json = JSON.parse(txt) as ApiResp<{ deleted: boolean }>;

      if (!json || typeof json !== "object") {
        setToast({ kind: "error", message: "Ungültige Serverantwort (non-JSON)." });
        setBusy(false);
        return;
      }
      if (!json.ok) {
        setToast({ kind: "error", message: json.error?.message || "Konnte Vorlage nicht löschen." });
        setBusy(false);
        return;
      }

      setToast({ kind: "success", message: "Vorlage gelöscht." });
      setConfirmDelete(null);
      await load();
    } catch {
      setToast({ kind: "error", message: "Konnte Vorlage nicht löschen." });
    } finally {
      setBusy(false);
    }
  }, [confirmDelete, load]);

  return (
    <>
      {createModal ? (
        <CreateFromTemplateModal
          key={createModal.id}
          template={createModal}
          busy={busy}
          onClose={() => setCreateModal(null)}
          onCreate={(name) => void onCreateFromTemplate(createModal.id, name)}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Vorlage löschen?"
        description={confirmDelete ? `„${confirmDelete.name}“ wird gelöscht. Bereits erstellte Formulare bleiben unverändert.` : undefined}
        confirmLabel="Löschen"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void doDelete()}
      />

      {toast ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className={cx("text-sm font-semibold", toast.kind === "error" ? "text-rose-900" : "text-emerald-900")}>
            {toast.kind === "error" ? "Fehler" : "OK"}
          </div>
          <div className={cx("mt-1 text-sm", toast.kind === "error" ? "text-rose-800" : "text-emerald-800")}>{toast.message}</div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="h-9 w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 text-sm"
              placeholder="Suchen (Name)…"
              value={q}
              onChange={(e) => setParam({ q: e.target.value.trim() ? e.target.value : "" })}
            />

            <select className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={source} onChange={(e) => setParam({ source: e.target.value })} title="Quelle">
              <option value="ALL">Alle</option>
              <option value="TENANT">Eigene</option>
              <option value="SYSTEM">System</option>
            </select>

            <select
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={category ? category : "ALL"}
              onChange={(e) => setParam({ category: e.target.value === "ALL" ? "" : e.target.value })}
              title="Kategorie"
            >
              <option value="ALL">Alle Kategorien</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm" value={sort} onChange={(e) => setParam({ sort: e.target.value })} title="Sortierung">
              <option value="updatedAt">Zuletzt geändert</option>
              <option value="name">Name</option>
            </select>

            <button
              type="button"
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setParam({ dir: dir === "asc" ? "desc" : "asc" })}
              title="Richtung"
            >
              {dir === "asc" ? "↑" : "↓"}
            </button>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => void load()}
                disabled={loading || busy}
              >
                Aktualisieren
              </button>
              <Link className="h-9 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800" href="/admin/forms">
                Zu Formularen
              </Link>
            </div>
          </div>
        </div>

        <div className="h-px w-full bg-slate-200" />

        {loading ? (
          <div className="p-6">
            <div className="h-5 w-52 animate-pulse rounded bg-slate-100" />
            <div className="mt-3 h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-10 w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-10 w-full animate-pulse rounded bg-slate-100" />
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <div className="text-sm font-semibold text-rose-900">Konnte Vorlagen nicht laden</div>
              <div className="mt-1 text-sm text-rose-800">{error}</div>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="text-sm font-semibold text-slate-900">Noch keine Vorlagen</div>
              <div className="mt-1 text-sm text-slate-600">
                Öffne ein Formular im Builder und nutze <span className="font-semibold">„Als Vorlage speichern“</span>.
              </div>
              <div className="mt-3">
                <Link className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800" href="/admin/forms">
                  Formulare öffnen
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <table className="w-full table-auto">
              <thead className="text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-2">Name</th>
                  <th className="py-2">Kategorie</th>
                  <th className="py-2">Quelle</th>
                  <th className="py-2">Felder</th>
                  <th className="py-2">Aktualisiert</th>
                  <th className="py-2 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3">
                      <div className="text-sm font-semibold text-slate-900">{it.name}</div>
                      {it.description ? <div className="mt-0.5 text-xs text-slate-500">{it.description}</div> : null}
                    </td>
                    <td className="py-3 text-sm text-slate-700">{it.category ?? "—"}</td>
                    <td className="py-3 text-sm text-slate-700">
                      <SourcePill source={it.source} />
                    </td>
                    <td className="py-3 text-sm text-slate-700">{String(it.fieldCount ?? 0)}</td>
                    <td className="py-3 text-sm text-slate-700">{toIsoDateShort(it.updatedAt)}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => setCreateModal(it)}
                        >
                          Verwenden
                        </button>

                        {it.source === "TENANT" ? (
                          <button
                            type="button"
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            disabled={busy}
                            onClick={() => setConfirmDelete({ id: it.id, name: it.name })}
                            title="Nur eigene Vorlagen sind löschbar."
                          >
                            Löschen
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
