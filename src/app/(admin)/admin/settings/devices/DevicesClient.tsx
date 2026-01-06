"use client";

import { useMemo, useState, useEffect } from "react";

type ApiOk<T> = { ok: true; data: T; traceId: string };
type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId: string };

type MobileKey = {
  id: string;
  name: string;
  prefix: string;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};

type AssignedForm = { id: string; name: string; status: string };

type MobileDevice = {
  id: string;
  name: string;
  status: "ACTIVE" | "DISABLED";
  lastSeenAt?: string | null;
  apiKeyId: string;
  apiKeyPrefix: string;
  assignedForms: AssignedForm[];
};

type AdminForm = { id: string; name: string; status: string; description?: string | null };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];

  if (isRecord(v)) {
    const candidates = ["items", "data", "forms", "rows"];
    for (const k of candidates) {
      const maybe = v[k];
      if (Array.isArray(maybe)) return maybe as T[];
    }
  }

  return [];
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json()) as ApiOk<T> | ApiErr;

  if (!res.ok || !json.ok) {
    const e = json.ok ? { traceId: "n/a", error: { code: "INTERNAL", message: "Unknown error" } } : json;
    throw new Error(`${e.error.code}: ${e.error.message} (traceId: ${e.traceId})`);
  }

  return json.data;
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  const json = (await res.json()) as ApiOk<T> | ApiErr;

  if (!res.ok || !json.ok) {
    const e = json.ok ? { traceId: "n/a", error: { code: "INTERNAL", message: "Unknown error" } } : json;
    throw new Error(`${e.error.code}: ${e.error.message} (traceId: ${e.traceId})`);
  }

  return json.data;
}

async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
  const json = (await res.json()) as ApiOk<T> | ApiErr;

  if (!res.ok || !json.ok) {
    const e = json.ok ? { traceId: "n/a", error: { code: "INTERNAL", message: "Unknown error" } } : json;
    throw new Error(`${e.error.code}: ${e.error.message} (traceId: ${e.traceId})`);
  }

  return json.data;
}

