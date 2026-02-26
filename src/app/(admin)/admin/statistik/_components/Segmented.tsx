import * as React from "react";

export type SegItem<T extends string> = { key: T; label: string };

export default function Segmented<T extends string>(props: {
  value: T;
  items: Array<SegItem<T>>;
  onChange: (v: T) => void;
}) {
  const { value, items, onChange } = props;

  return (
    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm transition",
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
