"use client";

import * as React from "react";
import { adminFetchJson } from "../../_lib/adminFetch";

type ApiKeyRow = {
  id: string;
  name?: string;
  label?: string;
  prefix?: string;
  status?: string;
  createdAt?: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};

type DeviceRow = {
  id: string;
  name?: string;
  status?: string;
  createdAt?: string;
  lastSeenAt?: string | null;
  apiKeyPrefix?: string;
  apiKey?: { prefix?: string; lastUsedAt?: string | null } | null;
  assignedForms?: Array<{ id: string; name: string; status: string }>;
};

type FormListItem = { id: string; name: string; status: string; description?: string | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.items)) return payload.items as unknown[];
  if (Array.isArray(payload.forms)) return payload.forms as unknown[];
  if (Array.isArray(payload.devices)) return payload.devices as unknown[];
  if (Array.isArray(payload.keys)) return payload.keys as unknown[];
  return [];
}

function pickAdminFormsList(payload: unknown): unknown[] {
  // Admin forms list returns data: { forms: [...], items: [...] } (per docs),
  // but we accept variants and wrappers.
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  const items = payload.items;
  if (Array.isArray(items)) return items as unknown[];

  const forms = payload.forms;
  if (Array.isArray(forms)) return forms as unknown[];

  const data = payload.data;
  if (isRecord(data)) {
    const items2 = data.items;
    if (Array.isArray(items2)) return items2 as unknown[];
    const forms2 = data.forms;
    if (Array.isArray(forms2)) return forms2 as unknown[];
  }

  return [];
}

