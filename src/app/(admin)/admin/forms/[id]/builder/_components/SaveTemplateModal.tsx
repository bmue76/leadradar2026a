"use client";

import React, { useEffect, useState } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function SaveTemplateModal({
  open,
  onClose,
  defaultName,
  onSave,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  onSave: (name: string, category?: string | null) => Promise<{ ok: boolean }>;
  busy?: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setCategory("");
    }
  }, [open, defaultName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(640px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-xl">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="text-base font-semibold text-slate-900">Als Vorlage speichern</div>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              Schliessen
            </button>
          </header>

          <div className="p-5">
            <div className="grid gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Vorlagenname</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Messekontakt Standard"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Kategorie (optional)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="z.B. Messe / Vertrieb"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={onClose}
                >
                  Abbrechen
                </button>
                <button
                  className={cx(
                    "rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800",
                    busy && "opacity-60"
                  )}
                  disabled={busy || name.trim().length === 0}
                  onClick={async () => {
                    const res = await onSave(name.trim(), category.trim() ? category.trim() : null);
                    if (res.ok) onClose();
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
