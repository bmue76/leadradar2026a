"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
type SortOption = "UPDATED_DESC" | "UPDATED_ASC" | "NAME_ASC" | "NAME_DESC";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

type ActiveEvent = { id: string; name: string };

type ReadinessState = "NO_ACTIVE_EVENT" | "NO_ASSIGNED_FORM" | "ASSIGNED_BUT_INACTIVE" | "READY" | "READY_MULTI";

type Readiness = {
  state: ReadinessState;
  headline: string;
  text: string;
  primary: { label: string; href: string };
  recommendedFormId?: string | null;
  activeAssignedCount?: number;
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
  activeEvents?: ActiveEvent[];
  contextEvent?: ActiveEvent | null;

  // backward compat:
  activeEvent?: ActiveEvent | null;

  readiness?: Readiness;
  items?: FormListItem[];
  forms?: FormListItem[];
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

/* ----------------------------- Presets (tp7.0) ----------------------------- */

type PresetListItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  isPublic: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function normalizePresetItems(input: unknown): PresetListItem[] {
  if (!Array.isArray(input)) return [];

  const out: PresetListItem[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) continue;

    const id = asString(raw.id, "");
    const name = asString(raw.name, "");
    if (!id || !name) continue;

    out.push({
      id,
      name,
      category: asString(raw.category, ""),
      description: asNullableString(raw.description),
      imageUrl: asNullableString(raw.imageUrl),
      isPublic: asBool(raw.isPublic, false),
    });
  }
  return out;
}

/* ----------------------------- UI helpers ----------------------------- */

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
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      className={`h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200 ${
        disabled ? "opacity-50" : ""
      }`}
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
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
      className="h-9 w-[240px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
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

