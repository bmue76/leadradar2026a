"use client";

import React from "react";

export function InsertPlaceholder({ label }: { label?: string }) {
  return (
    <div className="my-2">
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
        <div className="text-xs font-semibold text-slate-600">
          {label ?? "Hier einfügen"}
        </div>
      </div>
    </div>
  );
}
