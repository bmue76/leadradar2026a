"use client";

import * as React from "react";

type Tenant = {
  id: string;
  name: string;
  slug: string;
};

type ApiOk<T> = {
  ok: true;
  data: T;
  traceId: string;
};

type ApiErr = {
  ok: false;
  error: { code: string; message: string };
  traceId: string;
};

type TenantBadgeState =
  | { status: "loading" }
  | { status: "ready"; tenant: Tenant }
  | { status: "error"; message: string; traceId?: string };

function resolveTenantSlug(): string | undefined {
  if (typeof window !== "undefined") {
    const fromLs = window.localStorage.getItem("lr_admin_tenant_slug")?.trim();
    if (fromLs) return fromLs;
  }
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG?.trim();
  return fromEnv || undefined;
}

function extractTenant(payload: unknown): Tenant | null {
  if (!payload || typeof payload !== "object") return null;

  const anyPayload = payload as any;
  const maybeTenant = anyPayload.tenant ?? anyPayload;

  if (!maybeTenant || typeof maybeTenant !== "object") return null;

  const t = maybeTenant as any;
  if (typeof t.id !== "string" || typeof t.name !== "string" || typeof t.slug !== "string") return null;

  return { id: t.id, name: t.name, slug: t.slug };
}

async function fetchCurrentTenant(tenantSlug: string): Promise<{ tenant: Tenant } | { error: string; traceId?: string }> {
  const res = await fetch("/api/admin/v1/tenants/current", {
    method: "GET",
    headers: {
      "x-tenant-slug": tenantSlug,
    },
    cache: "no-store",
  });

  let json: ApiOk<any> | ApiErr | null = null;
  try {
    json = (await res.json()) as any;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const traceId = json?.traceId;
    const msg = json?.ok === false ? json.error?.message : `Request failed (${res.status})`;
    return { error: msg || "Request failed", traceId };
  }

  if (!json || (json as any).ok !== true) {
    const traceId = (json as any)?.traceId;
    const msg = (json as any)?.ok === false ? (json as any)?.error?.message : "Unexpected response";
    return { error: msg || "Unexpected response", traceId };
  }

  const tenant = extractTenant((json as ApiOk<any>).data);
  if (!tenant) {
    return { error: "Unexpected response shape (tenant missing)", traceId: (json as ApiOk<any>).traceId };
  }

  return { tenant };
}

export function TenantBadge(props: { refreshToken?: string | number }) {
  const [tenantSlug, setTenantSlug] = React.useState<string | undefined>(() => resolveTenantSlug());
  const [state, setState] = React.useState<TenantBadgeState>({ status: "loading" });
  const [reloadSeq, setReloadSeq] = React.useState(0);

  // Re-read tenant slug if something external changes (DEV switch)
  React.useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === "lr_admin_tenant_slug") setTenantSlug(resolveTenantSlug());
    }
    function handleCustom() {
      setTenantSlug(resolveTenantSlug());
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener("lr_admin_tenant_slug_changed", handleCustom as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("lr_admin_tenant_slug_changed", handleCustom as EventListener);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const slug = tenantSlug;

      if (!slug) {
        setState({
          status: "error",
          message: "Tenant slug ist nicht gesetzt. Setze NEXT_PUBLIC_DEFAULT_TENANT_SLUG oder nutze den DEV Tenant Switch.",
        });
        return;
      }

      setState({ status: "loading" });
      const result = await fetchCurrentTenant(slug);

      if (cancelled) return;

      if ("tenant" in result) {
        setState({ status: "ready", tenant: result.tenant });
      } else {
        setState({ status: "error", message: result.error, traceId: result.traceId });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, reloadSeq, props.refreshToken]);

  const retry = () => setReloadSeq((x) => x + 1);

  // Simple, compact pill UI for topbar usage
  if (state.status === "loading") {
    return (
      <div aria-label="Tenant wird geladen" title="Tenant wird geladen" style={pillStyle("neutral")}>
        <span aria-hidden="true" style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, border: "2px solid currentColor", borderTopColor: "transparent", marginRight: 8, animation: "lrspin 0.9s linear infinite" }} />
        <span>Tenant…</span>
        <style>{keyframes}</style>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div aria-label="Tenant konnte nicht geladen werden" title="Tenant konnte nicht geladen werden" style={pillStyle("error")}>
          <span style={{ fontWeight: 600 }}>Tenant</span>
          <span style={{ opacity: 0.9, marginLeft: 6 }}>unavailable</span>
          {state.traceId ? <span style={{ opacity: 0.8, marginLeft: 8 }}>· traceId {state.traceId}</span> : null}
        </div>
        <button type="button" onClick={retry} style={buttonStyle} aria-label="Tenant neu laden">
          Retry
        </button>
      </div>
    );
  }

  const label = `${state.tenant.name} (${state.tenant.slug})`;

  return (
    <div aria-label={`Aktueller Tenant: ${label}`} title={`Aktueller Tenant: ${label}`} style={pillStyle("brand")}>
      <span style={{ fontWeight: 650 }}>{state.tenant.name}</span>
      <span style={{ opacity: 0.9, marginLeft: 8 }}>({state.tenant.slug})</span>
    </div>
  );
}

export default TenantBadge;

function pillStyle(kind: "neutral" | "brand" | "error"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 13,
    lineHeight: "16px",
    border: "1px solid rgba(0,0,0,0.10)",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  if (kind === "neutral") return { ...base, background: "rgba(0,0,0,0.04)", color: "rgba(0,0,0,0.75)" };
  if (kind === "error") return { ...base, background: "rgba(220,38,38,0.10)", color: "rgba(153,27,27,0.95)", border: "1px solid rgba(220,38,38,0.25)" };

  return { ...base, background: "rgba(37,99,235,0.10)", color: "rgba(30,64,175,0.95)", border: "1px solid rgba(37,99,235,0.22)" };
}

const buttonStyle: React.CSSProperties = {
  border: "1px solid rgba(0,0,0,0.15)",
  background: "rgba(0,0,0,0.03)",
  borderRadius: 10,
  padding: "6px 10px",
  fontSize: 13,
  cursor: "pointer",
};

const keyframes = `
@keyframes lrspin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
`;
