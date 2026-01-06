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
    <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-black/45">
            <tr>
              <th className="px-4 py-2 font-medium">Captured</th>
              <th className="px-4 py-2 font-medium">Form</th>
              <th className="px-4 py-2 font-medium">Preview</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right"> </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const formName = formsById.get(row.formId)?.name ?? row.formId;
              const preview = getPreview(row);

              return (
                <tr
                  key={row.id}
                  className="group cursor-pointer hover:bg-black/[0.02]"
                  onClick={() => onOpen(row.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(row.id);
                    }
                  }}
                >
                  <td className="px-4 py-3 text-black/80">{formatCapturedAt(row.capturedAt)}</td>

                  <td className="px-4 py-3">
                    <div className="max-w-[260px] truncate font-medium text-black/85">{formName}</div>
                    <div className="mt-0.5 text-xs text-black/45">{row.formId}</div>
                  </td>

                  <td className="px-4 py-3 text-black/70">
                    <div className="max-w-[420px] truncate">{preview}</div>
                  </td>

                  <td className="px-4 py-3">
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

                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-medium hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black/10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
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

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm text-black/55">{hasMore ? "More leads available." : "End of list."}</div>

        <button
          type="button"
          className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.02] focus:outline-none focus:ring-2 focus:ring-black/10 disabled:opacity-50"
          onClick={onLoadMore}
          disabled={!hasMore || loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      </div>
    </div>
  );
}
