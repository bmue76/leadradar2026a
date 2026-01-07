"use client";

import * as React from "react";
import { adminFetchJson } from "../_lib/adminFetch";
import type { ApiResponse, CreateFormInput, FormStatus } from "./forms.types";
import { formatFormStatus } from "./forms.types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (formId: string, opts?: { openBuilder?: boolean }) => void;
};

type CreateMode = "EMPTY" | "TEMPLATE_STANDARD";

const STATUS_OPTIONS: Array<{ value: FormStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extractId(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const id = data.id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function CreateFormModal({ open, onClose, onCreated }: Props) {
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = React.useState<CreateMode>("TEMPLATE_STANDARD");

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<FormStatus>("DRAFT");

  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = React.useState<string | null>(null);

  const canSubmit = name.trim().length >= 1 && !submitting;

  React.useEffect(() => {
    if (!open) return;

    // reset state on open
    setMode("TEMPLATE_STANDARD");
    setName("Messekontakt / Standard");
    setDescription("");
    setStatus("DRAFT");
    setSubmitting(false);
    setErrorMsg(null);
    setErrorTraceId(null);

    const t = window.setTimeout(() => {
      nameRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(t);
  }, [open]);

  const close = React.useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    },
    [close]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setErrorMsg(null);
    setErrorTraceId(null);

    try {
      if (mode === "TEMPLATE_STANDARD") {
        const res = (await adminFetchJson("/api/admin/v1/forms/from-template", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            templateKey: "standard",
            name: name.trim(),
          }),
        })) as ApiResponse<unknown>;

        if (!res.ok) {
          setErrorMsg(res.error.message || "Could not create form from template.");
          setErrorTraceId(res.traceId || null);
          setSubmitting(false);
          return;
        }

        const id = extractId(res.data);
        if (!id) {
          setErrorMsg("Template created, but response did not include an id.");
          setErrorTraceId(res.traceId || null);
          setSubmitting(false);
          return;
        }

        setSubmitting(false);
        onClose();
        onCreated(id, { openBuilder: true });
        return;
      }

      const payload: CreateFormInput = {
        name: name.trim(),
        description: description.trim().length ? description.trim() : undefined,
        status,
      };

      const res = (await adminFetchJson("/api/admin/v1/forms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })) as ApiResponse<unknown>;

      if (!res.ok) {
        setErrorMsg(res.error.message || "Could not create form.");
        setErrorTraceId(res.traceId || null);
        setSubmitting(false);
        return;
      }

      const id = extractId(res.data);
      if (!id) {
        setErrorMsg("Form created, but response did not include an id.");
        setErrorTraceId(res.traceId || null);
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      onClose();
      onCreated(id, { openBuilder: false });
    } catch {
      setErrorMsg("Network error. Please try again.");
      setErrorTraceId(null);
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-form-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/30"
        onClick={close}
        aria-label="Close"
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="create-form-title" className="text-base font-semibold text-zinc-900">
              Create form
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Create an empty form or start from the standard template.
            </p>
          </div>

          <button
            type="button"
            onClick={close}
            className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            aria-label="Close modal"
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("TEMPLATE_STANDARD")}
                className={[
                  "flex-1 rounded-xl border px-3 py-2 text-sm",
                  mode === "TEMPLATE_STANDARD" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:bg-zinc-50",
                ].join(" ")}
                disabled={submitting}
              >
                From template
              </button>
              <button
                type="button"
                onClick={() => setMode("EMPTY")}
                className={[
                  "flex-1 rounded-xl border px-3 py-2 text-sm",
                  mode === "EMPTY" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:bg-zinc-50",
                ].join(" ")}
                disabled={submitting}
              >
                Empty form
              </button>
            </div>

            {mode === "TEMPLATE_STANDARD" ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Template: <span className="font-medium">Messekontakt / Standard</span>
                <div className="mt-1 text-xs text-zinc-600">
                  Includes: firstName, lastName, company, email, phone, notes, consent.
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="form-name" className="block text-sm font-medium text-zinc-900">
                Name <span className="text-zinc-500">*</span>
              </label>
              <input
                id="form-name"
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                placeholder={mode === "TEMPLATE_STANDARD" ? "e.g. Messekontakt – Halle 3" : "e.g. Contact scan"}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-zinc-500">Minimum 1 character.</p>
            </div>

            {mode === "EMPTY" ? (
              <>
                <div>
                  <label htmlFor="form-desc" className="block text-sm font-medium text-zinc-900">
                    Description <span className="text-zinc-500">(optional)</span>
                  </label>
                  <textarea
                    id="form-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    placeholder="Short hint for your team…"
                    rows={3}
                  />
                </div>

                <div>
                  <label htmlFor="form-status" className="block text-sm font-medium text-zinc-900">
                    Status
                  </label>
                  <select
                    id="form-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as FormStatus)}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">
                    Default is <span className="font-medium">{formatFormStatus("DRAFT")}</span>.
                  </p>
                </div>
              </>
            ) : (
              <div className="text-xs text-zinc-500">
                Template forms are created as <span className="font-medium">DRAFT</span>. You can activate it afterwards.
              </div>
            )}

            {errorMsg ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <div className="text-sm font-medium text-rose-900">Couldn’t create form</div>
                <div className="mt-1 text-sm text-rose-800">{errorMsg}</div>
                {errorTraceId ? (
                  <div className="mt-2 text-xs text-rose-800">
                    Trace ID: <span className="font-mono">{errorTraceId}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50"
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating…" : mode === "TEMPLATE_STANDARD" ? "Create from template" : "Create form"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
