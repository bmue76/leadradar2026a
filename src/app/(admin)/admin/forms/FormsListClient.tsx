"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { adminFetchJson } from "../_lib/adminFetch";
import type { FormListItem, FormStatus } from "./forms.types";
import { formatFormStatus, formatUpdatedAt, normalizeFormsListPayload } from "./forms.types";
import { CreateFormModal } from "./CreateFormModal";
import { Button, ButtonLink } from "../_ui/Button";
import { Chip } from "../_ui/Chip";
import { EmptyState } from "../_ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeadCell, TableHeadRow, TableRow } from "../_ui/Table";

type StatusFilter = "ALL" | FormStatus;

function buildQuery(q: string, status: StatusFilter): string {
  const p = new URLSearchParams();
  if (q.trim().length) p.set("q", q.trim());
  if (status !== "ALL") p.set("status", status);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function IconDocument() {
  return (
    <svg viewBox="0 0 24 24" width="44" height="44" fill="none" aria-hidden="true">
      <path
        d="M8 7.5h6.5M8 11h8M8 14.5h8M7.5 3.5h6.7c.4 0 .8.2 1.1.5l3.2 3.2c.3.3.5.7.5 1.1V20c0 .8-.7 1.5-1.5 1.5H7.5C6.7 21.5 6 20.8 6 20V5c0-.8.7-1.5 1.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function statusTone(status: FormStatus): "neutral" | "subtle" | "muted" {
  if (status === "ARCHIVED") return "muted";
  return "subtle";
}

export function FormsListClient() {
  const router = useRouter();

  const [q, setQ] = React.useState("");
  const [qDebounced, setQDebounced] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("ALL");

  const [items, setItems] = React.useState<FormListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);

  const reqSeq = React.useRef(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  const fetchForms = React.useCallback(async () => {
    const seq = ++reqSeq.current;

    setLoading(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    const res = await adminFetchJson<unknown>(`/api/admin/v1/forms${buildQuery(qDebounced, status)}`, {
      method: "GET",
    });

    if (seq !== reqSeq.current) return;

    if (!res.ok) {
      setItems([]);
      setErrorMsg(res.message || "Couldn’t load forms.");
      setErrorTraceId(res.traceId || null);
      setLoading(false);
      return;
    }

    const normalized = normalizeFormsListPayload(res.data);
    setItems(normalized);
    setLoading(false);
  }, [qDebounced, status]);

  React.useEffect(() => {
    void fetchForms();
  }, [fetchForms]);

  const retry = React.useCallback(() => {
    void fetchForms();
  }, [fetchForms]);

  const onCreated = React.useCallback(
    (formId: string, opts?: { openBuilder?: boolean }) => {
      setFlash("Form created.");
      void fetchForms();
      window.setTimeout(() => setFlash(null), 2200);

      if (opts?.openBuilder) router.push(`/admin/forms/${formId}/builder`);
      else router.push(`/admin/forms/${formId}`);
    },
    [fetchForms, router]
  );

  const clearFilters = React.useCallback(() => {
    setQ("");
    setQDebounced("");
    setStatus("ALL");
  }, []);

  const openRow = React.useCallback(
    (id: string) => {
      router.push(`/admin/forms/${id}`);
    },
    [router]
  );

  const hasFilters = q.trim().length > 0 || status !== "ALL";
  const countText = loading ? "Loading…" : `${items.length} form${items.length === 1 ? "" : "s"}`;

  return (
    <div className="lr-page">
      <div className="lr-pageHeader">
        <div className="lr-toolbar">
          <div>
            <h1 className="lr-h1">Forms</h1>
            <p className="lr-muted">Manage forms for lead capture.</p>
          </div>

          <div className="lr-toolbarRight">
            <div className="lr-count">{countText}</div>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create form
            </Button>
          </div>
        </div>

        <div className="lr-toolbar">
          <div className="lr-toolbarLeft">
            <label htmlFor="forms-search" className="sr-only">
              Search forms
            </label>
            <input
              id="forms-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="lr-input"
            />

            <label htmlFor="forms-status" className="sr-only">
              Status filter
            </label>
            <select
              id="forms-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="lr-select"
            >
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>

            {hasFilters ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </div>

          <div className="lr-toolbarRight">
            <Button variant="ghost" onClick={retry} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {flash ? (
          <div className="lr-flash" role="status" aria-live="polite">
            {flash}
          </div>
        ) : null}

        <div className="lr-divider" />
      </div>

      {loading ? (
        <div className="lr-muted">Loading…</div>
      ) : errorMsg ? (
        <EmptyState
          icon={<IconDocument />}
          title="Couldn’t load forms."
          hint={errorMsg}
          meta={
            errorTraceId ? (
              <>
                Trace: <span className="lr-mono">{errorTraceId}</span>
              </>
            ) : null
          }
          cta={
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconDocument />}
          title="No forms yet."
          hint="Create a form to get started."
          cta={
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              Create form
            </Button>
          }
        />
      ) : (
        <Table ariaLabel="Forms">
          <TableHead>
            <TableHeadRow>
              <TableHeadCell>Name</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell>Updated</TableHeadCell>
              <TableHeadCell align="right"></TableHeadCell>
            </TableHeadRow>
          </TableHead>

          <TableBody>
            {items.map((f) => (
              <TableRow
                key={f.id}
                interactive
                tabIndex={0}
                onClick={() => openRow(f.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openRow(f.id);
                  }
                }}
                actions={
                  <ButtonLink
                    href={`/admin/forms/${f.id}`}
                    onClick={(e) => e.stopPropagation()}
                    variant="ghost"
                    size="sm"
                  >
                    Open
                  </ButtonLink>
                }
              >
                <TableCell>
                  <div style={{ fontWeight: 600, color: "var(--lr-text)" }}>{f.name}</div>
                  {f.description ? (
                    <div className="lr-secondaryText lr-meta" style={{ marginTop: 4 }}>
                      {f.description}
                    </div>
                  ) : (
                    <div className="lr-meta" style={{ marginTop: 4 }}>
                      No description
                    </div>
                  )}
                  {typeof f.fieldsCount === "number" ? (
                    <div className="lr-meta" style={{ marginTop: 6 }}>
                      {f.fieldsCount} field(s)
                    </div>
                  ) : null}
                </TableCell>

                <TableCell>
                  <Chip tone={statusTone(f.status)}>{formatFormStatus(f.status)}</Chip>
                </TableCell>

                <TableCell>
                  <span className="lr-secondaryText">{formatUpdatedAt(f.updatedAt)}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CreateFormModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} />
    </div>
  );
}