function fmt(dt?: string | null) {
  if (!dt) return "–";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

export default function DevicesClient() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [keys, setKeys] = useState<MobileKey[]>([]);
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [forms, setForms] = useState<AdminForm[]>([]);

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDeviceName, setNewKeyDeviceName] = useState("");
  const [createdKeyOnce, setCreatedKeyOnce] = useState<{ prefix: string; apiKey: string; id: string } | null>(null);

  const activeKeys = useMemo(() => keys.filter((k) => k.status === "ACTIVE"), [keys]);
  const activeForms = useMemo(() => forms.filter((f) => f.status === "ACTIVE"), [forms]);

  async function reloadAll() {
    setLoading(true);
    setErr(null);

    try {
      const [kRaw, dRaw, fRaw] = await Promise.all([
        apiGet<unknown>("/api/admin/v1/mobile/keys"),
        apiGet<unknown>("/api/admin/v1/mobile/devices"),
        apiGet<unknown>("/api/admin/v1/forms"),
      ]);

      const k = normalizeArray<MobileKey>(kRaw);
      const d = normalizeArray<MobileDevice>(dRaw);
      const f = normalizeArray<AdminForm>(fRaw);

      // if shapes are unexpected, at least show a helpful error
      if (!Array.isArray(k) || !Array.isArray(d) || !Array.isArray(f)) {
        throw new Error("Unexpected response shape from admin endpoints.");
      }

      setKeys(k);
      setDevices(d);
      setForms(f);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  async function createKey() {
    setErr(null);
    setCreatedKeyOnce(null);

    try {
      const res = await apiPost<{
        id: string;
        prefix: string;
        apiKey: string;
        createdAt: string;
        deviceId?: string | null;
      }>("/api/admin/v1/mobile/keys", { name: newKeyName, deviceName: newKeyDeviceName || undefined });

      setCreatedKeyOnce({ id: res.id, prefix: res.prefix, apiKey: res.apiKey });
      setNewKeyName("");
      setNewKeyDeviceName("");
      await reloadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function revokeKey(id: string) {
    setErr(null);
    try {
      await apiPost<{ id: string; status: "REVOKED" }>(`/api/admin/v1/mobile/keys/${id}/revoke`);
      await reloadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function createDevice(name: string, apiKeyId: string) {
    setErr(null);
    try {
      await apiPost("/api/admin/v1/mobile/devices", { name, apiKeyId });
      await reloadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveAssignments(deviceId: string, formIds: string[]) {
    setErr(null);
    try {
      await apiPut(`/api/admin/v1/mobile/devices/${deviceId}/forms`, { formIds });
      await reloadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  if (loading) return <div className="text-sm text-neutral-600">Loading…</div>;

  return (
    <div className="space-y-8">
      {err ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div> : null}

      <section className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Create API Key</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-neutral-600">Key Name</label>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Messe iPad 1"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-neutral-600">Optional: Create Device (name)</label>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              value={newKeyDeviceName}
              onChange={(e) => setNewKeyDeviceName(e.target.value)}
              placeholder="e.g. iPad Eingang"
            />
          </div>

          <div className="flex items-end">
            <button
              className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
              disabled={!newKeyName.trim()}
              onClick={createKey}
            >
              Create
            </button>
          </div>
        </div>

        {createdKeyOnce ? (
          <div className="rounded border bg-neutral-50 p-3 text-sm space-y-2">
            <div className="font-medium">API Key (showing once)</div>
            <div className="text-xs text-neutral-600">Prefix: {createdKeyOnce.prefix}</div>
            <div className="flex gap-2">
              <code className="flex-1 overflow-auto rounded border bg-white p-2">{createdKeyOnce.apiKey}</code>
              <button className="rounded border px-3 py-2 text-sm" onClick={() => copy(createdKeyOnce.apiKey)}>
                Copy
              </button>
            </div>
            <div className="text-xs text-neutral-600">Speichere den Key jetzt – danach ist nur noch Prefix/Meta sichtbar.</div>
          </div>
        ) : null}
      </section>

      <section className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">API Keys</h2>

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Prefix</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Last used</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b">
                  <td className="py-2 pr-4">{k.name}</td>
                  <td className="py-2 pr-4">
                    <code>{k.prefix}</code>
                  </td>
                  <td className="py-2 pr-4">{k.status}</td>
                  <td className="py-2 pr-4">{fmt(k.createdAt)}</td>
                  <td className="py-2 pr-4">{fmt(k.lastUsedAt ?? null)}</td>
                  <td className="py-2 pr-4">
                    {k.status === "ACTIVE" ? (
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => revokeKey(k.id)}>
                        Revoke
                      </button>
                    ) : (
                      <span className="text-xs text-neutral-500">–</span>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 ? (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={6}>
                    No keys yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border p-4 space-y-3">
        <h2 className="font-semibold">Devices</h2>

        <CreateDeviceBox activeKeys={activeKeys} onCreate={createDevice} />

        <div className="space-y-4">
          {devices.map((d) => (
            <DeviceCard
              key={`${d.id}:${(d.assignedForms ?? []).map((f) => f.id).sort().join(",")}`}
              device={d}
              allForms={activeForms}
              onSave={(formIds) => saveAssignments(d.id, formIds)}
            />
          ))}
          {devices.length === 0 ? <div className="text-sm text-neutral-600">No devices yet.</div> : null}
        </div>
      </section>

      <div className="text-xs text-neutral-600">
        Rate limit: best-effort in-memory (Phase 1). In Serverless/Multi-Instance später Redis/Upstash.
      </div>
    </div>
  );
}

function CreateDeviceBox(props: { activeKeys: MobileKey[]; onCreate: (name: string, apiKeyId: string) => void }) {
  const [name, setName] = useState("");
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>("");

  const firstKeyId = props.activeKeys[0]?.id ?? "";
  const effectiveKeyId = selectedApiKeyId || firstKeyId;

  return (
    <div className="rounded border bg-neutral-50 p-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-neutral-600">Device Name</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm bg-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. iPad Stand"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-neutral-600">API Key</label>
          <select
            className="w-full rounded border px-3 py-2 text-sm bg-white"
            value={effectiveKeyId}
            onChange={(e) => setSelectedApiKeyId(e.target.value)}
          >
            {props.activeKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name} ({k.prefix})
              </option>
            ))}
          </select>

          {props.activeKeys.length === 0 ? <div className="text-xs text-neutral-600">Create an ACTIVE API key first.</div> : null}
        </div>

        <div className="flex items-end">
          <button
            className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
            disabled={!name.trim() || !effectiveKeyId}
            onClick={() => props.onCreate(name.trim(), effectiveKeyId)}
          >
            Create device
          </button>
        </div>
      </div>
    </div>
  );
}

function DeviceCard(props: { device: MobileDevice; allForms: AdminForm[]; onSave: (formIds: string[]) => void }) {
  const { device } = props;

  const [selected, setSelected] = useState<Set<string>>(() => new Set((device.assignedForms ?? []).map((f) => f.id)));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="rounded border p-4 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <div className="font-medium">{device.name}</div>
          <div className="text-xs text-neutral-600">
            Status: {device.status} · Key prefix: <code>{device.apiKeyPrefix}</code> · Last seen: {fmt(device.lastSeenAt ?? null)}
          </div>
        </div>

        <button className="rounded border px-3 py-2 text-sm" onClick={() => props.onSave(selectedIds)}>
          Save assignments
        </button>
      </div>

      <div className="text-sm font-medium">Assigned ACTIVE forms</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {props.allForms.map((f) => (
          <label key={f.id} className="flex items-center gap-2 rounded border px-3 py-2">
            <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
            <span className="text-sm">{f.name}</span>
            <span className="ml-auto text-xs text-neutral-500">{f.status}</span>
          </label>
        ))}
        {props.allForms.length === 0 ? <div className="text-sm text-neutral-600">No ACTIVE forms available.</div> : null}
      </div>
    </div>
  );
}
