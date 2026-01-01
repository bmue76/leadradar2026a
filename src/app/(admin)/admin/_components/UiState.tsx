"use client";

import Link from "next/link";

export function Spinner({ label }: { label?: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          border: "2px solid rgba(15,23,42,0.18)",
          borderTopColor: "rgba(37,99,235,0.9)",
          display: "inline-block",
          animation: "lrSpin 800ms linear infinite",
        }}
      />
      <span style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>
        {label ?? "Loading…"}
      </span>
      <style>{`@keyframes lrSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}

export function ErrorBox({
  title = "Something went wrong",
  message,
  traceId,
  onRetry,
}: {
  title?: string;
  message: string;
  traceId?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        border: "1px solid rgba(226,232,240,1)",
        background: "rgba(15,23,42,0.02)",
        padding: 12,
        borderRadius: 14,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ color: "rgba(100,116,139,1)", fontSize: 13 }}>{message}</div>
      {traceId ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(100,116,139,1)" }}>
          TraceId: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{traceId}</span>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            style={{
              height: 34,
              padding: "0 10px",
              borderRadius: 12,
              border: "1px solid rgba(226,232,240,1)",
              background: "white",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  actionHref,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div
      style={{
        border: "1px dashed rgba(226,232,240,1)",
        background: "rgba(255,255,255,1)",
        padding: 14,
        borderRadius: 16,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13 }}>{title}</div>
      <div style={{ color: "rgba(100,116,139,1)", fontSize: 13, marginTop: 4 }}>{message}</div>
      {actionLabel && actionHref ? (
        <div style={{ marginTop: 10 }}>
          <Link
            href={actionHref}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 34,
              padding: "0 10px",
              borderRadius: 12,
              border: "1px solid rgba(226,232,240,1)",
              background: "rgba(37,99,235,1)",
              color: "white",
              fontWeight: 800,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
