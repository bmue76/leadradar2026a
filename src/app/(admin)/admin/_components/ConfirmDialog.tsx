"use client";

import React, { useEffect, useRef } from "react";

type Tone = "primary" | "danger";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Abbrechen",
  tone = "primary",
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: Tone;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const t = window.setTimeout(() => cancelRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmCls =
    tone === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200"
      : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-200";

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Schliessen" onClick={onCancel} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="p-5">
            <div className="text-base font-semibold text-slate-900">{title}</div>
            {description ? <div className="mt-2 text-sm text-slate-600">{description}</div> : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={[
                "inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-semibold",
                "focus:outline-none focus:ring-2 disabled:opacity-50",
                confirmCls,
              ].join(" ")}
            >
              {busy ? "Bitte warten…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
