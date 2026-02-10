export type ApiOk<T> = { ok: true; data: T; traceId?: string };
export type ApiErr = { ok: false; error: { code: string; message: string; details?: unknown }; traceId?: string };
export type ApiResp<T> = ApiOk<T> | ApiErr;

async function apiJson<T>(url: string, init?: RequestInit): Promise<ApiResp<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const text = await res.text();

    if (!ct.includes("application/json")) {
      return {
        ok: false,
        error: {
          code: `HTTP_${res.status}`,
          message: `${res.status} ${res.statusText} — non-JSON response from ${url}`,
          details: { preview: text.slice(0, 180) },
        },
      };
    }

    return JSON.parse(text) as ApiResp<T>;
  } catch (e) {
    return { ok: false, error: { code: "NETWORK", message: (e as Error)?.message ?? "Network error" } };
  }
}

export async function deleteFormApi(formId: string): Promise<ApiResp<{ deleted: true }>> {
  // primär (REST):
  const url1 = `/api/admin/v1/forms/${formId}`;
  const r1 = await apiJson<{ deleted: true }>(url1, { method: "DELETE" });
  if (r1.ok) return r1;

  // optionaler Fallback, falls dein Backend so gebaut ist:
  const url2 = `/api/admin/v1/forms/${formId}/delete`;
  const r2 = await apiJson<{ deleted: true }>(url2, { method: "POST", body: JSON.stringify({}) });
  if (r2.ok) return r2;

  return r1;
}
