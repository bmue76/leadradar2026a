"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type TemplateSource = "SYSTEM" | "TENANT";

type TemplateListItem = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  source: TemplateSource;
  fieldCount: number;
  updatedAt: string;
};

type TemplateListApi = { items: TemplateListItem[] };

type TemplateDetail = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  source: TemplateSource;
  fieldCount: number;
  updatedAt: string;
  fields: Array<{ key: string; label: string; type: string; required: boolean }>;
};

type TemplateDetailApi = { item: TemplateDetail };

type CreateResp = { formId: string; redirect?: string };

type UiError = { message: string; code?: string; traceId?: string };

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("de-CH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function chipBase(active: boolean): string {
  return active
    ? "inline-flex items-center rounded-full border border-slate-900 bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
    : "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700";
}

function sourceLabel(s: TemplateSource): string {
  return s === "SYSTEM" ? "LeadRadar" : "Mandant";
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
      <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl">
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

function ModalShell({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Schliessen" onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-6">
          <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
            onClick={onClose}
          >
            Schliessen
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export function TemplatesScreenClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [source, setSource] = useState<"ALL" | TemplateSource>("ALL");
  const [sort, setSort] = useState<"updatedAt" | "name">("updatedAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<UiError | null>(null);
  const [items, setItems] = useState<TemplateListItem[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [detailErr, setDetailErr] = useState<UiError | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTpl, setCreateTpl] = useState<TemplateListItem | null>(null);
  const [createName, setCreateName] = useState("");
  const [createOpenBuilder, setCreateOpenBuilder] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const intentCreate = searchParams.get("intent") === "create";

  const isDirty = useMemo(
    () => q.trim() !== "" || category !== "ALL" || source !== "ALL" || sort !== "updatedAt" || dir !== "desc",
    [q, category, source, sort, dir]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.category) set.add(it.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de-CH"));
  }, [items]);

  const buildListUrl = useCallback((): string => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("category", category);
    sp.set("source", source);
    sp.set("sort", sort);
    sp.set("dir", dir);
    return `/api/admin/v1/templates?${sp.toString()}`;
  }, [q, category, source, sort, dir]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(buildListUrl(), { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<TemplateListApi>;

      if (!json || typeof json !== "object") {
        setItems([]);
        setErr({ message: "Ungültige Serverantwort." });
        setLoading(false);
        return;
      }

      if (!json.ok) {
        setItems([]);
        setErr({ message: json.error?.message || "Konnte Vorlagen nicht laden.", code: json.error?.code, traceId: json.traceId });
        setLoading(false);
        return;
      }

      const list = Array.isArray(json.data.items) ? json.data.items : [];
      setItems(list);
      setLoading(false);
    } catch {
      setItems([]);
      setErr({ message: "Konnte Vorlagen nicht laden. Bitte erneut versuchen." });
      setLoading(false);
    }
  }, [buildListUrl]);

  const refresh = useCallback(async () => {
    await loadList();
  }, [loadList]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), 240);
    return () => clearTimeout(t);
  }, [q, category, source, sort, dir, loadList]);

  const openPreview = useCallback((id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setDrawerOpen(false);
    setSelectedId(null);
    setDetail(null);
    setDetailErr(null);
    setLoadingDetail(false);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setDetail(null);
    setDetailErr(null);

    try {
      const res = await fetch(`/api/admin/v1/templates/${id}`, { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<TemplateDetailApi>;

      if (!json || typeof json !== "object") {
        setDetail(null);
        setDetailErr({ message: "Ungültige Serverantwort." });
        setLoadingDetail(false);
        return;
      }

      if (!json.ok) {
        setDetail(null);
        setDetailErr({ message: json.error?.message || "Konnte Vorlage nicht laden.", code: json.error?.code, traceId: json.traceId });
        setLoadingDetail(false);
        return;
      }

      setDetail(json.data.item);
      setLoadingDetail(false);
    } catch {
      setDetail(null);
      setDetailErr({ message: "Konnte Vorlage nicht laden. Bitte erneut versuchen." });
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen || !selectedId) return;
    const t = setTimeout(() => void loadDetail(selectedId), 0);
    return () => clearTimeout(t);
  }, [drawerOpen, selectedId, loadDetail]);

  const reset = useCallback(() => {
    setQ("");
    setCategory("ALL");
    setSource("ALL");
    setSort("updatedAt");
    setDir("desc");
  }, []);

  const startCreate = useCallback((tpl: TemplateListItem) => {
    setCreateTpl(tpl);
    setCreateName(tpl.name);
    setCreateOpenBuilder(false);
    setCreateErr(null);
    setCreateBusy(false);
    setCreateOpen(true);
  }, []);

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setCreateTpl(null);
    setCreateErr(null);
    setCreateBusy(false);
  }, []);

  const submitCreate = useCallback(async () => {
    if (!createTpl) return;

    setCreateBusy(true);
    setCreateErr(null);

    try {
      const res = await fetch(`/api/admin/v1/templates/${createTpl.id}/create-form`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: createName.trim() ? createName.trim() : undefined, openBuilder: createOpenBuilder }),
      });

      const json = (await res.json()) as ApiResp<CreateResp>;

      if (!json || typeof json !== "object") {
        setCreateErr("Ungültige Serverantwort.");
        setCreateBusy(false);
        return;
      }

      if (!json.ok) {
        setCreateErr(json.error?.message || "Erstellen fehlgeschlagen.");
        setCreateBusy(false);
        return;
      }

      const redirect = json.data.redirect ?? `/admin/forms?open=${encodeURIComponent(json.data.formId)}`;
      closeCreate();
      router.push(redirect);
    } catch {
      setCreateErr("Erstellen fehlgeschlagen. Bitte erneut versuchen.");
      setCreateBusy(false);
    }
  }, [createTpl, createName, createOpenBuilder, router, closeCreate]);

  const countLabel = useMemo(() => {
    const n = items.length;
    return n === 1 ? "1 Vorlage" : `${n} Vorlagen`;
  }, [items.length]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-slate-900">Vorlagen</div>
            <div className="mt-1 text-sm text-slate-600">
              Starte mit einer Vorlage und passe sie im Builder an.
              {intentCreate ? <span className="ml-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">Create-Flow</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <IconButton title="Aktualisieren" onClick={() => void refresh()} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input value={q} onChange={setQ} placeholder="Suchen…" />

          <Select value={category} onChange={setCategory} ariaLabel="Kategorie">
            <option value="ALL">Alle Kategorien</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select value={source} onChange={(v) => setSource(v as "ALL" | TemplateSource)} ariaLabel="Quelle">
            <option value="ALL">Alle Quellen</option>
            <option value="SYSTEM">LeadRadar</option>
            <option value="TENANT">Mandant</option>
          </Select>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
              <div className="text-sm text-slate-500">Sortieren</div>
              <Select value={`${sort}:${dir}`} onChange={(v) => {
                const [s, d] = v.split(":");
                setSort((s as "updatedAt" | "name") ?? "updatedAt");
                setDir((d as "asc" | "desc") ?? "desc");
              }} ariaLabel="Sortieren">
                <option value="updatedAt:desc">Aktualisiert</option>
                <option value="updatedAt:asc">Aktualisiert (älteste)</option>
                <option value="name:asc">Name (A–Z)</option>
                <option value="name:desc">Name (Z–A)</option>
              </Select>
            </div>

            {isDirty ? (
              <button type="button" className="text-sm font-medium text-slate-500 hover:text-slate-900" onClick={reset}>
                Zurücksetzen
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-slate-500">{countLabel}</div>

          {source === "SYSTEM" ? (
            <div className="text-xs text-slate-500">
              Hinweis: Im aktuellen Schema sind Vorlagen mandantenbasiert (SYSTEM ist nicht vorhanden).
            </div>
          ) : null}
        </div>
      </div>

      <div className="h-px w-full bg-slate-200" />

      <div className="p-5">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`sk_${i}`} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4">
                <div className="h-5 w-2/3 rounded bg-slate-100" />
                <div className="mt-3 flex gap-2">
                  <div className="h-6 w-20 rounded-full bg-slate-100" />
                  <div className="h-6 w-20 rounded-full bg-slate-100" />
                </div>
                <div className="mt-4 h-4 w-full rounded bg-slate-100" />
                <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
                <div className="mt-5 flex gap-2">
                  <div className="h-9 w-28 rounded-xl bg-slate-100" />
                  <div className="h-9 w-24 rounded-xl bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : err ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
            <div className="mt-1 text-sm text-slate-600">{err.message}</div>
            {(err.code || err.traceId) ? (
              <div className="mt-2 text-xs text-slate-500">
                {err.code ? `Code: ${err.code}` : null}
                {err.code && err.traceId ? " • " : null}
                {err.traceId ? `Trace: ${err.traceId}` : null}
              </div>
            ) : null}
            <div className="mt-3">
              <Button label="Erneut versuchen" kind="secondary" onClick={() => void refresh()} />
            </div>
          </div>
        ) : items.length <= 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-sm font-semibold text-slate-900">Keine Vorlagen</div>
            <div className="mt-1 text-sm text-slate-600">Lege Vorlagen im Mandanten an oder passe Filter an.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{it.name}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {it.category ? <span className={chipBase(false)}>{it.category}</span> : <span className={chipBase(false)}>Ohne Kategorie</span>}
                    <span className={chipBase(false)}>{sourceLabel(it.source)}</span>
                  </div>

                  <div className="mt-3 text-sm text-slate-600 line-clamp-2">
                    {it.description ? it.description : "—"}
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    Felder: <span className="font-semibold text-slate-700">{it.fieldCount}</span> •{" "}
                    <span className="text-slate-700">{fmtDateTime(it.updatedAt)}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button label="Verwenden" kind="primary" onClick={() => startCreate(it)} />
                  <Button label="Vorschau" kind="secondary" onClick={() => openPreview(it.id)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DrawerShell open={drawerOpen} title="Vorschau" onClose={closePreview}>
        {loadingDetail ? (
          <div className="space-y-3">
            <div className="h-6 w-2/3 rounded bg-slate-100 animate-pulse" />
            <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
            <div className="h-4 w-5/6 rounded bg-slate-100 animate-pulse" />
          </div>
        ) : !detail ? (
          detailErr ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
              <div className="mt-1 text-sm text-slate-600">{detailErr.message}</div>
              {(detailErr.code || detailErr.traceId) ? (
                <div className="mt-2 text-xs text-slate-500">
                  {detailErr.code ? `Code: ${detailErr.code}` : null}
                  {detailErr.code && detailErr.traceId ? " • " : null}
                  {detailErr.traceId ? `Trace: ${detailErr.traceId}` : null}
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button label="Erneut versuchen" kind="secondary" onClick={() => selectedId ? void loadDetail(selectedId) : undefined} />
                <Button label="Schliessen" kind="ghost" onClick={closePreview} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">Keine Vorlage ausgewählt.</div>
          )
        ) : (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold text-slate-900">{detail.name}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {detail.category ? <span className={chipBase(false)}>{detail.category}</span> : <span className={chipBase(false)}>Ohne Kategorie</span>}
                <span className={chipBase(false)}>{sourceLabel(detail.source)}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Felder: <span className="font-semibold text-slate-700">{detail.fieldCount}</span> •{" "}
                <span className="text-slate-700">{fmtDateTime(detail.updatedAt)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600">Felder</div>
              <div className="divide-y divide-slate-100">
                {detail.fields.length <= 0 ? (
                  <div className="px-4 py-4 text-sm text-slate-600">Keine Felder gefunden.</div>
                ) : (
                  detail.fields.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{f.label}</div>
                        <div className="truncate text-xs text-slate-500">{f.type}</div>
                      </div>
                      {f.required ? <span className={chipBase(true)}>Pflicht</span> : <span className={chipBase(false)}>Optional</span>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                label="Diese Vorlage verwenden"
                kind="primary"
                onClick={() => {
                  const base = items.find((x) => x.id === detail.id) ?? {
                    id: detail.id,
                    name: detail.name,
                    category: detail.category,
                    description: detail.description,
                    source: detail.source,
                    fieldCount: detail.fieldCount,
                    updatedAt: detail.updatedAt,
                  };
                  startCreate(base);
                }}
              />
              <Button label="Schliessen" kind="secondary" onClick={closePreview} />
            </div>
          </div>
        )}
      </DrawerShell>

      <ModalShell open={createOpen} title="Formular aus Vorlage erstellen" onClose={closeCreate}>
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold text-slate-600">Formularname</div>
            <input
              className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              value={createName}
              placeholder="z. B. Besucher Lead (Swissbau)"
              onChange={(e) => setCreateName(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                id="openBuilder"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={createOpenBuilder}
                onChange={(e) => setCreateOpenBuilder(e.target.checked)}
              />
              <label htmlFor="openBuilder" className="text-sm text-slate-700">
                Direkt im Builder öffnen
              </label>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Das neue Formular wird als <span className="font-semibold text-slate-700">Entwurf</span> erstellt (ohne Zuweisung).
            </div>
          </div>

          {createErr ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{createErr}</div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              label={createBusy ? "Erstellen…" : "Erstellen"}
              kind="primary"
              disabled={createBusy}
              onClick={() => void submitCreate()}
            />
            <Button label="Abbrechen" kind="secondary" onClick={closeCreate} />
          </div>
        </div>
      </ModalShell>
    </section>
  );
}
