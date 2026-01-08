"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetchJson } from "@/app/(admin)/admin/_lib/adminFetch";

const DEV_MOBILE_KEY_STORAGE = "leadradar.devMobileApiKey";

type KeyStatus = "ACTIVE" | "REVOKED";
type DeviceStatus = "ACTIVE" | "DISABLED";
type FormStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

type ApiKeyDto = {
  id: string;
  prefix: string;
  label: string;
  status: KeyStatus;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  device: { id: string; name: string; status: DeviceStatus; lastSeenAt: string | null } | null;
};

type DeviceRow = {
  id: string;
  name: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
  apiKeyPrefix: string;
  apiKeyStatus: KeyStatus;
  lastUsedAt: string | null;
  assignedFormsCount: number;
};

type DeviceDetail = {
  device: {
    id: string;
    name: string;
    status: DeviceStatus;
    lastSeenAt: string | null;
    createdAt: string;
    apiKey: { id: string; prefix: string; status: KeyStatus; lastUsedAt: string | null };
  };
  assignedForms: Array<{ id: string; name: string; status: FormStatus; createdAt: string; assignedAt: string }>;
};

type FormsList = { items: Array<{ id: string; name: string; status: FormStatus; createdAt: string }> };

function fmt(dt: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

function cls(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function MobileOpsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [keys, setKeys] = useState<ApiKeyDto[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  // Create key modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [createDevice, setCreateDevice] = useState(true);
  const [createDeviceName, setCreateDeviceName] = useState("New Device");

  // One-time token dialog
  const [tokenOpen, setTokenOpen] = useState(false);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Device drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDeviceId, setDrawerDeviceId] = useState<string | null>(null);
  const [deviceDetail, setDeviceDetail] = useState<DeviceDetail | null>(null);

  const [renameValue, setRenameValue] = useState("");
  const [statusValue, setStatusValue] = useState<DeviceStatus>("ACTIVE");

  // Assignments editor
  const [forms, setForms] = useState<FormsList["items"]>([]);
  const [showAllForms, setShowAllForms] = useState(false);
  const [searchForms, setSearchForms] = useState("");
  const [selectedFormIds, setSelectedFormIds] = useState<Record<string, boolean>>({});

  const filteredForms = useMemo(() => {
    const q = searchForms.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter((f) => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
  }, [forms, searchForms]);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const [kRes, dRes] = await Promise.all([
        adminFetchJson<{ items: ApiKeyDto[] }>("/api/admin/v1/mobile/keys"),
        adminFetchJson<{ items: DeviceRow[] }>("/api/admin/v1/mobile/devices"),
      ]);
      if (!kRes.ok) throw new Error(`${kRes.code}: ${kRes.message}`);
      if (!dRes.ok) throw new Error(`${dRes.code}: ${dRes.message}`);
      setKeys(kRes.data.items);
      setDevices(dRes.data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadForms(all: boolean) {
    const url = all ? "/api/admin/v1/mobile/forms?status=ALL" : "/api/admin/v1/mobile/forms?status=ACTIVE";
    const res = await adminFetchJson<FormsList>(url);
    if (!res.ok) {
      setErr(`${res.code}: ${res.message}`);
      return;
    }
    setForms(res.data.items);
  }

  async function openDevice(id: string) {
    setDrawerOpen(true);
    setDrawerDeviceId(id);
    setDeviceDetail(null);
    setSelectedFormIds({});
    setSearchForms("");
    setErr(null);

    const res = await adminFetchJson<DeviceDetail>(`/api/admin/v1/mobile/devices/${id}`);
    if (!res.ok) {
      setErr(`${res.code}: ${res.message}`);
      return;
    }
    setDeviceDetail(res.data);
    setRenameValue(res.data.device.name);
    setStatusValue(res.data.device.status);

    const initial: Record<string, boolean> = {};
    for (const a of res.data.assignedForms) initial[a.id] = true;
    setSelectedFormIds(initial);

    await loadForms(showAllForms);
  }

  async function createKey() {
    setLoading(true);
    setErr(null);
    try {
      const res = await adminFetchJson<{ apiKey: ApiKeyDto; token?: string }>("/api/admin/v1/mobile/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: createLabel || undefined,
          createDevice,
          deviceName: createDevice ? createDeviceName : undefined,
        }),
      });
      if (!res.ok) throw new Error(`${res.code}: ${res.message}`);

      setCreateOpen(false);
      setCreateLabel("");
      setCreateDevice(true);
      setCreateDeviceName("New Device");

      const token = res.data.token ?? null;
      setOneTimeToken(token);
      setTokenCopied(false);

      if (token) {
        setTokenOpen(true);
        try {
          window.localStorage.setItem(DEV_MOBILE_KEY_STORAGE, token);
        } catch {
          // ignore
        }
      }

      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("ApiKey wirklich deaktivieren (revoke)?")) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await adminFetchJson<{ apiKey: ApiKeyDto }>(`/api/admin/v1/mobile/keys/${id}/revoke`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveDeviceMeta() {
    if (!drawerDeviceId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await adminFetchJson<{ device: DeviceDetail["device"] }>(
        `/api/admin/v1/mobile/devices/${drawerDeviceId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: renameValue || undefined,
            status: statusValue || undefined,
          }),
        }
      );
      if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
      await openDevice(drawerDeviceId);
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAssignments() {
    if (!drawerDeviceId) return;
    setLoading(true);
    setErr(null);
    try {
      const ids = Object.entries(selectedFormIds)
        .filter(([, v]) => v)
        .map(([k]) => k);

      const res = await adminFetchJson<{ deviceId: string; assignedForms: DeviceDetail["assignedForms"] }>(
        `/api/admin/v1/mobile/devices/${drawerDeviceId}/assignments`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ formIds: ids }),
        }
      );
      if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
      await openDevice(drawerDeviceId);
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save assignments failed.");
    } finally {
      setLoading(false);
    }
  }

  function openDemoCapture() {
    router.push("/admin/demo/capture");
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mobile Ops</h1>
          <p className="text-sm text-neutral-500 mt-1">
            ApiKeys, Devices und Assignments verwalten (MVP, ops-fokussiert). Demo Capture benötigt einen Key.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
            onClick={() => openDemoCapture()}
            type="button"
          >
            Demo Capture (Key required)
          </button>
          <button
            className="rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90"
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            Create key
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">ApiKeys</h2>
          <div className="text-xs text-neutral-500">{loading ? "Loading…" : `${keys.length} key(s)`}</div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left font-medium px-4 py-3">Prefix</th>
                <th className="text-left font-medium px-4 py-3">Label</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Last used</th>
                <th className="text-left font-medium px-4 py-3">Created</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={6}>
                    Keine ApiKeys gefunden.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs">{k.prefix}</td>
                    <td className="px-4 py-3">{k.label}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cls(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                          k.status === "ACTIVE"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-neutral-100 border-neutral-200 text-neutral-700"
                        )}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmt(k.lastUsedAt)}</td>
                    <td className="px-4 py-3">{fmt(k.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
                        onClick={() => revokeKey(k.id)}
                        disabled={k.status !== "ACTIVE" || loading}
                        type="button"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-neutral-500">
          Klartext-Key wird nur einmal nach Erstellung angezeigt. DEV: wird in{" "}
          <span className="font-mono">{DEV_MOBILE_KEY_STORAGE}</span> gespeichert.
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Devices</h2>
          <div className="text-xs text-neutral-500">{loading ? "Loading…" : `${devices.length} device(s)`}</div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-left font-medium px-4 py-3">Last seen</th>
                <th className="text-left font-medium px-4 py-3">Assigned</th>
                <th className="text-left font-medium px-4 py-3">ApiKey</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={6}>
                    Keine Devices gefunden.
                  </td>
                </tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-4 py-3">{d.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cls(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                          d.status === "ACTIVE"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-neutral-100 border-neutral-200 text-neutral-700"
                        )}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmt(d.lastSeenAt)}</td>
                    <td className="px-4 py-3">{d.assignedFormsCount}</td>
                    <td className="px-4 py-3 font-mono text-xs">{d.apiKeyPrefix}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50"
                        onClick={() => openDevice(d.id)}
                        type="button"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border">
            <div className="p-4 border-b">
              <div className="text-lg font-semibold">Create ApiKey</div>
              <div className="text-sm text-neutral-500">Token wird einmalig angezeigt.</div>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Label</label>
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                  placeholder="z.B. Messe iPad #1"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="createDevice"
                  type="checkbox"
                  checked={createDevice}
                  onChange={(e) => setCreateDevice(e.target.checked)}
                />
                <label htmlFor="createDevice" className="text-sm">
                  Create device (empfohlen)
                </label>
              </div>

              {createDevice ? (
                <div>
                  <label className="text-sm font-medium">Device name</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={createDeviceName}
                    onChange={(e) => setCreateDeviceName(e.target.value)}
                  />
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={() => setCreateOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                onClick={() => createKey()}
                disabled={loading}
                type="button"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tokenOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-lg border">
            <div className="p-4 border-b">
              <div className="text-lg font-semibold">One-time ApiKey</div>
              <div className="text-sm text-neutral-500">
                Dieser Klartext-Key wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar.
              </div>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-md border bg-neutral-50 p-3 font-mono text-xs break-all">
                {oneTimeToken ?? "—"}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                  onClick={async () => {
                    if (!oneTimeToken) return;
                    const ok = await copy(oneTimeToken);
                    setTokenCopied(ok);
                  }}
                  type="button"
                >
                  Copy
                </button>
                <button
                  className="rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90"
                  onClick={() => openDemoCapture()}
                  type="button"
                >
                  Open Demo Capture
                </button>
                <div className="text-xs text-neutral-500">
                  {tokenCopied ? "Copied." : "DEV: Token wurde auch in localStorage gesetzt."}
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex items-center justify-end">
              <button
                className="rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90"
                onClick={() => setTokenOpen(false)}
                type="button"
              >
                I stored it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="w-full max-w-xl bg-white border-l shadow-xl overflow-y-auto">
            <div className="p-4 border-b flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">Manage Device</div>
                <div className="text-sm text-neutral-500">
                  {deviceDetail ? (
                    <>
                      ApiKey: <span className="font-mono text-xs">{deviceDetail.device.apiKey.prefix}</span>
                    </>
                  ) : (
                    "Loading…"
                  )}
                </div>
              </div>
              <button
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-6">
              <div className="space-y-3">
                <div className="text-sm font-semibold">Device</div>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Status</label>
                    <select
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      value={statusValue}
                      onChange={(e) => setStatusValue(e.target.value as DeviceStatus)}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="DISABLED">DISABLED</option>
                    </select>
                  </div>

                  <div className="text-xs text-neutral-500">
                    Last seen: {deviceDetail ? fmt(deviceDetail.device.lastSeenAt) : "—"} · Last used:{" "}
                    {deviceDetail ? fmt(deviceDetail.device.apiKey.lastUsedAt) : "—"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                    onClick={() => saveDeviceMeta()}
                    disabled={loading || !drawerDeviceId}
                    type="button"
                  >
                    Save device
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Assignments (Replace)</div>
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={showAllForms}
                        onChange={async (e) => {
                          const v = e.target.checked;
                          setShowAllForms(v);
                          await loadForms(v);
                        }}
                      />
                      Show drafts/archived
                    </label>
                  </div>
                </div>

                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Search forms…"
                  value={searchForms}
                  onChange={(e) => setSearchForms(e.target.value)}
                />

                <div className="max-h-80 overflow-y-auto rounded-lg border">
                  {filteredForms.length === 0 ? (
                    <div className="p-3 text-sm text-neutral-500">Keine Forms gefunden.</div>
                  ) : (
                    <ul className="divide-y">
                      {filteredForms.map((f) => {
                        const checked = !!selectedFormIds[f.id];
                        return (
                          <li key={f.id} className="p-3 flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedFormIds((prev) => ({ ...prev, [f.id]: e.target.checked }))
                              }
                            />
                            <div className="flex-1">
                              <div className="text-sm">{f.name}</div>
                              <div className="text-xs text-neutral-500">
                                {f.status} · {fmt(f.createdAt)} · <span className="font-mono">{f.id}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md bg-black text-white px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                    onClick={() => saveAssignments()}
                    disabled={loading || !drawerDeviceId}
                    type="button"
                  >
                    Save assignments
                  </button>
                  <div className="text-xs text-neutral-500">
                    Replace-Strategy: bestehende Assignments werden komplett ersetzt.
                  </div>
                </div>

                {deviceDetail ? (
                  <div className="text-xs text-neutral-500">Currently assigned: {deviceDetail.assignedForms.length}</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
