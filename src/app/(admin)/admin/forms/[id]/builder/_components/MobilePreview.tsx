"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BuilderField, BuilderForm, BuilderGetPayload, FieldSection } from "../builder.types";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };
type ApiResp<T> = ApiOk<T> | ApiErr;

function cx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeJsonParse<T>(txt: string): T | null {
  try {
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function sectionOfField(f: BuilderField): FieldSection {
  return (f.config?.section ?? "FORM") as FieldSection;
}

function variantOfField(f: BuilderField): string | undefined {
  const v = (f.config as any)?.variant;
  return typeof v === "string" ? v : undefined;
}

function getOptions(f: BuilderField): string[] {
  const raw = (f.config as any)?.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x).trim()).filter(Boolean);
}

function getStartScreenFromForm(form: BuilderForm): FieldSection {
  const cfg = form?.config;
  if (isRecord(cfg)) {
    const cs = (cfg as any).captureStart;
    if (cs === "CONTACT_FIRST") return "CONTACT";
    if (cs === "FORM_FIRST") return "FORM";

    const legacy = (cfg as any).startScreen;
    if (legacy === "CONTACT") return "CONTACT";
  }
  return "FORM";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17 1H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2Zm0 18H7V5h10v14Z"
      />
    </svg>
  );
}

function Chip(props: { children: React.ReactNode; selected?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        props.selected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
      )}
    >
      {props.children}
    </span>
  );
}

function FieldPreviewRow({ field }: { field: BuilderField }) {
  const type = String((field as any).type ?? "");
  const variant = variantOfField(field);

  const label = field.label || "Feld";
  const required = !!field.required;

  const common = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold text-slate-900">{label}</div>
          {required ? <span className="text-[11px] font-semibold text-rose-600">Pflicht</span> : null}
        </div>
        {field.helpText ? <div className="mt-1 text-xs text-slate-500">{field.helpText}</div> : null}
      </div>
    </div>
  );

  if (variant === "rating") {
    const max = Number((field.config as any)?.ratingMax ?? 5) || 5;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {common}
        <div className="mt-2 flex items-center gap-1 text-lg text-slate-300">
          {Array.from({ length: Math.max(3, Math.min(10, max)) }).map((_, i) => (
            <span key={i}>★</span>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "attachment") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {common}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            disabled
          >
            Foto aufnehmen
          </button>
          <button
            type="button"
            className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            disabled
          >
            Datei wählen
          </button>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">Preview zeigt UI – Upload passiert in der App.</div>
      </div>
    );
  }

  if (variant === "audio") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {common}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            disabled
          >
            Aufnehmen
          </button>
          <button
            type="button"
            className="h-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            disabled
          >
            Datei wählen
          </button>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">Preview zeigt UI – Recording passiert in der App.</div>
      </div>
    );
  }

  if (variant === "date" || variant === "datetime") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {common}
        <div className="mt-2">
          <input
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            placeholder={variant === "datetime" ? "TT.MM.JJJJ  —  HH:MM" : "TT.MM.JJJJ"}
            disabled
          />
        </div>
      </div>
    );
  }

  if (type === "CHECKBOX") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4" disabled />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {label} {required ? <span className="text-[11px] font-semibold text-rose-600">Pflicht</span> : null}
            </div>
            {field.helpText ? <div className="mt-1 text-xs text-slate-500">{field.helpText}</div> : null}
          </div>
        </label>
      </div>
    );
  }

  if (type === "SINGLE_SELECT" || type === "MULTI_SELECT") {
    const opts = getOptions(field);
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {common}
        <div className="mt-3 flex flex-wrap gap-2">
          {(opts.length ? opts : ["Option 1"]).slice(0, 6).map((o) => (
            <Chip key={o}>{o}</Chip>
          ))}
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          {type === "MULTI_SELECT" ? "Mehrfachauswahl" : "Einzelauswahl"} (Preview)
        </div>
      </div>
    );
  }

  const placeholder = field.placeholder ?? "";
  const isTextarea = type === "TEXTAREA";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      {common}
      <div className="mt-2">
        {isTextarea ? (
          <textarea
            className="min-h-[92px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={placeholder || "…"}
            disabled
          />
        ) : (
          <input
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            placeholder={placeholder || "…"}
            disabled
          />
        )}
      </div>
    </div>
  );
}

