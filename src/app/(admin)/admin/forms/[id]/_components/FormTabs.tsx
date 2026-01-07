"use client";

import * as React from "react";

export type TabKey = "builder" | "overview";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "builder", label: "Builder" },
  { key: "overview", label: "Overview" },
];

export default function FormTabs({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border bg-white p-1">
      {TABS.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm",
              active ? "bg-black text-white" : "text-gray-700 hover:bg-gray-50",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
