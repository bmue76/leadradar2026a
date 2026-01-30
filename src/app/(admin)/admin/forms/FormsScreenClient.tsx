"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
type SortOption = "UPDATED_DESC" | "UPDATED_ASC" | "NAME_ASC" | "NAME_DESC";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type ActiveEventApi = {
  item: null | {
    id: string;
    name: string;
    status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  };
};

type FormListItem = {
  id: string;
  name: string;
  status: FormStatus;
  updatedAt: string;
  assignedToActiveEvent: boolean;
  assignedEventId: string | null;
};

type FormsListApi = {
  items?: FormListItem[];
  forms?: FormListItem[]; // backward compat
};

type FormDetail = {
  id: string;
  name: string;
  description: string | null;
  status: FormStatus;
  assignedEventId: string | null;
  createdAt: string;
  updatedAt: string;
  fields?: Array<{ id: string }>;
};

type UiError = { message: string; code?: string; traceId?: string };

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(s: FormStatus): string {
  if (s === "ACTIVE") return "Aktiv";
  if (s === "ARCHIVED") return "Archiviert";
  return "Entwurf";
}

function statusPillClasses(s: FormStatus): string {
  if (s === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function Button({
  label,
  kind,
  onClick,
  disabled,
  title,
}: {
  label: string;
  kind: "primary" | "secondary" | "ghost" | "danger";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";
  const primary = "bg-slate-900 text-white hover:bg-slate-800";
  const secondary = "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50";
  const ghost = "text-slate-700 hover:bg-slate-100";
  const danger = "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";

  const cls = `${base} ${
    kind === "primary" ? primary : kind === "secondary" ? secondary : kind === "danger" ? danger : ghost
  } ${disabled ? "opacity-50 pointer-events-none" : ""}`;

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
      {label}
    </button>
  );
}

function IconButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      ↻
    </button>
  );
}