function CaptureModesCard() {
  const items = [
    { t: "Visitenkarte", s: "Scan / OCR" },
    { t: "QR-Code", s: "Schnellimport" },
    { t: "Kontakte", s: "Adressbuch" },
    { t: "Manuell", s: "Direkteingabe" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-700">Kontakt erfassen via</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {items.map((x) => (
          <button
            key={x.t}
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left"
            disabled
          >
            <div className="text-sm font-semibold text-slate-900">{x.t}</div>
            <div className="text-[11px] text-slate-500">{x.s}</div>
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">Preview: Buttons sind deaktiviert.</div>
    </div>
  );
}

/* --------------------------------- component --------------------------------- */

const PHONE_W = 372;
const PHONE_H = 780;

function readScaleFromStorage(): number {
  try {
    const raw = localStorage.getItem("lr_mobilePreview:scale");
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 1;
    return clamp(n, 0.55, 1.3);
  } catch {
    return 1;
  }
}

export default function MobilePreview(props: { formId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<BuilderForm | null>(null);
  const [fields, setFields] = useState<BuilderField[]>([]);

  const userTouchedScreenRef = useRef(false);
  const [screen, setScreen] = useState<FieldSection>("FORM");

  // Zoom / fit
  const [scale, setScale] = useState<number>(() => readScaleFromStorage());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const fitScale = useMemo(() => {
    if (!viewport.w || !viewport.h) return 1;
    const pad = 36;
    const s = Math.min((viewport.w - pad) / PHONE_W, (viewport.h - pad) / PHONE_H);
    return clamp(s, 0.55, 1.25);
  }, [viewport]);

  useEffect(() => {
    try {
      localStorage.setItem("lr_mobilePreview:scale", String(scale));
    } catch {
      // ignore
    }
  }, [scale]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setViewport({ w: r.width, h: r.height });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doFit = useCallback(() => {
    setScale(fitScale);
  }, [fitScale]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/v1/forms/${props.formId}/builder`, { method: "GET", cache: "no-store" });
      const txt = await res.text();
      const json = safeJsonParse<ApiResp<BuilderGetPayload>>(txt);

      if (!json || typeof json !== "object") {
        setError("Ungültige Serverantwort (non-JSON).");
        setLoading(false);
        return;
      }
      if (!json.ok) {
        setError(json.error?.message || "Formular nicht gefunden.");
        setLoading(false);
        return;
      }

      const inForm = (json.data as any).form as BuilderForm;
      const inFields = Array.isArray((json.data as any).fields) ? ((json.data as any).fields as BuilderField[]) : [];

      // Normalize section: avoid mixing screens
      const contactKeys = new Set([
        "firstName",
        "lastName",
        "company",
        "title", // Funktion
        "email",
        "phone",
        "address",
        "zip",
        "city",
        "country",
        "website",
      ]);

      const normalized = inFields.map((f) => {
        const cfg = (f.config ?? {}) as any;
        const sec = cfg.section === "CONTACT" || cfg.section === "FORM" ? cfg.section : undefined;
        const fixed = contactKeys.has(f.key) ? "CONTACT" : "FORM";
        return { ...f, config: { ...(isRecord(cfg) ? cfg : {}), section: (sec ?? fixed) as FieldSection } };
      });

      setForm(inForm);
      setFields(normalized.sort((a, b) => a.sortOrder - b.sortOrder));

      if (!userTouchedScreenRef.current) {
        setScreen(getStartScreenFromForm(inForm));
      }

      setLoading(false);
    } catch {
      setError("Konnte Vorschau nicht laden.");
      setLoading(false);
    }
  }, [props.formId]);

  useEffect(() => {
    userTouchedScreenRef.current = false;
    void load();
  }, [load]);

  const activeFields = useMemo(() => fields.filter((f) => Boolean(f.isActive)), [fields]);

  const formFields = useMemo(
    () => activeFields.filter((f) => sectionOfField(f) === "FORM").sort((a, b) => a.sortOrder - b.sortOrder),
    [activeFields]
  );
  const contactFields = useMemo(
    () => activeFields.filter((f) => sectionOfField(f) === "CONTACT").sort((a, b) => a.sortOrder - b.sortOrder),
    [activeFields]
  );

  const startScreen = form ? getStartScreenFromForm(form) : "FORM";

  const switchScreen = useCallback((s: FieldSection) => {
    userTouchedScreenRef.current = true;
    setScreen(s);
  }, []);

  // Ctrl + Wheel zoom on the outer preview area
  const onWheelZoom = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.06 : 0.06;
    setScale((cur) => clamp(cur + delta, 0.55, 1.3));
  }, []);

  // ✅ Robust wheel handling:
  // - If wheel happens inside the scrollable content, let the browser do native scrolling.
  // - Else (header/edges), forward wheel to the content manually.
  // - Ctrl+Wheel inside the phone also zooms (and does not scroll).
  useEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return;

    const handler = (e: WheelEvent) => {
      const content = contentRef.current;
      if (!content) return;

      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.06 : 0.06;
        setScale((cur) => clamp(cur + delta, 0.55, 1.3));
        return;
      }

      const t = e.target as Node | null;

      // If the wheel happened over the real scroll container, allow native scroll
      if (t && content.contains(t)) return;

      // Otherwise: forward wheel to the content
      e.preventDefault();
      e.stopPropagation();
      content.scrollTop += e.deltaY;
    };

    phone.addEventListener("wheel", handler, { passive: false });
    return () => phone.removeEventListener("wheel", handler);
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-3 h-10 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-[540px] w-full animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <div className="text-sm font-semibold text-rose-900">Vorschau nicht verfügbar</div>
        <div className="mt-1 text-sm text-rose-800">{error ?? "Unbekannter Fehler."}</div>
        <div className="mt-3">
          <button
            type="button"
            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            onClick={() => void load()}
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <PhoneIcon />
            Mobile Preview
          </span>
          <span className="text-xs font-medium text-slate-500">Start: {startScreen === "CONTACT" ? "Kontakt" : "Formular"}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              className={cx("px-3 py-2 text-sm font-semibold", screen === "FORM" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50")}
              onClick={() => switchScreen("FORM")}
            >
              Screen 1: Formular
            </button>
            <button
              type="button"
              className={cx("px-3 py-2 text-sm font-semibold", screen === "CONTACT" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50")}
              onClick={() => switchScreen("CONTACT")}
            >
              Screen 2: Kontakt
            </button>
          </div>

          <span className="mx-1 hidden h-7 w-px bg-slate-200 md:inline-block" />

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setScale((s) => clamp(s - 0.1, 0.55, 1.3))}
            title="Zoom out"
          >
            −
          </button>

          <input
            type="range"
            min={55}
            max={130}
            value={Math.round(scale * 100)}
            onChange={(e) => setScale(clamp(Number(e.target.value) / 100, 0.55, 1.3))}
            className="w-40 accent-slate-900"
            title="Zoom"
          />

          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setScale((s) => clamp(s + 0.1, 0.55, 1.3))}
            title="Zoom in"
          >
            +
          </button>

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            {Math.round(scale * 100)}%
          </div>

          <button
            type="button"
            className="rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={doFit}
            title="Auf verfügbaren Platz einpassen"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Preview Canvas */}
      <div ref={wrapRef} className="relative h-[74vh] w-full overflow-auto bg-slate-50 p-6" onWheel={onWheelZoom}>
        <div className="flex w-full justify-center">
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
            {/* Phone frame */}
            <div
              ref={phoneRef}
              className="relative overflow-hidden rounded-[46px] border border-slate-900/10 bg-white shadow-2xl"
              style={{ width: PHONE_W, height: PHONE_H }}
            >
              <div className="pointer-events-none absolute left-1/2 top-3 h-6 w-28 -translate-x-1/2 rounded-full bg-slate-900/10" />
              <div className="pointer-events-none absolute inset-0 rounded-[46px] ring-1 ring-black/5" />

              <div className="flex h-full flex-col px-5 pb-5 pt-12">
                {/* App header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{form.name || "Formular"}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">Vorschau • {screen === "FORM" ? "Formular" : "Kontakt"}</div>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {screen === "FORM" ? "1/2" : "2/2"}
                  </span>
                </div>

                {/* Body */}
                <div ref={contentRef} className="mt-4 flex-1 space-y-3 overflow-auto overscroll-contain pr-1">
                  {screen === "CONTACT" ? (
                    <>
                      <CaptureModesCard />
                      {contactFields.length ? (
                        contactFields.map((f) => <FieldPreviewRow key={f.id} field={f} />)
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                          Keine Kontaktfelder definiert.
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {form.description ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{form.description}</div>
                      ) : null}

                      {formFields.length ? (
                        formFields.map((f) => <FieldPreviewRow key={f.id} field={f} />)
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Noch keine Formularfelder.</div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer CTA */}
                <div className="mt-4">
                  <button
                    type="button"
                    className="h-11 w-full rounded-2xl border border-slate-900 bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={() => switchScreen(screen === "FORM" ? "CONTACT" : "FORM")}
                  >
                    {screen === "FORM" ? "Kontakt erfassen" : "Formular erfassen"}
                  </button>
                  <div className="mt-2 text-center text-[11px] text-slate-500">Tipp: Ctrl + Mausrad zoomt (Desktop).</div>
                </div>
              </div>
            </div>
            {/* /Phone */}
          </div>
        </div>
      </div>
    </section>
  );
}
