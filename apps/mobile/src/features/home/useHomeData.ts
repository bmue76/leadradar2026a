import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "../../lib/api";
import { cacheGet, cacheSet } from "../../lib/swrCache";

export type ActiveEvent = {
  id: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
};

export type AssignedForm = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
};

export type MyStatsToday = {
  leadsToday: number;
  avgPerHour: number;
  pendingAttachments: number;
  todayHourlyBuckets?: Array<{ hour: number; count: number }>;
  lastLeadAt?: string | null;
};

type ApiErrorShape = {
  code: string;
  message: string;
  details?: unknown;
};

type ApiOk<T> = { ok: true; data: T; traceId?: string };
type ApiErr = { ok: false; error: ApiErrorShape; traceId?: string };
type ApiEnvelope<T> = ApiOk<T> | ApiErr;

class ApiError extends Error {
  public readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isEnvelope<T>(v: unknown): v is ApiEnvelope<T> {
  if (!isRecord(v)) return false;
  if (v.ok === true) return "data" in v;
  if (v.ok === false) return "error" in v;
  return false;
}

function unwrapOk<T>(v: unknown): T {
  if (isEnvelope<T>(v)) {
    if (v.ok) return v.data;
    throw new ApiError(v.error?.message ?? "Request failed.", v.error?.code);
  }
  return v as T; // tolerant fallback
}

type HomeState =
  | { status: "loading" }
  | { status: "ready"; activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday }
  | { status: "needsProvision" }
  | {
      status: "error";
      message: string;
      lastKnown?: { activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday };
    };

export function useHomeData() {
  const [state, setState] = useState<HomeState>({ status: "loading" });

  const cacheKey = "home:v1";
  const cached = cacheGet<{ activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday }>(
    cacheKey,
    15_000
  );

  useEffect(() => {
    if (cached) setState({ status: "ready", ...cached });
  }, [cached]);

  const refresh = useCallback(async () => {
    try {
      if (!cached) setState({ status: "loading" });

      const tzOffsetMinutes = new Date().getTimezoneOffset();

      const [evRes, formsRes, statsRes] = await Promise.all([
        apiFetch({ method: "GET", path: "/api/mobile/v1/events/active" }),
        apiFetch({ method: "GET", path: "/api/mobile/v1/forms" }),
        apiFetch({
          method: "GET",
          path: `/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`,
        }),
      ]);

      const evData = unwrapOk<{ activeEvent: ActiveEvent | null }>(evRes as unknown);
      const formsData = unwrapOk<AssignedForm[]>(formsRes as unknown);

      const statsRaw = unwrapOk<unknown>(statsRes as unknown);
      const statsObj = isRecord(statsRaw) ? statsRaw : {};

      const stats: MyStatsToday = {
        leadsToday: Number(statsObj.leadsToday ?? 0),
        avgPerHour: Number(statsObj.avgPerHour ?? 0),
        pendingAttachments: Number(statsObj.pendingAttachments ?? 0),
        todayHourlyBuckets: Array.isArray(statsObj.todayHourlyBuckets)
          ? (statsObj.todayHourlyBuckets as Array<{ hour: number; count: number }>)
          : [],
        lastLeadAt: typeof statsObj.lastLeadAt === "string" ? statsObj.lastLeadAt : null,
      };

      const payload = {
        activeEvent: evData.activeEvent ?? null,
        forms: Array.isArray(formsData) ? formsData : [],
        stats,
      };

      cacheSet(cacheKey, payload);
      setState({ status: "ready", ...payload });
    } catch (e: unknown) {
      const err = e instanceof ApiError ? e : null;
      const code = err?.code ?? "";
      const msg = e instanceof Error ? e.message : "Network error.";

      if (code === "UNAUTHENTICATED" || code === "UNAUTHORIZED") {
        setState({ status: "needsProvision" });
        return;
      }

      const lastKnown = cacheGet<{ activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday }>(
        cacheKey,
        24 * 60 * 60_000
      );
      setState({ status: "error", message: msg, lastKnown });
    }
  }, [cached]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, refresh };
}
