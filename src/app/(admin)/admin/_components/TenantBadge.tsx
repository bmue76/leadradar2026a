"use client";

import * as React from "react";
import { adminFetchJson } from "../_lib/adminFetch";
import { ErrorBox, Spinner } from "./UiState";

type TenantCurrent = {
  id: string;
  slug: string;
  name: string;
};

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; traceId?: string }
  | { kind: "ok"; tenant: TenantCurrent; traceId?: string };

export default function TenantBadge({
  tenantSlug,
  refreshToken,
}: {
  tenantSlug: string;
  refreshToken?: string | number;
}) {
  const [state, setState] = React.useState<State>({ kind: "loading" });

  const title =
    state.kind === "ok"
      ? `${state.tenant.name} (${state.tenant.slug})`
      : state.kind === "loading"
      ? "Loading tenant…"
      : "Tenant error";

  const load = React.useCallback(async () => {
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

  React.useEffect(() => {
    void load();
  }, [load, refreshToken]);

  if (state.kind === "loading") {
    return (
      <div
        title={title}
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
      <div style={{ minWidth: 280 }} title={title}>
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
      title={title}
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
