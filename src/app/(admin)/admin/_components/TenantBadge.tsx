"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetchJson } from "../_lib/adminFetch";
import { ErrorBox, Spinner } from "./UiState";

type TenantCurrent = {
  id: string;
  slug: string;
  name: string;
};

export default function TenantBadge({
  tenantSlug,
}: {
  tenantSlug: string;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string; traceId?: string }
    | { kind: "ok"; tenant: TenantCurrent; traceId?: string }
  >({ kind: "loading" });

  const badgeTitle = useMemo(() => {
    if (state.kind === "ok") return `${state.tenant.name} (${state.tenant.slug})`;
    if (state.kind === "loading") return "Loading tenant…";
    return "Tenant error";
  }, [state.kind]);

  const load = useCallback(async () => {
    setState({ kind: "loading" });

    const res = await adminFetchJson<TenantCurrent>("/api/admin/v1/tenants/current", {
      method: "GET",
      tenantSlug,
    });

    if (!res.ok) {
      setState({ kind: "error", message: res.message, traceId: res.traceId });
      return;
    }

    setState({ kind: "ok", tenant: res.data, traceId: res.traceId });
  }, [tenantSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div
        title={badgeTitle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          borderRadius: 12,
          border: "1px solid rgba(226,232,240,1)",
          background: "rgba(255,255,255,1)",
        }}
      >
        <Spinner label="Tenant" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div style={{ minWidth: 280 }}>
        <ErrorBox
          title="Tenant konnte nicht geladen werden"
          message={state.message}
          traceId={state.traceId}
          onRetry={load}
        />
      </div>
    );
  }

  return (
    <div
      title={badgeTitle}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 12,
        border: "1px solid rgba(226,232,240,1)",
        background: "rgba(255,255,255,1)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: "rgba(37,99,235,1)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <div style={{ fontWeight: 800, fontSize: 12 }}>{state.tenant.name}</div>
        <div style={{ fontSize: 12, color: "rgba(100,116,139,1)" }}>{state.tenant.slug}</div>
      </div>
    </div>
  );
}
