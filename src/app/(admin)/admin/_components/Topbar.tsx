"use client";

import * as React from "react";
import TenantBadge from "./TenantBadge";
import { setDevUserIdClient, setTenantSlugClient } from "../_lib/adminFetch";

export default function Topbar({
  title,
  tenantSlug,
  onToggleSidebar,
}: {
  title: string;
  tenantSlug: string;
  onToggleSidebar: () => void;
}) {
  const isProd = process.env.NODE_ENV === "production";
  const [draft, setDraft] = React.useState<string>(tenantSlug);

  const helperText = React.useMemo(() => {
    if (isProd) return null;
    return "DEV: Tenant slug setzen (localStorage). APIs bleiben strikt tenant-scoped.";
  }, [isProd]);

  return (
    <div>
      <div className="lr-topbarRow">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lr-hamburger"
          aria-label="Navigation öffnen/schliessen"
        >
          ☰
        </button>

        <div className="lr-topbarTitle" title={title}>
          {title}
        </div>

        <div className="lr-topbarRight">
          <TenantBadge tenantSlug={tenantSlug} />
        </div>
      </div>

      {!isProd ? (
        <div className="lr-devBar">
          <div className="lr-devBarLeft">
            <div className="lr-devHint">{helperText}</div>
          </div>

          <form
            className="lr-devBarForm"
            onSubmit={(e) => {
              e.preventDefault();
              const next = draft.trim().toLowerCase();
              setTenantSlugClient(next);
              setDraft(next);

              // Same-tab update (storage event fires only cross-tab)
              window.dispatchEvent(new Event("lr_admin_tenant_slug_changed"));
            }}
          >
            <label className="lr-devLabel">
              Tenant slug
              <input
                className="lr-devInput"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="z. B. atlex"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>

            <button className="lr-devBtn" type="submit">
              Apply
            </button>

            <button
              className="lr-devBtnSecondary"
              type="button"
              onClick={() => {
                const v = window.prompt("DEV UserId (optional, z. B. dev-owner). Leer = löschen") ?? "";
                setDevUserIdClient(v);
                window.location.reload();
              }}
              aria-label="DEV UserId setzen (optional)"
              title="Optional (nur falls Backend lokal x-user-id erwartet)"
            >
              Dev User
            </button>
          </form>
        </div>
      ) : null}

      <style>{`
        .lr-topbarRow{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;gap:12px;}
        .lr-topbarTitle{font-weight:800;font-size:14px;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .lr-topbarRight{display:flex;align-items:center;gap:10px;}
        .lr-hamburger{display:none;}
        .lr-devBar{border-top:1px solid rgba(226,232,240,1);padding:10px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .lr-devHint{font-size:12px;color:rgba(100,116,139,1);max-width:520px;}
        .lr-devBarForm{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;}
        .lr-devLabel{display:flex;flex-direction:column;gap:6px;font-size:12px;color:rgba(100,116,139,1);font-weight:700;}
        .lr-devInput{height:34px;padding:0 10px;border-radius:12px;border:1px solid rgba(226,232,240,1);background:white;min-width:220px;font-size:13px;}
        .lr-devBtn,.lr-devBtnSecondary{height:34px;padding:0 10px;border-radius:12px;border:1px solid rgba(226,232,240,1);background:rgba(37,99,235,1);color:white;font-weight:800;font-size:13px;cursor:pointer;}
        .lr-devBtnSecondary{background:white;color:rgba(15,23,42,1);}
        .lr-devBtn:focus-visible,.lr-devBtnSecondary:focus-visible,.lr-devInput:focus-visible{outline:3px solid rgba(37,99,235,0.22);outline-offset:2px;}
        @media (max-width: 900px){
          .lr-hamburger{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;border:1px solid rgba(226,232,240,1);background:white;cursor:pointer;}
        }
      `}</style>
    </div>
  );
}
