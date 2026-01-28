// src/app/(admin)/admin/forms/[id]/builder/_components/SaveTemplateModal.tsx
"use client";

import * as React from "react";
import { Button } from "../../../../_ui/Button";

type FetchErr = { ok: false; code: string; message: string; traceId?: string; status?: number };
type FetchOk<T> = { ok: true; data: T; traceId?: string };
export type FetchRes<T> = FetchOk<T> | FetchErr;

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
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-sm">
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

export default function SaveTemplateModal(props: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  onSave: (body: { name: string; category?: string }) => Promise<FetchRes<{ templateId: string }>>;
}) {
  const { open, onClose, defaultName, onSave } = props;

  const [name, setName] = React.useState(defaultName);
  const [category, setCategory] = React.useState("");

  const [busy, setBusy] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = React.useState<string | null>(null);

  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    setName(defaultName);
    setCategory("");
    setBusy(false);
    setErrorMsg(null);
    setErrorTraceId(null);

    window.setTimeout(() => nameRef.current?.focus(), 0);
  }, [open, defaultName]);

  const canSave = name.trim().length > 0 && !busy;

  const onSubmit = React.useCallback(async () => {
    const n = name.trim();
    const c = category.trim();

    if (!n.length) return;

    setBusy(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    const res = await onSave({ name: n, category: c.length ? c : undefined });

    if (!res.ok) {
      setBusy(false);
      setErrorMsg(res.message || "Couldn’t save template.");
      setErrorTraceId(res.traceId || null);
      return;
    }

    setBusy(false);
    onClose();
  }, [name, category, onSave, onClose]);

  return (
    <ModalShell open={open} onClose={onClose} title="Save as template">
      {errorMsg ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <div className="font-semibold">Error</div>
          <div className="mt-1">{errorMsg}</div>
          {errorTraceId ? <div className="mt-1 text-xs opacity-80">Trace: {errorTraceId}</div> : null}
        </div>
      ) : null}

      <div className="space-y-4">
        <div>
          <div className="text-xs font-semibold text-slate-600">Template name</div>
          <input
            ref={nameRef}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Visitor lead (standard)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSubmit();
              }
            }}
          />
          <div className="mt-1 text-[11px] text-slate-500">Tip: keep it generic. You can rename forms after creating.</div>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-600">Category (optional)</div>
          <input
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Visitors / Products / Press"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onSubmit();
              }
            }}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          After saving, the template appears under <span className="font-semibold">Create form → From template</span>.
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void onSubmit()} disabled={!canSave}>
            {busy ? "Saving…" : "Save template"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