function Select({
  value,
  onChange,
  ariaLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      className="h-9 w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function StatusPills({ value, onChange }: { value: "ALL" | FormStatus; onChange: (v: "ALL" | FormStatus) => void }) {
  const pillBase =
    "inline-flex h-9 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200";

  const pill = (active: boolean) =>
    active
      ? `${pillBase} border-slate-900 bg-slate-900 text-white`
      : `${pillBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={pill(value === "ALL")} onClick={() => onChange("ALL")}>
        Alle
      </button>
      <button type="button" className={pill(value === "DRAFT")} onClick={() => onChange("DRAFT")}>
        Entwurf
      </button>
      <button type="button" className={pill(value === "ACTIVE")} onClick={() => onChange("ACTIVE")}>
        Aktiv
      </button>
      <button type="button" className={pill(value === "ARCHIVED")} onClick={() => onChange("ARCHIVED")}>
        Archiviert
      </button>
    </div>
  );
}

function DrawerShell({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/20" aria-label="Schliessen" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[480px] bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
            onClick={onClose}
          >
            Schliessen
          </button>
        </div>
        <div className="h-[calc(100%-3.5rem)] overflow-auto px-6 py-6">{children}</div>
      </aside>
    </div>
  );
}

export function FormsScreenClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeEvent, setActiveEvent] = useState<ActiveEventApi["item"]>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"ALL" | FormStatus>("ALL");
  const [sortOpt, setSortOpt] = useState<SortOption>("UPDATED_DESC");

  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<UiError | null>(null);
  const [items, setItems] = useState<FormListItem[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<FormDetail | null>(null);
  const [detailError, setDetailError] = useState<UiError | null>(null);

  const autoOpenConsumedRef = useRef(false);

  const activeEventName = activeEvent?.name ?? null;

  const { sort, dir } = useMemo(() => {
    if (sortOpt === "UPDATED_ASC") return { sort: "updatedAt" as const, dir: "asc" as const };
    if (sortOpt === "NAME_ASC") return { sort: "name" as const, dir: "asc" as const };
    if (sortOpt === "NAME_DESC") return { sort: "name" as const, dir: "desc" as const };
    return { sort: "updatedAt" as const, dir: "desc" as const };
  }, [sortOpt]);

  const isDirty = useMemo(() => q.trim() !== "" || status !== "ALL" || sortOpt !== "UPDATED_DESC", [q, status, sortOpt]);

  const countLabel = useMemo(() => {
    const n = items.length;
    return n === 1 ? "1 Formular" : `${n} Formulare`;
  }, [items.length]);

  const buildListUrl = useCallback((): string => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("status", status);
    sp.set("sort", sort);
    sp.set("dir", dir);
    return `/api/admin/v1/forms?${sp.toString()}`;
  }, [q, status, sort, dir]);

  const loadActiveEvent = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/v1/events/active", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<ActiveEventApi>;
      if (json.ok) setActiveEvent(json.data.item);
      else setActiveEvent(null);
    } catch {
      setActiveEvent(null);
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);

    try {
      const res = await fetch(buildListUrl(), { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<FormsListApi>;

      if (!json || typeof json !== "object") {
        setItems([]);
        setListError({ message: "Ungültige Serverantwort." });
        setLoadingList(false);
        return;
      }

      if (!json.ok) {
        setItems([]);
        setListError({
          message: json.error?.message || "Konnte Formulare nicht laden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setLoadingList(false);
        return;
      }

      const list = (json.data.items ?? json.data.forms ?? []) as FormListItem[];
      setItems(Array.isArray(list) ? list : []);
      setLoadingList(false);
    } catch {
      setItems([]);
      setListError({ message: "Konnte Formulare nicht laden. Bitte erneut versuchen." });
      setLoadingList(false);
    }
  }, [buildListUrl]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadActiveEvent(), loadList()]);
  }, [loadActiveEvent, loadList]);

  useEffect(() => {
    const t = setTimeout(() => void refreshAll(), 0);
    return () => clearTimeout(t);
  }, [refreshAll]);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), 220);
    return () => clearTimeout(t);
  }, [q, status, sortOpt, loadList]);

  const openDrawer = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(false);
  }, []);

  // Auto-open from redirect: /admin/forms?open=FORM_ID
  // Lint rule: avoid synchronous setState inside effect -> defer with setTimeout + useRef.
  useEffect(() => {
    if (autoOpenConsumedRef.current) return;
    const openId = searchParams.get("open");
    if (!openId) return;

    autoOpenConsumedRef.current = true;

    const t = setTimeout(() => {
      openDrawer(openId);
    }, 0);

    return () => clearTimeout(t);
  }, [searchParams, openDrawer]);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetail(null);
    setDetailError(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${id}`, { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<FormDetail>;

      if (!json || typeof json !== "object") {
        setDetail(null);
        setDetailError({ message: "Ungültige Serverantwort." });
        setLoadingDetail(false);
        return;
      }

      if (!json.ok) {
        setDetail(null);
        setDetailError({
          message: json.error?.message || "Konnte Formular nicht laden.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        setLoadingDetail(false);
        return;
      }

      const d = json.data;
      setDetail({
        id: String(d.id),
        name: String(d.name),
        description: (d.description ?? null) as string | null,
        status: d.status,
        assignedEventId: (d.assignedEventId ?? null) as string | null,
        createdAt: String(d.createdAt),
        updatedAt: String(d.updatedAt),
        fields: Array.isArray(d.fields) ? d.fields : undefined,
      });
      setLoadingDetail(false);
    } catch {
      setDetail(null);
      setDetailError({ message: "Konnte Formular nicht laden. Bitte erneut versuchen." });
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen || !selectedId) return;
    const t = setTimeout(() => void loadDetail(selectedId), 0);
    return () => clearTimeout(t);
  }, [drawerOpen, selectedId, loadDetail]);

  const patchForm = useCallback(
    async (id: string, body: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await fetch(`/api/admin/v1/forms/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        const json = (await res.json()) as ApiResp<FormDetail>;
        if (!json || typeof json !== "object") return false;

        if (!json.ok) {
          setDetailError({
            message: json.error?.message || "Änderung fehlgeschlagen.",
            code: json.error?.code,
            traceId: json.traceId,
          });
          return false;
        }

        setDetail({
          id: String(json.data.id),
          name: String(json.data.name),
          description: (json.data.description ?? null) as string | null,
          status: json.data.status,
          assignedEventId: (json.data.assignedEventId ?? null) as string | null,
          createdAt: String(json.data.createdAt),
          updatedAt: String(json.data.updatedAt),
          fields: Array.isArray(json.data.fields) ? json.data.fields : undefined,
        });

        setDetailError(null);
        await loadList();
        return true;
      } catch {
        setDetailError({ message: "Änderung fehlgeschlagen. Bitte erneut versuchen." });
        return false;
      }
    },
    [loadList]
  );

  const onToggleAssigned = useCallback(async () => {
    if (!detail) return;
    setDetailError(null);

    const currentlyAssigned = !!detail.assignedEventId && !!activeEvent?.id && detail.assignedEventId === activeEvent.id;
    await patchForm(detail.id, { setAssignedToActiveEvent: !currentlyAssigned });
  }, [detail, activeEvent, patchForm]);

  const onChangeStatus = useCallback(
    async (next: FormStatus) => {
      if (!detail) return;
      setDetailError(null);
      await patchForm(detail.id, { status: next });
    },
    [detail, patchForm]
  );

  const onDuplicate = useCallback(async () => {
    if (!detail) return;
    setDetailError(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${detail.id}/duplicate`, { method: "POST" });
      const json = (await res.json()) as ApiResp<{ id: string }>;

      if (!json || typeof json !== "object") {
        setDetailError({ message: "Ungültige Serverantwort." });
        return;
      }

      if (!json.ok) {
        setDetailError({
          message: json.error?.message || "Duplizieren fehlgeschlagen.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        return;
      }

      await loadList();
      openDrawer(String(json.data.id));
    } catch {
      setDetailError({ message: "Duplizieren fehlgeschlagen. Bitte erneut versuchen." });
    }
  }, [detail, loadList, openDrawer]);

  const onOpenBuilder = useCallback(() => {
    if (!detail) return;
    router.push(`/admin/forms/${detail.id}/builder`);
  }, [detail, router]);

  const onOpenPreview = useCallback(() => {
    if (!detail) return;
    router.push(`/admin/forms/${detail.id}/builder?mode=preview`);
  }, [detail, router]);

  const onCreateNew = useCallback(() => {
    router.push("/admin/templates?intent=create");
  }, [router]);

  const reset = useCallback(() => {
    setQ("");
    setStatus("ALL");
    setSortOpt("UPDATED_DESC");
  }, []);

  const assignedLabelForRow = useCallback(
    (it: FormListItem): string => {
      if (!activeEventName) return "—";
      return it.assignedToActiveEvent ? activeEventName : "—";
    },
    [activeEventName]
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      {/* Toolbar (SumUp-clean) */}
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPills value={status} onChange={setStatus} />

          {isDirty ? (
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
              onClick={reset}
            >
              Zurücksetzen
            </button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input value={q} onChange={setQ} placeholder="Suchen…" />
            <IconButton title="Aktualisieren" onClick={() => void refreshAll()} />
            <Button label="Neues Formular" kind="primary" onClick={onCreateNew} />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-slate-500">{countLabel}</div>

          <div className="hidden md:flex items-center gap-2">
            <div className="text-sm text-slate-500">Sortieren</div>
            <Select value={sortOpt} onChange={(v) => setSortOpt(v as SortOption)} ariaLabel="Sortieren">
              <option value="UPDATED_DESC">Aktualisiert</option>
              <option value="UPDATED_ASC">Aktualisiert (älteste)</option>
              <option value="NAME_ASC">Name (A–Z)</option>
              <option value="NAME_DESC">Name (Z–A)</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-slate-200" />

      {/* Table (no scrollbar) */}
      <div className="w-full overflow-hidden">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-600">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Zuweisung</th>
              <th className="hidden md:table-cell px-5 py-3">Aktualisiert</th>
              <th className="w-12 px-2 py-3" aria-label="Aktionen" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loadingList ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk_${i}`} className="animate-pulse">
                  <td className="px-5 py-4">
                    <div className="h-4 w-3/4 rounded bg-slate-100" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-6 w-24 rounded-full bg-slate-100" />
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-4 w-32 rounded bg-slate-100" />
                  </td>
                  <td className="hidden md:table-cell px-5 py-4">
                    <div className="h-4 w-28 rounded bg-slate-100" />
                  </td>
                  <td className="px-2 py-4">
                    <div className="h-6 w-6 rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : listError ? (
              <tr>
                <td colSpan={5} className="px-5 py-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
                    <div className="mt-1 text-sm text-slate-600">{listError.message}</div>
                    {(listError.code || listError.traceId) ? (
                      <div className="mt-2 text-xs text-slate-500">
                        {listError.code ? `Code: ${listError.code}` : null}
                        {listError.code && listError.traceId ? " • " : null}
                        {listError.traceId ? `Trace: ${listError.traceId}` : null}
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Button label="Erneut versuchen" kind="secondary" onClick={() => void refreshAll()} />
                    </div>
                  </div>
                </td>
              </tr>
            ) : items.length <= 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10">
                  <div className="text-sm font-semibold text-slate-900">Keine Formulare</div>
                  <div className="mt-1 text-sm text-slate-600">Passe Filter an oder erstelle ein neues Formular.</div>
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDrawer(it.id)}>
                  <td className="px-5 py-4">
                    <div className="truncate text-sm font-semibold text-slate-900">{it.name}</div>
                  </td>

                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusPillClasses(
                        it.status
                      )}`}
                    >
                      {statusLabel(it.status)}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <div className="truncate text-sm text-slate-700">{assignedLabelForRow(it)}</div>
                  </td>

                  <td className="hidden md:table-cell px-5 py-4">
                    <div className="truncate text-sm text-slate-700">{fmtDateTime(it.updatedAt)}</div>
                  </td>

                  <td className="px-2 py-4">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      aria-label="Details öffnen"
                      title="Details öffnen"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDrawer(it.id);
                      }}
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="px-5 py-4 text-xs text-slate-500">
          Mobile zeigt nur <span className="font-semibold text-slate-700">ACTIVE</span> + zugewiesen (Option 2).
        </div>
      </div>

      <DrawerShell open={drawerOpen} title={detail?.name ?? "Formular"} onClose={closeDrawer}>
        {loadingDetail ? (
          <div className="space-y-3">
            <div className="h-6 w-2/3 rounded bg-slate-100 animate-pulse" />
            <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-slate-100 animate-pulse" />
            <div className="h-10 w-40 rounded bg-slate-100 animate-pulse" />
          </div>
        ) : !detail ? (
          detailError ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
              <div className="mt-1 text-sm text-slate-600">{detailError.message}</div>
              {(detailError.code || detailError.traceId) ? (
                <div className="mt-2 text-xs text-slate-500">
                  {detailError.code ? `Code: ${detailError.code}` : null}
                  {detailError.code && detailError.traceId ? " • " : null}
                  {detailError.traceId ? `Trace: ${detailError.traceId}` : null}
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  label="Erneut versuchen"
                  kind="secondary"
                  onClick={() => {
                    if (selectedId) void loadDetail(selectedId);
                  }}
                />
                <Button label="Schliessen" kind="ghost" onClick={closeDrawer} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Kein Formular ausgewählt.</div>
          )
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-xs font-semibold text-slate-600">Status</div>
              <div className="mt-2">
                <Select value={detail.status} onChange={(v) => void onChangeStatus(v as FormStatus)} ariaLabel="Status ändern">
                  <option value="DRAFT">Entwurf</option>
                  <option value="ACTIVE">Aktiv</option>
                  <option value="ARCHIVED">Archiviert</option>
                </Select>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Nur <span className="font-semibold text-slate-700">ACTIVE</span> + zugewiesen = in der App sichtbar.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    Im aktiven Event verfügbar{" "}
                    <span className="text-slate-500">({activeEventName ? activeEventName : "kein aktives Event"})</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">Nur ACTIVE + zugewiesen ist in der Mobile App sichtbar (Option 2).</div>
                </div>

                <button
                  type="button"
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                    detail.assignedEventId && activeEvent?.id && detail.assignedEventId === activeEvent.id
                      ? "border-emerald-200 bg-emerald-500"
                      : "border-slate-200 bg-slate-100"
                  } ${!activeEvent?.id || detail.status === "ARCHIVED" ? "opacity-50 pointer-events-none" : ""}`}
                  aria-label="Zuweisung umschalten"
                  title={
                    !activeEvent?.id
                      ? "Kein aktives Event verfügbar."
                      : detail.status === "ARCHIVED"
                        ? "Archivierte Formulare können nicht zugewiesen werden."
                        : "Zuweisung umschalten"
                  }
                  onClick={() => void onToggleAssigned()}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                      detail.assignedEventId && activeEvent?.id && detail.assignedEventId === activeEvent.id
                        ? "translate-x-5"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Aktualisiert: <span className="text-slate-700">{fmtDateTime(detail.updatedAt)}</span> • Erstellt:{" "}
              <span className="text-slate-700">{fmtDateTime(detail.createdAt)}</span>
              {Array.isArray(detail.fields) ? (
                <>
                  {" • "}
                  Felder: <span className="text-slate-700">{detail.fields.length}</span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button label="Im Builder öffnen" kind="primary" onClick={onOpenBuilder} />
              <Button label="Vorschau" kind="secondary" onClick={onOpenPreview} />
              <Button label="Duplizieren" kind="secondary" onClick={() => void onDuplicate()} />

              {detail.status === "ARCHIVED" ? (
                <Button label="Wiederherstellen" kind="secondary" onClick={() => void onChangeStatus("DRAFT")} />
              ) : (
                <Button label="Archivieren" kind="danger" onClick={() => void onChangeStatus("ARCHIVED")} />
              )}
            </div>

            {detailError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-sm font-semibold text-rose-900">Hinweis</div>
                <div className="mt-1 text-sm text-rose-800">{detailError.message}</div>
              </div>
            ) : null}
          </div>
        )}
      </DrawerShell>
    </section>
  );
}
