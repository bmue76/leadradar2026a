"use client";

import * as React from "react";
import { createPortal } from "react-dom";

export type DialogTone = "default" | "danger";
export type DialogMode = "confirm" | "alert";

export type DialogState = {
  open: boolean;
  mode: DialogMode;
  tone?: DialogTone;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

type Props = DialogState & {
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  mode,
  tone = "default",
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [mounted, setMounted] = React.useState(false);
  const confirmRef = React.useRef<HTMLButtonElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (mode === "confirm") cancelRef.current?.focus();
      else confirmRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, mode]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      // Enter nur bei Alert automatisch bestätigen, bei Confirm nicht "zufällig" bestätigen
      if (e.key === "Enter" && mode === "alert") {
        e.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, mode, onCancel, onConfirm]);

  if (!mounted || !open) return null;

  const okLabel = confirmLabel || (mode === "alert" ? "OK" : "Bestätigen");
  const noLabel = cancelLabel || "Abbrechen";

  const confirmBtn =
    tone === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200"
      : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-200";

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lr-dialog-title"
          className="w-full max-w-[520px] rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <div id="lr-dialog-title" className="text-sm font-semibold text-slate-900">
                {title}
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
              aria-label="Schliessen"
              title="Schliessen"
            >
              ✕
            </button>
          </div>

          <div className="p-5">
            <div className="text-sm text-slate-700">{message}</div>

            <div className="mt-6 flex items-center justify-end gap-2">
              {mode === "confirm" ? (
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={onCancel}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                  {noLabel}
                </button>
              ) : null}

              <button
                ref={confirmRef}
                type="button"
                onClick={onConfirm}
                className={`h-9 rounded-xl px-4 text-sm font-semibold focus:outline-none focus:ring-2 ${confirmBtn}`}
              >
                {okLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
