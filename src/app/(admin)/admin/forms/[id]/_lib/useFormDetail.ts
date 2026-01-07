"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetchJson } from "../../../_lib/adminFetch";
import type { ApiResponse, FormDetail } from "../formDetail.types";

type InlineError = { message: string; code?: string; traceId?: string } | null;

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getErrMessage(res: unknown): { message: string; code?: string; traceId?: string } {
  if (isRecord(res)) {
    const traceId = typeof res.traceId === "string" ? res.traceId : undefined;

    if (res.ok === false && isRecord(res.error)) {
      const msg = typeof res.error.message === "string" ? res.error.message : "Request failed.";
      const code = typeof res.error.code === "string" ? res.error.code : undefined;
      return { message: msg, code, traceId };
    }

    const msg2 =
      typeof res.message === "string"
        ? res.message
        : typeof res.error === "string"
          ? res.error
          : "Request failed.";
    return { message: msg2, traceId };
  }

  return { message: "Request failed." };
}

async function api<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    return (await adminFetchJson(path, init)) as ApiResponse<T>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Network error.";
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: msg },
      traceId: "no-trace-id",
    };
  }
}

export function useFormDetail(formId: string) {
  const mountedRef = useRef(true);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<InlineError>(null);
  const [form, setForm] = useState<FormDetail | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);

    const res = await api<FormDetail>(`/api/admin/v1/forms/${formId}`);

    if (!mountedRef.current) return;

    if (!res.ok) {
      setForm(null);
      const err = getErrMessage(res);
      setLoadErr({ message: err.message, code: err.code, traceId: err.traceId });
      setLoading(false);
      return;
    }

    setForm(res.data);
    setLoadErr(null);
    setLoading(false);
  }, [formId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { loading, loadErr, form, setForm, refresh };
}