function isoShort(d?: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function chipClasses(status: string): string {
  const s = (status || "").toUpperCase();
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  if (s === "ACTIVE") return `${base} bg-emerald-50 text-emerald-900 border border-emerald-200`;
  if (s === "REVOKED" || s === "DISABLED") return `${base} bg-neutral-100 text-neutral-700 border border-neutral-200`;
  return `${base} bg-neutral-100 text-neutral-700 border border-neutral-200`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const LS_DEMO_CAPTURE_KEY_LEGACY = "lr_demo_capture_mobile_api_key";
const LS_DEMO_CAPTURE_KEY_DEV = "leadradar.devMobileApiKey";

function setDemoCaptureKey(token: string) {
  try {
    const t = token.trim();
    if (!t) return;
    window.localStorage.setItem(LS_DEMO_CAPTURE_KEY_DEV, t);
    window.localStorage.setItem(LS_DEMO_CAPTURE_KEY_LEGACY, t);
  } catch {
    // ignore
  }
}

function fmtErr(e: { code: string; message: string; traceId?: string; status?: number }): string {
  const parts = [`${e.code}: ${e.message}`];
  if (typeof e.status === "number") parts.push(`HTTP ${e.status}`);
  if (e.traceId) parts.push(`trace ${e.traceId}`);
  return parts.join(" · ");
}

export default function MobileOpsClient() {
  // ApiKeys
  const [keysLoading, setKeysLoading] = React.useState(true);
  const [keys, setKeys] = React.useState<ApiKeyRow[]>([]);
  const [keysError, setKeysError] = React.useState<string | null>(null);

  // Devices
  const [devicesLoading, setDevicesLoading] = React.useState(true);
  const [devices, setDevices] = React.useState<DeviceRow[]>([]);
  const [devicesError, setDevicesError] = React.useState<string | null>(null);

  // Create Key Modal
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createDevice, setCreateDevice] = React.useState(true);
  const [createDeviceName, setCreateDeviceName] = React.useState("Messe Device");
  const [createSubmitting, setCreateSubmitting] = React.useState(false);
  const [oneTimeToken, setOneTimeToken] = React.useState<string | null>(null);
  const [oneTimeMeta, setOneTimeMeta] = React.useState<{ prefix?: string; id?: string } | null>(null);
  const [oneTimeCopied, setOneTimeCopied] = React.useState(false);

  // Manage Device Drawer
  const [manageOpen, setManageOpen] = React.useState(false);
  const [manageDeviceId, setManageDeviceId] = React.useState<string>("");
  const [manageLoading, setManageLoading] = React.useState(false);
  const [manageError, setManageError] = React.useState<string | null>(null);

  const [manageName, setManageName] = React.useState("");
  const [manageStatus, setManageStatus] = React.useState<"ACTIVE" | "DISABLED">("ACTIVE");
  const [manageApiKeyPrefix, setManageApiKeyPrefix] = React.useState<string>("—");
  const [manageLastSeenAt, setManageLastSeenAt] = React.useState<string | null>(null);
  const [manageLastUsedAt, setManageLastUsedAt] = React.useState<string | null>(null);

  const [formsLoading, setFormsLoading] = React.useState(false);
  const [forms, setForms] = React.useState<FormListItem[]>([]);
  const [showNonActiveForms, setShowNonActiveForms] = React.useState(false);
  const [formQuery, setFormQuery] = React.useState("");
  const [selectedFormIds, setSelectedFormIds] = React.useState<Set<string>>(new Set());

  const [savingDevice, setSavingDevice] = React.useState(false);
  const [savingAssignments, setSavingAssignments] = React.useState(false);

  async function loadKeys() {
    setKeysLoading(true);
    setKeysError(null);
    const res = await adminFetchJson<unknown>("/api/admin/v1/mobile/keys", { method: "GET" });
    if (!res.ok) {
      setKeys([]);
      setKeysError(fmtErr(res));
      setKeysLoading(false);
      return;
    }
    const rows = pickArray(res.data) as unknown[];
    const parsed: ApiKeyRow[] = rows
      .map((r) => (isRecord(r) ? (r as ApiKeyRow) : null))
      .filter(Boolean) as ApiKeyRow[];
    setKeys(parsed);
    setKeysLoading(false);
  }

  async function loadDevices() {
    setDevicesLoading(true);
    setDevicesError(null);
    const res = await adminFetchJson<unknown>("/api/admin/v1/mobile/devices", { method: "GET" });
    if (!res.ok) {
      setDevices([]);
      setDevicesError(fmtErr(res));
      setDevicesLoading(false);
      return;
    }
    const rows = pickArray(res.data) as unknown[];
    const parsed: DeviceRow[] = rows
      .map((r) => (isRecord(r) ? (r as DeviceRow) : null))
      .filter(Boolean) as DeviceRow[];
    setDevices(parsed);
    setDevicesLoading(false);
  }

  React.useEffect(() => {
    void loadKeys();
    void loadDevices();
  }, []);

  function openCreate() {
    setCreateOpen(true);
    setCreateName("");
    setCreateDevice(true);
    setCreateDeviceName("Messe Device");
    setCreateSubmitting(false);
    setOneTimeToken(null);
    setOneTimeMeta(null);
    setOneTimeCopied(false);
  }

  async function onCreateKey() {
    const name = createName.trim() || "Mobile Key";
    const deviceName = createDevice ? createDeviceName.trim() : "";

    setCreateSubmitting(true);
    setOneTimeToken(null);
    setOneTimeMeta(null);
    setOneTimeCopied(false);

    try {
      const body: Record<string, string> = { name };
      if (deviceName) body.deviceName = deviceName;

      const res = await adminFetchJson<unknown>("/api/admin/v1/mobile/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setKeysError(fmtErr(res));
        return;
      }

      let token: string | null = null;
      let prefix: string | undefined;
      let id: string | undefined;

      if (isRecord(res.data)) {
        const d = res.data as Record<string, unknown>;
        if (typeof d.apiKey === "string") token = d.apiKey;
        if (typeof d.token === "string") token = d.token;

        if (typeof d.prefix === "string") prefix = d.prefix;
        if (typeof d.id === "string") id = d.id;

        const nested = d.apiKey;
        if (!token && isRecord(nested)) {
          const n = nested as Record<string, unknown>;
          if (typeof n.token === "string") token = n.token;
          if (typeof n.prefix === "string") prefix = n.prefix;
          if (typeof n.id === "string") id = n.id;
        }
      }

      if (!token) {
        setKeysError("Create succeeded, but no one-time token returned by API.");
        return;
      }

      setOneTimeToken(token);
      setOneTimeMeta({ prefix, id });

      await loadKeys();
      await loadDevices();
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function onRevokeKey(id: string) {
    const res = await adminFetchJson<unknown>(`/api/admin/v1/mobile/keys/${id}/revoke`, { method: "POST" });
    if (!res.ok) {
      setKeysError(fmtErr(res));
      return;
    }
    await loadKeys();
    await loadDevices();
  }

  function openManageDevice(id: string) {
    setManageOpen(true);
    setManageDeviceId(id);
    setManageLoading(true);
    setManageError(null);

    setManageName("");
    setManageStatus("ACTIVE");
    setManageApiKeyPrefix("—");
    setManageLastSeenAt(null);
    setManageLastUsedAt(null);

    setForms([]);
    setFormsLoading(false);
    setShowNonActiveForms(false);
    setFormQuery("");
    setSelectedFormIds(new Set());

    void loadManageDevice(id);
  }

  async function loadManageDevice(id: string) {
    setManageLoading(true);
    setManageError(null);

    const res = await adminFetchJson<unknown>(`/api/admin/v1/mobile/devices/${id}`, { method: "GET" });
    if (!res.ok) {
      setManageError(fmtErr(res));
      setManageLoading(false);
      return;
    }

    if (!isRecord(res.data)) {
      setManageError("Unexpected response shape from GET /api/admin/v1/mobile/devices/:id");
      setManageLoading(false);
      return;
    }

    const d = res.data as Record<string, unknown>;

    const name = typeof d.name === "string" ? d.name : "";
    const statusRaw = typeof d.status === "string" ? d.status : "ACTIVE";
    const status = statusRaw.toUpperCase() === "DISABLED" ? "DISABLED" : "ACTIVE";

    let apiKeyPrefix = typeof d.apiKeyPrefix === "string" ? d.apiKeyPrefix : "";
    let lastUsedAt: string | null = null;

    if (isRecord(d.apiKey)) {
      const ak = d.apiKey as Record<string, unknown>;
      if (!apiKeyPrefix && typeof ak.prefix === "string") apiKeyPrefix = ak.prefix;
      if (typeof ak.lastUsedAt === "string") lastUsedAt = ak.lastUsedAt;
      if (ak.lastUsedAt === null) lastUsedAt = null;
    }

    const lastSeenAt =
      typeof d.lastSeenAt === "string" ? d.lastSeenAt : d.lastSeenAt === null ? null : null;

    const assigned = (Array.isArray(d.assignedForms) ? d.assignedForms : []) as unknown[];
    const assignedIds = new Set<string>();
    for (const it of assigned) {
      if (isRecord(it) && typeof it.id === "string") assignedIds.add(it.id);
    }

    setManageName(name);
    setManageStatus(status);
    setManageApiKeyPrefix(apiKeyPrefix || "—");
    setManageLastSeenAt(lastSeenAt);
    setManageLastUsedAt(lastUsedAt);
    setSelectedFormIds(assignedIds);

    setManageLoading(false);

    void loadFormsForAssignments();
  }

  async function loadFormsForAssignments() {
    setFormsLoading(true);

    const url = showNonActiveForms ? "/api/admin/v1/forms" : "/api/admin/v1/forms?status=ACTIVE";
    const res = await adminFetchJson<unknown>(url, { method: "GET" });

    if (!res.ok) {
      setManageError(fmtErr(res));
      setForms([]);
      setFormsLoading(false);
      return;
    }

    const arr = pickAdminFormsList(res.data);
    const parsed: FormListItem[] = arr
      .map((x) => (isRecord(x) ? (x as FormListItem) : null))
      .filter(Boolean) as FormListItem[];

    setForms(parsed);
    setFormsLoading(false);
  }

  function toggleForm(id: string) {
    setSelectedFormIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveDevice() {
    if (!manageDeviceId) return;
    const name = manageName.trim();
    const status = manageStatus;

    setSavingDevice(true);
    setManageError(null);

    try {
      const res = await adminFetchJson<unknown>(`/api/admin/v1/mobile/devices/${manageDeviceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, status }),
      });
      if (!res.ok) {
        setManageError(fmtErr(res));
        return;
      }
      await loadDevices();
    } finally {
      setSavingDevice(false);
    }
  }

  async function saveAssignments() {
    if (!manageDeviceId) return;

    setSavingAssignments(true);
    setManageError(null);

    try {
      const formIds = Array.from(selectedFormIds);

      let res = await adminFetchJson<unknown>(`/api/admin/v1/mobile/devices/${manageDeviceId}/assignments`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formIds }),
      });

      if (!res.ok && res.status === 404) {
        res = await adminFetchJson<unknown>(`/api/admin/v1/mobile/devices/${manageDeviceId}/forms`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ formIds }),
        });
      }

      if (!res.ok) {
        setManageError(fmtErr(res));
        return;
      }

      await loadDevices();
      await loadManageDevice(manageDeviceId);
    } finally {
      setSavingAssignments(false);
    }
  }

  const filteredForms = forms.filter((f) => {
    const q = formQuery.trim().toLowerCase();
    if (!q) return true;
    return `${f.name} ${f.status}`.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Mobile Ops</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Produktiver Admin-Screen für Mobile API Betrieb: ApiKeys, Devices, Assignments. Fokus Operations – kein UX-Polish.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <a
            href="/admin/demo/capture"
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Open Demo Capture
          </a>
          <button
            type="button"
            onClick={() => {
              void loadKeys();
              void loadDevices();
            }}
            className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ApiKeys */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-neutral-900">ApiKeys</div>
            <div className="text-xs text-neutral-600">
              Prefix + Status + lastUsedAt. Klartext-Key gibt es nur 1x beim Create.
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Create key
          </button>
        </div>

        {keysError ? (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {keysError}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keysLoading ? (
                <tr>
                  <td className="px-4 py-4 text-neutral-600" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-neutral-600" colSpan={6}>
                    No keys yet.
                  </td>
                </tr>
              ) : (
                keys.map((k) => {
                  const name = (k.name ?? k.label ?? "—").toString();
                  const status = (k.status ?? "—").toString();
                  return (
                    <tr key={k.id} className="border-t border-neutral-100">
                      <td className="px-4 py-3 font-mono text-xs">{k.prefix ?? "—"}</td>
                      <td className="px-4 py-3">{name}</td>
                      <td className="px-4 py-3">
                        <span className={chipClasses(status)}>{status}</span>
                      </td>
                      <td className="px-4 py-3">{isoShort(k.lastUsedAt ?? null)}</td>
                      <td className="px-4 py-3">{isoShort(k.createdAt ?? null)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void onRevokeKey(k.id)}
                          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-60"
                          disabled={String(status).toUpperCase() === "REVOKED"}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Devices */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-neutral-900">Devices</div>
            <div className="text-xs text-neutral-600">
              1:1 an ApiKey gebunden. Assignments (Device ↔ Forms) werden replace-saved.
            </div>
          </div>
        </div>

        {devicesError ? (
          <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {devicesError}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-600">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">ApiKey</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devicesLoading ? (
                <tr>
                  <td className="px-4 py-4 text-neutral-600" colSpan={7}>
                    Loading…
                  </td>
                </tr>
              ) : devices.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-neutral-600" colSpan={7}>
                    No devices yet.
                  </td>
                </tr>
              ) : (
                devices.map((d) => {
                  const status = (d.status ?? "—").toString();
                  const prefix = d.apiKeyPrefix ?? d.apiKey?.prefix ?? "—";
                  const lastUsedAt = d.apiKey?.lastUsedAt ?? null;
                  const assignedCount = d.assignedForms?.length ?? 0;

                  return (
                    <tr key={d.id} className="border-t border-neutral-100">
                      <td className="px-4 py-3">{d.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={chipClasses(status)}>{status}</span>
                      </td>
                      <td className="px-4 py-3">{isoShort(d.lastSeenAt ?? null)}</td>
                      <td className="px-4 py-3">{isoShort(lastUsedAt)}</td>
                      <td className="px-4 py-3">{assignedCount}</td>
                      <td className="px-4 py-3 font-mono text-xs">{prefix}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openManageDevice(d.id)}
                          className="rounded-xl border border-neutral-200 px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-lg">
            <div className="mb-3">
              <div className="text-sm font-medium text-neutral-900">Create Mobile ApiKey</div>
              <div className="text-xs text-neutral-600">Klartext-Key wird nur 1x angezeigt. Danach nur prefix/hash.</div>
            </div>

            {oneTimeToken ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-medium text-emerald-900">One-time token</div>
                <div className="mt-2 break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-emerald-900">
                  {oneTimeToken}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(oneTimeToken);
                      setOneTimeCopied(ok);
                    }}
                    className="rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    {oneTimeCopied ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDemoCaptureKey(oneTimeToken);
                      window.location.href = "/admin/demo/capture";
                    }}
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                  >
                    Use for Demo Capture
                  </button>
                </div>
                <div className="mt-2 text-xs text-emerald-900/70">
                  Prefix: <span className="font-mono">{oneTimeMeta?.prefix ?? "—"}</span>
                </div>
              </div>
            ) : null}

            {!oneTimeToken ? (
              <>
                <label className="mb-1 block text-xs font-medium text-neutral-700">Name/Label</label>
                <input
                  className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="z.B. Messe iPad 1"
                  disabled={createSubmitting}
                />

                <label className="mb-2 flex items-center gap-2 text-sm text-neutral-900">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-neutral-300"
                    checked={createDevice}
                    onChange={(e) => setCreateDevice(e.target.checked)}
                    disabled={createSubmitting}
                  />
                  <span className="font-medium">Create device (recommended)</span>
                </label>

                {createDevice ? (
                  <>
                    <label className="mb-1 block text-xs font-medium text-neutral-700">Device name</label>
                    <input
                      className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                      value={createDeviceName}
                      onChange={(e) => setCreateDeviceName(e.target.value)}
                      placeholder="z.B. iPad Eingang"
                      disabled={createSubmitting}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                disabled={createSubmitting}
              >
                Close
              </button>

              {!oneTimeToken ? (
                <button
                  type="button"
                  onClick={() => void onCreateKey()}
                  className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? "Creating…" : "Create"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Manage Device Drawer */}
      {manageOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-xl border-l border-neutral-200 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-neutral-900">Manage Device</div>
                <div className="text-xs text-neutral-600">
                  ApiKey: <span className="font-mono">{manageApiKeyPrefix}</span> · Last seen:{" "}
                  <span className="font-mono">{isoShort(manageLastSeenAt)}</span> · Last used:{" "}
                  <span className="font-mono">{isoShort(manageLastUsedAt)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManageOpen(false)}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
              >
                Close
              </button>
            </div>

            {manageError ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {manageError}
              </div>
            ) : null}

            {manageLoading ? (
              <div className="text-sm text-neutral-600">Loading…</div>
            ) : (
              <>
                <div className="mb-4 rounded-2xl border border-neutral-200 p-4">
                  <div className="mb-2 text-sm font-medium text-neutral-900">Device settings</div>

                  <label className="mb-1 block text-xs font-medium text-neutral-700">Name</label>
                  <input
                    className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                    value={manageName}
                    onChange={(e) => setManageName(e.target.value)}
                    disabled={savingDevice}
                  />

                  <label className="mb-1 block text-xs font-medium text-neutral-700">Status</label>
                  <select
                    className="mb-3 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                    value={manageStatus}
                    onChange={(e) => setManageStatus(e.target.value === "DISABLED" ? "DISABLED" : "ACTIVE")}
                    disabled={savingDevice}
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DISABLED">DISABLED</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void saveDevice()}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                    disabled={savingDevice}
                  >
                    {savingDevice ? "Saving…" : "Save device"}
                  </button>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <div className="mb-2 text-sm font-medium text-neutral-900">Assignments</div>
                  <div className="mb-3 text-xs text-neutral-600">
                    Replace strategy: gespeicherte Auswahl ersetzt die bisherigen Assignments.
                  </div>

                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                      placeholder="Search forms…"
                      value={formQuery}
                      onChange={(e) => setFormQuery(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm text-neutral-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-300"
                        checked={showNonActiveForms}
                        onChange={(e) => {
                          setShowNonActiveForms(e.target.checked);
                          setTimeout(() => void loadFormsForAssignments(), 0);
                        }}
                        disabled={formsLoading}
                      />
                      <span className="text-xs text-neutral-700">Show drafts/archived</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void loadFormsForAssignments()}
                      className="rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
                      disabled={formsLoading}
                    >
                      Refresh
                    </button>
                  </div>

                  {formsLoading ? (
                    <div className="text-sm text-neutral-600">Loading forms…</div>
                  ) : filteredForms.length === 0 ? (
                    <div className="text-sm text-neutral-600">No forms.</div>
                  ) : (
                    <div className="max-h-[360px] overflow-auto rounded-xl border border-neutral-200">
                      <ul className="divide-y divide-neutral-100">
                        {filteredForms.map((f) => {
                          const checked = selectedFormIds.has(f.id);
                          return (
                            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                              <label className="flex min-w-0 items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-neutral-300"
                                  checked={checked}
                                  onChange={() => toggleForm(f.id)}
                                />
                                <span className="truncate text-sm text-neutral-900">{f.name}</span>
                              </label>
                              <span className={chipClasses(f.status)}>{f.status}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void saveAssignments()}
                      className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                      disabled={savingAssignments}
                    >
                      {savingAssignments ? "Saving…" : "Save assignments"}
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-neutral-600">
                    Selected: <span className="font-mono">{selectedFormIds.size}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