function ReadyCard(props: {
  activeEvents: ActiveEvent[];
  contextEventId: string | null;
  readiness: Readiness | null;
  onPrimary: () => void;
  onOpenTemplates: () => void;
  onOpenEvents: () => void;
  onOpenDevices: () => void;
}) {
  const r = props.readiness;
  const ctx = props.activeEvents.find((e) => e.id === props.contextEventId) ?? null;

  const badge = (() => {
    const base = "inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold";
    if (!r) return `${base} border-slate-200 bg-slate-50 text-slate-700`;
    if (r.state === "READY" || r.state === "READY_MULTI")
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
    if (r.state === "ASSIGNED_BUT_INACTIVE") return `${base} border-amber-200 bg-amber-50 text-amber-900`;
    return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  })();

  const badgeText = (() => {
    if (!r) return "Status";
    if (r.state === "READY") return "Bereit";
    if (r.state === "READY_MULTI") return "Bereit (mehrere)";
    if (r.state === "ASSIGNED_BUT_INACTIVE") return "Fast bereit";
    if (r.state === "NO_ASSIGNED_FORM") return "Aktion nötig";
    if (r.state === "NO_ACTIVE_EVENT") return "Aktion nötig";
    return "Status";
  })();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-slate-900">Bereit für die Messe</div>
            <span className={badge}>{badgeText}</span>
          </div>

          <div className="mt-2 text-lg font-semibold text-slate-900">{r?.headline ?? "Status wird geladen…"}</div>
          <div className="mt-1 text-sm text-slate-600">{r?.text ?? "Bitte kurz warten."}</div>

          <div className="mt-2 text-xs text-slate-500">
            Aktive Events: <span className="font-semibold text-slate-700">{props.activeEvents.length}</span>
            {" • "}
            Kontext: <span className="font-semibold text-slate-700">{ctx ? ctx.name : "—"}</span>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          <Button label={r?.primary?.label ?? "…"} kind="primary" disabled={!r?.primary?.href} onClick={props.onPrimary} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
              onClick={props.onOpenTemplates}
            >
              Vorlagen
            </button>
            <span className="text-xs text-slate-300">•</span>
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
              onClick={props.onOpenEvents}
            >
              Events
            </button>
            <span className="text-xs text-slate-300">•</span>
            <button
              type="button"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
              onClick={props.onOpenDevices}
            >
              Geräte
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------- Create-from-preset Modal ----------------------- */
/**
 * Important for your eslint rule-set:
 * - NO setState directly inside useEffect
 * - Component is mounted only when open => reset happens by unmount/mount
 */
function CreateFromPresetModal(props: {
  onClose: () => void;
  onCreated: (newFormId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; traceId?: string } | null>(null);

  const [items, setItems] = useState<PresetListItem[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>("");

  const selected = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const c = it.category.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "de-CH"));
  }, [items]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((it) => {
      const okCat = category === "ALL" ? true : it.category === category;
      if (!okCat) return false;
      if (!qq) return true;
      const hay = `${it.name} ${it.category} ${it.description ?? ""}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q, category]);

  const loadPresets = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/admin/v1/presets", { method: "GET", cache: "no-store" });
      const json = (await res.json()) as ApiResp<unknown>;

      if (!json || typeof json !== "object") {
        setErr({ message: "Ungültige Serverantwort." });
        setItems([]);
        setLoading(false);
        return;
      }

      if (!json.ok) {
        setErr({ message: json.error?.message || "Konnte Vorlagen nicht laden.", traceId: json.traceId });
        setItems([]);
        setLoading(false);
        return;
      }

      const data = json.data;
      const rawItems = isRecord(data) ? data.items : null;
      const normalized = normalizePresetItems(rawItems);

      setItems(normalized);
      setLoading(false);
    } catch {
      setErr({ message: "Konnte Vorlagen nicht laden. Bitte erneut versuchen." });
      setItems([]);
      setLoading(false);
    }
  }, []);

  // only side effect: load external data (allowed); no direct setState in effect body
  useEffect(() => {
    const t = setTimeout(() => {
      void loadPresets();
    }, 0);
    return () => clearTimeout(t);
  }, [loadPresets]);

  const onSelectPreset = useCallback(
    (it: PresetListItem) => {
      setSelectedId(it.id);
      // default name only if user didn't type yet
      setFormName((cur) => (cur.trim().length ? cur : it.name));
    },
    [setSelectedId, setFormName]
  );

  const createFromPreset = useCallback(async () => {
    if (!selected) return;

    const name = formName.trim();
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/admin/v1/forms/from-preset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presetId: selected.id, name: name.length ? name : undefined }),
      });

      const json = (await res.json()) as ApiResp<unknown>;

      if (!json || typeof json !== "object") {
        setErr({ message: "Ungültige Serverantwort." });
        setBusy(false);
        return;
      }

      if (!json.ok) {
        setErr({ message: json.error?.message || "Erstellen fehlgeschlagen.", traceId: json.traceId });
        setBusy(false);
        return;
      }

      const data = json.data;
      const newId =
        isRecord(data) && isRecord(data.item) ? asString((data.item as Record<string, unknown>).id, "") : "";

      if (!newId) {
        setErr({ message: "Erstellen fehlgeschlagen (keine ID erhalten)." });
        setBusy(false);
        return;
      }

      setBusy(false);
      props.onCreated(newId);
      props.onClose();
    } catch {
      setErr({ message: "Erstellen fehlgeschlagen. Bitte erneut versuchen." });
      setBusy(false);
    }
  }, [formName, props, selected]);

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/25" aria-label="Schliessen" onClick={props.onClose} />

      <div className="absolute left-1/2 top-1/2 w-[min(980px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">Formular aus Vorlage erstellen</div>
              <div className="mt-0.5 text-xs text-slate-500">Wähle eine Vorlage und gib dem Formular einen Namen.</div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={props.onClose}
              disabled={busy}
            >
              Schliessen
            </button>
          </header>

          <div className="grid grid-cols-1 gap-0 md:grid-cols-[380px_1fr]">
            {/* Left: list */}
            <div className="border-b border-slate-200 md:border-b-0 md:border-r md:border-slate-200">
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <Input value={q} onChange={setQ} placeholder="Vorlagen suchen…" />
                  <Select value={category} onChange={setCategory} ariaLabel="Kategorie">
                    <option value="ALL">Alle Kategorien</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  {loading ? "Lade…" : `${filtered.length} Vorlage${filtered.length === 1 ? "" : "n"}`}
                </div>
              </div>

              <div className="max-h-[58vh] overflow-auto px-2 pb-3">
                {loading ? (
                  <div className="space-y-2 px-3 pb-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={`sk_${i}`} className="animate-pulse rounded-2xl border border-slate-200 p-3">
                        <div className="h-4 w-2/3 rounded bg-slate-100" />
                        <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
                      </div>
                    ))}
                  </div>
                ) : err ? (
                  <div className="px-3 pb-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">Konnte nicht laden</div>
                      <div className="mt-1 text-sm text-slate-600">{err.message}</div>
                      {err.traceId ? (
                        <div className="mt-2 text-xs text-slate-500">
                          Trace: <span className="font-mono">{err.traceId}</span>
                        </div>
                      ) : null}
                      <div className="mt-3">
                        <Button label="Erneut versuchen" kind="secondary" onClick={() => void loadPresets()} />
                      </div>
                    </div>
                  </div>
                ) : filtered.length <= 0 ? (
                  <div className="px-3 pb-4 text-sm text-slate-600">Keine Vorlagen gefunden.</div>
                ) : (
                  <div className="space-y-2 px-3 pb-3">
                    {filtered.map((it) => {
                      const active = it.id === selectedId;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className={cx(
                            "w-full rounded-2xl border p-3 text-left transition-colors",
                            active
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                          onClick={() => onSelectPreset(it)}
                        >
                          <div className={cx("truncate text-sm font-semibold", active ? "text-white" : "text-slate-900")}>
                            {it.name}
                          </div>
                          <div className={cx("mt-1 truncate text-xs", active ? "text-slate-200" : "text-slate-500")}>
                            {it.category ? it.category : "—"}
                            {it.isPublic ? " • Public" : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: details */}
            <div className="p-5">
              {!selected ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Wähle links eine Vorlage aus.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">{selected.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Kategorie: <span className="font-semibold text-slate-700">{selected.category || "—"}</span>
                      {selected.isPublic ? (
                        <>
                          {" "}
                          <span className="text-slate-300">•</span>{" "}
                          <span className="font-semibold text-slate-700">Public</span>
                        </>
                      ) : null}
                    </div>
                    {selected.description ? (
                      <div className="mt-3 text-sm text-slate-600">{selected.description}</div>
                    ) : (
                      <div className="mt-3 text-sm text-slate-500">Keine Beschreibung.</div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Formularname</label>
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="z.B. Messekontakt Standard"
                    />
                    <div className="mt-1 text-xs text-slate-500">Du kannst den Namen später jederzeit ändern.</div>
                  </div>

                  {err ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <div className="text-sm font-semibold text-rose-900">Hinweis</div>
                      <div className="mt-1 text-sm text-rose-800">{err.message}</div>
                      {err.traceId ? (
                        <div className="mt-2 text-xs text-rose-800">
                          Trace: <span className="font-mono">{err.traceId}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button label="Abbrechen" kind="secondary" onClick={props.onClose} disabled={busy} />
                    <Button
                      label={busy ? "Erstellen…" : "Formular erstellen"}
                      kind="primary"
                      disabled={busy || !selectedId || formName.trim().length === 0}
                      onClick={() => void createFromPreset()}
                    />
                  </div>

                  <div className="text-xs text-slate-500">
                    Tipp: Nach dem Erstellen kannst du das Formular im Drawer direkt dem Event zuweisen und aktiv schalten.
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* -------------------------------- Screen -------------------------------- */

export function FormsScreenClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

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

  const [createOpen, setCreateOpen] = useState(false);

  const autoOpenConsumedRef = useRef(false);

  const selectedEventId = useMemo(() => {
    const urlEventId = (searchParams.get("eventId") ?? "").trim();
    return urlEventId ? urlEventId : null;
  }, [searchParams]);

  const eventNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ev of activeEvents) m.set(ev.id, ev.name);
    return m;
  }, [activeEvents]);

  const selectedEventName = useMemo(() => {
    if (!selectedEventId) return null;
    return eventNameById.get(selectedEventId) ?? null;
  }, [selectedEventId, eventNameById]);

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

  const syncUrlEventId = useCallback(
    (nextEventId: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextEventId) sp.set("eventId", nextEventId);
      else sp.delete("eventId");
      router.replace(`/admin/forms?${sp.toString()}`);
    },
    [router, searchParams]
  );

  const buildListUrl = useCallback((): string => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("status", status);
    sp.set("sort", sort);
    sp.set("dir", dir);
    if (selectedEventId) sp.set("eventId", selectedEventId);
    return `/api/admin/v1/forms?${sp.toString()}`;
  }, [q, status, sort, dir, selectedEventId]);

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

      const data = json.data;

      const evs = Array.isArray(data.activeEvents) ? data.activeEvents : [];
      setActiveEvents(evs);

      const ctx = (data.contextEvent ?? data.activeEvent ?? null) as ActiveEvent | null;

      if (ctx?.id) {
        const isValid = selectedEventId ? evs.some((e) => e.id === selectedEventId) : false;
        if (!selectedEventId || !isValid) {
          syncUrlEventId(ctx.id);
        }
      } else {
        if (selectedEventId) syncUrlEventId(null);
      }

      setReadiness((data.readiness ?? null) as Readiness | null);

      const list = (data.items ?? data.forms ?? []) as FormListItem[];
      setItems(Array.isArray(list) ? list : []);
      setLoadingList(false);
    } catch {
      setItems([]);
      setListError({ message: "Konnte Formulare nicht laden. Bitte erneut versuchen." });
      setLoadingList(false);
    }
  }, [buildListUrl, selectedEventId, syncUrlEventId]);

  const refreshAll = useCallback(async () => {
    await loadList();
  }, [loadList]);

  useEffect(() => {
    const t = setTimeout(() => void refreshAll(), 0);
    return () => clearTimeout(t);
  }, [refreshAll]);

  useEffect(() => {
    const t = setTimeout(() => void loadList(), 220);
    return () => clearTimeout(t);
  }, [q, status, sortOpt, selectedEventId, loadList]);

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
    if (!selectedEventId) return;
    setDetailError(null);

    const currentlyAssigned = detail.assignedEventId === selectedEventId;
    await patchForm(detail.id, { setAssignedToEventId: currentlyAssigned ? null : selectedEventId });
  }, [detail, selectedEventId, patchForm]);

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
      const json = (await res.json()) as ApiResp<{ item: { id: string } }>;

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

      const newId = String(json.data.item?.id ?? "");
      if (!newId) {
        setDetailError({ message: "Duplizieren fehlgeschlagen (keine ID erhalten)." });
        return;
      }

      await loadList();
      openDrawer(newId);
    } catch {
      setDetailError({ message: "Duplizieren fehlgeschlagen. Bitte erneut versuchen." });
    }
  }, [detail, loadList, openDrawer]);

  const onDelete = useCallback(async () => {
    if (!detail) return;

    const ok = window.confirm('Formular wirklich löschen?\n\nHinweis: Felder werden ebenfalls gelöscht.');
    if (!ok) return;

    setDetailError(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${detail.id}/delete`, { method: "POST" });
      const json = (await res.json()) as ApiResp<{ deleted: boolean }>;

      if (!json || typeof json !== "object") {
        setDetailError({ message: "Ungültige Serverantwort." });
        return;
      }

      if (!json.ok) {
        setDetailError({
          message: json.error?.message || "Löschen fehlgeschlagen.",
          code: json.error?.code,
          traceId: json.traceId,
        });
        return;
      }

      await loadList();
      closeDrawer();
    } catch {
      setDetailError({ message: "Löschen fehlgeschlagen. Bitte erneut versuchen." });
    }
  }, [detail, loadList, closeDrawer]);

  const onOpenBuilder = useCallback(() => {
    if (!detail) return;
    router.push(`/admin/forms/${detail.id}/builder`);
  }, [detail, router]);

  const onOpenPreview = useCallback(() => {
    if (!detail) return;
    const sp = new URLSearchParams();
    sp.set("mode", "preview");
    if (selectedEventId) sp.set("eventId", selectedEventId);
    router.push(`/admin/forms/${detail.id}/builder?${sp.toString()}`);
  }, [detail, router, selectedEventId]);

  const onOpenTemplates = useCallback(() => {
    router.push("/admin/templates?intent=create");
  }, [router]);

  const onOpenEvents = useCallback(() => {
    router.push("/admin/events");
  }, [router]);

  const onOpenDevices = useCallback(() => {
    router.push("/admin/devices");
  }, [router]);

  const reset = useCallback(() => {
    setQ("");
    setStatus("ALL");
    setSortOpt("UPDATED_DESC");
  }, []);

  const assignedLabelForRow = useCallback(
    (it: FormListItem): string => {
      if (!it.assignedEventId) return "—";
      const name = eventNameById.get(it.assignedEventId);
      if (name) return name;
      return "Zugewiesen (inaktiv)";
    },
    [eventNameById]
  );

  return (
    <div className="space-y-4">
      {createOpen ? (
        <CreateFromPresetModal
          onClose={() => setCreateOpen(false)}
          onCreated={(newId) => {
            void (async () => {
              await loadList();
              openDrawer(newId);
            })();
          }}
        />
      ) : null}

      <ReadyCard
        activeEvents={activeEvents}
        contextEventId={selectedEventId}
        readiness={readiness}
        onPrimary={() => {
          const href = readiness?.primary?.href;
          if (href) router.push(href);
        }}
        onOpenTemplates={onOpenTemplates}
        onOpenEvents={onOpenEvents}
        onOpenDevices={onOpenDevices}
      />

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPills value={status} onChange={setStatus} />

            {isDirty ? (
              <button type="button" className="text-sm font-medium text-slate-500 hover:text-slate-900" onClick={reset}>
                Zurücksetzen
              </button>
            ) : null}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button label="Aus Vorlage" kind="secondary" onClick={() => setCreateOpen(true)} />

              <div className="hidden md:flex items-center gap-2">
                <div className="text-sm text-slate-500">Event</div>
                <Select
                  value={selectedEventId ?? ""}
                  onChange={(v) => {
                    const next = v.trim() ? v.trim() : null;
                    syncUrlEventId(next);
                  }}
                  ariaLabel="Event wählen"
                  disabled={activeEvents.length <= 0}
                >
                  <option value="">{activeEvents.length ? "Event wählen…" : "Keine aktiven Events"}</option>
                  {activeEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </Select>
              </div>

              <Input value={q} onChange={setQ} placeholder="Suchen…" />
              <IconButton title="Aktualisieren" onClick={() => void refreshAll()} />
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

          {selectedEventName ? (
            <div className="mt-2 text-xs text-slate-500">
              Kontext-Event: <span className="font-semibold text-slate-700">{selectedEventName}</span>
            </div>
          ) : (
            <div className="mt-2 text-xs text-slate-500">
              Kontext-Event: <span className="font-semibold text-slate-700">—</span>
            </div>
          )}
        </div>

        <div className="h-px w-full bg-slate-200" />

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
                      {listError.code || listError.traceId ? (
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
                    <div className="mt-1 text-sm text-slate-600">
                      Starte mit einer Vorlage oder erstelle ein neues Formular.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button label="Formular vorbereiten" kind="secondary" onClick={() => setCreateOpen(true)} />
                      <Button label="Zu Vorlagen" kind="ghost" onClick={onOpenTemplates} />
                    </div>
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
            In der App sichtbar: <span className="font-semibold text-slate-700">Aktiv</span> + dem{" "}
            <span className="font-semibold text-slate-700">ausgewählten Event</span> zugewiesen.
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
                {detailError.code || detailError.traceId ? (
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
                  In der App sichtbar: <span className="font-semibold text-slate-700">Aktiv</span> + dem ausgewählten Event zugewiesen.
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      Für das ausgewählte Event sichtbar{" "}
                      <span className="text-slate-500">({selectedEventName ? selectedEventName : "kein Event"})</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Wenn das Formular zugewiesen ist, erscheint es (bei Status „Aktiv“) in der App.
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
                      selectedEventId && detail.assignedEventId === selectedEventId
                        ? "border-emerald-200 bg-emerald-500"
                        : "border-slate-200 bg-slate-100"
                    } ${!selectedEventId || detail.status === "ARCHIVED" ? "opacity-50 pointer-events-none" : ""}`}
                    aria-label="Zuweisung umschalten"
                    title={
                      !selectedEventId
                        ? "Kein Event ausgewählt."
                        : detail.status === "ARCHIVED"
                        ? "Archivierte Formulare können nicht zugewiesen werden."
                        : "Zuweisung umschalten"
                    }
                    onClick={() => void onToggleAssigned()}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        selectedEventId && detail.assignedEventId === selectedEventId ? "translate-x-5" : "translate-x-0.5"
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
                <Button label="Formular bearbeiten" kind="primary" onClick={onOpenBuilder} />
                <Button label="Vorschau (wie in der App)" kind="secondary" onClick={onOpenPreview} />
                <Button label="Duplizieren" kind="secondary" onClick={() => void onDuplicate()} />

                {detail.status === "ARCHIVED" ? (
                  <Button label="Wiederherstellen" kind="secondary" onClick={() => void onChangeStatus("DRAFT")} />
                ) : (
                  <Button label="Archivieren" kind="danger" onClick={() => void onChangeStatus("ARCHIVED")} />
                )}

                <Button label="Löschen" kind="danger" onClick={() => void onDelete()} />
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
    </div>
  );
}
