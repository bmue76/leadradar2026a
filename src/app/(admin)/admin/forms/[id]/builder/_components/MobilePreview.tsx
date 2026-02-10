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
          <button key={x.t} type="button" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-left" disabled>
            <div className="text-sm font-semibold text-slate-900">{x.t}</div>
            <div className="text-[11px] text-slate-500">{x.s}</div>
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">Preview: Buttons sind deaktiviert.</div>
    </div>
  );
}

function ZoomButton(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={cx(
        "h-9 w-9 rounded-xl border text-sm font-semibold",
        props.disabled
          ? "border-slate-200 bg-slate-50 text-slate-300"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      )}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

export default function MobilePreview(props: { formId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<BuilderForm | null>(null);
  const [fields, setFields] = useState<BuilderField[]>([]);

  const [screen, setScreen] = useState<FieldSection>("FORM");
  const hasUserSwitched = useRef(false);

  const slotRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const [slotH, setSlotH] = useState<number>(520);

  const ZOOM_MIN = -2;
  const ZOOM_MAX = 2;
  const [zoomLevel, setZoomLevel] = useState<number>(0);

  const BASE_W = 360;
  const BASE_H = 760;

  const computeFit = useCallback(() => {
    const el = slotRef.current;
    if (!el) return;

    const vpH = (window as any).visualViewport?.height ?? window.innerHeight;
    const r = el.getBoundingClientRect();

    const availH = Math.max(360, Math.floor(vpH - r.top - 16));
    const availW = Math.max(0, Math.floor(r.width));

    setSlotH(availH);

    if (!availW || !availH) return;

    const s = Math.min(availW / BASE_W, availH / BASE_H, 1);
    setFitScale(clamp(Number.isFinite(s) ? s : 1, 0.55, 1));
  }, []);

  useLayoutEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem("lr_mobile_preview_zoom") : null;
    const n = raw ? Number(raw) : 0;
    if (Number.isFinite(n)) setZoomLevel(clamp(n, ZOOM_MIN, ZOOM_MAX));

    computeFit();

    let ro: ResizeObserver | null = null;
    const el = slotRef.current;

    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => computeFit());
      ro.observe(el);
    }

    const vv = (window as any).visualViewport as VisualViewport | undefined;
    const onResize = () => computeFit();

    window.addEventListener("resize", onResize);
    vv?.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [computeFit]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("lr_mobile_preview_zoom", String(zoomLevel));
  }, [zoomLevel]);

  const zoomFactor = 1 + zoomLevel * 0.1;
  const scale = clamp(fitScale * zoomFactor, 0.55, 1.15);

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

      const payload = json.data as any as BuilderGetPayload;
      setForm(payload.form);
      setFields(Array.isArray(payload.fields) ? payload.fields : []);

      if (!hasUserSwitched.current) {
        setScreen(getStartScreenFromForm(payload.form));
      }

      setLoading(false);
      requestAnimationFrame(() => computeFit());
    } catch {
      setError("Konnte Preview nicht laden.");
      setLoading(false);
    }
  }, [props.formId, computeFit]);

  useEffect(() => {
    void load();
  }, [load]);

  const formFields = useMemo(
    () => fields.filter((f) => sectionOfField(f) === "FORM").sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );
  const contactFields = useMemo(
    () => fields.filter((f) => sectionOfField(f) === "CONTACT").sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  const activeList = screen === "FORM" ? formFields : contactFields;

  const title = form?.name ?? "Mobile Preview";
  const primaryCta = screen === "FORM" ? "Kontakt erfassen" : "Lead speichern";
  const secondaryCta = screen === "FORM" ? "Überspringen" : "Zurück";

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-2/3 rounded bg-slate-100 animate-pulse" />
        <div className="h-96 rounded-2xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
        <div className="text-sm font-semibold text-rose-900">Preview nicht verfügbar</div>
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px] lg:items-start">
      {/* Left */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xl font-semibold text-slate-900">App Vorschau</div>
            <div className="mt-1 truncate text-sm text-slate-500">{title}</div>
          </div>

          <a
            href={`/admin/forms/${props.formId}/builder`}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            title="Zurück zum Formbuilder"
          >
            ← Zurück
          </a>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <PhoneIcon />
            Mobile Preview
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cx(
                "rounded-full border px-3 py-2 text-sm font-semibold",
                screen === "FORM"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
              onClick={() => {
                hasUserSwitched.current = true;
                setScreen("FORM");
                requestAnimationFrame(() => computeFit());
              }}
            >
              Screen 1: Formular
            </button>

            <button
              type="button"
              className={cx(
                "rounded-full border px-3 py-2 text-sm font-semibold",
                screen === "CONTACT"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
              onClick={() => {
                hasUserSwitched.current = true;
                setScreen("CONTACT");
                requestAnimationFrame(() => computeFit());
              }}
            >
              Screen 2: Kontakt
            </button>

            <button
              type="button"
              className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => void load()}
              title="Daten neu laden"
            >
              Neu laden
            </button>
          </div>

          {/* Zoom */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">Zoom</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Auto-Fit passt den Screen an. Zoom ist eine manuelle Stufe oben drauf.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ZoomButton
                  onClick={() => setZoomLevel((z) => clamp(z - 1, ZOOM_MIN, ZOOM_MAX))}
                  disabled={zoomLevel <= ZOOM_MIN}
                  title="Zoom –"
                >
                  –
                </ZoomButton>
                <button
                  type="button"
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setZoomLevel(0)}
                  disabled={zoomLevel === 0}
                  title="Reset"
                >
                  Reset
                </button>
                <ZoomButton
                  onClick={() => setZoomLevel((z) => clamp(z + 1, ZOOM_MIN, ZOOM_MAX))}
                  disabled={zoomLevel >= ZOOM_MAX}
                  title="Zoom +"
                >
                  +
                </ZoomButton>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span>Auto-Fit: {Math.round(fitScale * 100)}%</span>
              <span className="text-slate-300">•</span>
              <span>Zoom: {zoomLevel === 0 ? "0%" : `${zoomLevel > 0 ? "+" : ""}${zoomLevel * 10}%`}</span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-slate-700">Effektiv: {Math.round(scale * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="lg:sticky lg:top-6">
        <div className="mx-auto w-full max-w-[420px]">
          <div ref={slotRef} className="overflow-auto" style={{ height: `${slotH}px` }}>
            <div className="flex items-start justify-center">
              <div style={{ width: BASE_W * scale, height: BASE_H * scale }}>
                <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }} className="will-change-transform">
                  <div className="w-[360px] h-[760px] rounded-[28px] border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col">
                    <div className="h-12 border-b border-slate-200 bg-white px-4 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-700 truncate">{title}</div>
                      <div className="text-[11px] text-slate-500">{screen === "FORM" ? "Formular" : "Kontakt"}</div>
                    </div>

                    <div className="flex-1 bg-slate-50 overflow-auto p-4 pb-6 space-y-3">
                      {screen === "CONTACT" ? <CaptureModesCard /> : null}

                      {activeList.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
                          Keine Felder auf diesem Screen.
                        </div>
                      ) : null}

                      {activeList.map((f) => (
                        <FieldPreviewRow key={f.id} field={f} />
                      ))}
                    </div>

                    <div className="border-t border-slate-200 bg-white p-4">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                          onClick={() => {
                            hasUserSwitched.current = true;
                            setScreen(screen === "FORM" ? "FORM" : "FORM");
                          }}
                        >
                          {secondaryCta}
                        </button>

                        <button
                          type="button"
                          className="h-11 rounded-xl border border-slate-900 bg-slate-900 text-sm font-semibold text-white"
                          onClick={() => {
                            hasUserSwitched.current = true;
                            setScreen(screen === "FORM" ? "CONTACT" : "FORM");
                          }}
                        >
                          {primaryCta}
                        </button>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500">Preview: Navigation simuliert (kein Speichern).</div>
                    </div>
                  </div>
                  {/* /PHONE */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
