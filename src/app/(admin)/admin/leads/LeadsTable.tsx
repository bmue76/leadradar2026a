"use client";

import React from "react";
import type { AdminFormListItem, AdminLeadListItem } from "./leads.types";
import { Button } from "../_ui/Button";
import { Chip } from "../_ui/Chip";
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableHeadRow, TableRow } from "../_ui/Table";

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
    <div className="lr-page" style={{ gap: "var(--lr-space-s)" }}>
      <Table ariaLabel="Leads" minWidth={820}>
        <TableHead>
          <TableHeadRow>
            <TableHeadCell>Captured</TableHeadCell>
            <TableHeadCell>Form</TableHeadCell>
            <TableHeadCell>Preview</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
            <TableHeadCell align="right"></TableHeadCell>
          </TableHeadRow>
        </TableHead>

        <TableBody>
          {rows.map((row) => {
            const formName = formsById.get(row.formId)?.name ?? row.formId;
            const preview = getPreview(row);

            return (
              <TableRow
                key={row.id}
                interactive
                role="button"
                tabIndex={0}
                onClick={() => onOpen(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(row.id);
                  }
                }}
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(row.id);
                    }}
                  >
                    Open
                  </Button>
                }
              >
                <TableCell>
                  <span className="lr-secondaryText">{formatCapturedAt(row.capturedAt)}</span>
                </TableCell>

                <TableCell>
                  <div style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {formName}
                  </div>
                  <div className="lr-meta" style={{ marginTop: 4 }}>
                    {row.formId}
                  </div>
                </TableCell>

                <TableCell>
                  <div style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span className="lr-secondaryText">{preview}</span>
                  </div>
                </TableCell>

                <TableCell>
                  {row.isDeleted ? <Chip tone="muted">Deleted</Chip> : <Chip tone="subtle">Active</Chip>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="lr-toolbar">
        <div className="lr-meta">{hasMore ? "More leads available." : "End of list."}</div>
        <Button type="button" variant="secondary" onClick={onLoadMore} disabled={!hasMore || loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      </div>
    </div>
  );
}
