"use client";

import React from "react";
import type { AdminFormListItem, AdminLeadListItem } from "./leads.types";

export default function LeadsTable(props: {
  rows: AdminLeadListItem[];
  formsById: Map<string, AdminFormListItem>;
  formatCapturedAt: (iso: string) => string;
  getPreview: (row: AdminLeadListItem) => string;
  onOpen: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const {
    rows,
    formsById,
    formatCapturedAt,
    getPreview,
    onOpen,
    hasMore,
    loadingMore,
    onLoadMore,
  } = props;

  return (
    <div className="rounded-xl border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-black/50">
              <th className="sticky top-0 z-10 border-b bg-white px-4 py-3">Captured</th>
              <th className="sticky top-0 z-10 border-b bg-white px-4 py-3">Form</th>
              <th className="sticky top-0 z-10 border-b bg-white px-4 py-3">Preview</th>
              <th className="sticky top-0 z-10 border-b bg-white px-4 py-3">Status</th>
              <th className="sticky top-0 z-10 border-b bg-white px-4 py-3 text-right">Open</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const formName = formsById.get(row.formId)?.name ?? row.formId;
              const preview = getPreview(row);

              return (
                <tr
                  key={row.id}
                  className="group cursor-pointer border-b last:border-b-0 hover:bg-black/[0.03]"
                  onClick={() => onOpen(row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onOpen(row.id);
                  }}
                >
                  <td className="border-b px-4 py-3 text-sm text-black/80">
                    {formatCapturedAt(row.capturedAt)}
                  </td>

                  <td className="border-b px-4 py-3 text-sm">
                    <div className="max-w-[260px] truncate font-medium text-black/85">
                      {formName}
                    </div>
                    <div className="mt-0.5 text-xs text-black/50">
                      {row.formId}
                    </div>
                  </td>

                  <td className="border-b px-4 py-3 text-sm text-black/70">
                    <div className="max-w-[420px] truncate">{preview}</div>
                  </td>

                  <td className="border-b px-4 py-3 text-sm">
                    {row.isDeleted ? (
                      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800">
                        Deleted
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-black/10 bg-black/5 px-2 py-1 text-xs font-medium text-black/70">
                        Active
                      </span>
                    )}
                  </td>

                  <td className="border-b px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-black/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(row.id);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <div className="text-sm text-black/60">
          {hasMore ? "More leads available." : "End of list."}
        </div>

        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50"
          onClick={onLoadMore}
          disabled={!hasMore || loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      </div>
    </div>
  );
}
