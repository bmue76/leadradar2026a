import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api";
import { getApiBaseUrl } from "../../lib/env";
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

type HomeState =
  | { status: "loading" }
  | { status: "ready"; activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday }
  | { status: "needsProvision" }
  | { status: "error"; message: string; lastKnown?: { activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday } };

function unwrapOk<T>(res: any): T {
  if (res && typeof res === "object" && "ok" in res) {
    if (res.ok) return (res.data ?? res) as T;
    const code = res?.error?.code;
    const msg = res?.error?.message ?? "Request failed.";
    const err: any = new Error(msg);
    err.code = code;
    throw err;
  }
  return res as T;
}

export function useHomeData() {
  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const [state, setState] = useState<HomeState>({ status: "loading" });

  const cacheKey = "home:v1";
  const cached = cacheGet<{ activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday }>(cacheKey, 15_000);

  useEffect(() => {
    if (cached) {
      setState({ status: "ready", ...cached });
    }
  }, [cached]);

  const refresh = useCallback(async () => {
    try {
      if (!cached) setState({ status: "loading" });

      const tzOffsetMinutes = new Date().getTimezoneOffset();

      const [evRes, formsRes, statsRes] = await Promise.all([
        apiFetch(`${baseUrl}/api/mobile/v1/events/active`, { method: "GET" }),
        apiFetch(`${baseUrl}/api/mobile/v1/forms`, { method: "GET" }),
        apiFetch(`${baseUrl}/api/mobile/v1/stats/me?range=today&tzOffsetMinutes=${encodeURIComponent(String(tzOffsetMinutes))}`, {
          method: "GET",
        }),
      ]);

      const evData = unwrapOk<{ activeEvent: ActiveEvent | null }>(evRes);
      const formsData = unwrapOk<AssignedForm[]>(formsRes);

      // stats/me returns an object (not wrapped list)
      const statsData = unwrapOk<any>(statsRes);
      const stats: MyStatsToday = {
        leadsToday: Number(statsData?.leadsToday ?? 0),
        avgPerHour: Number(statsData?.avgPerHour ?? 0),
        pendingAttachments: Number(statsData?.pendingAttachments ?? 0),
        todayHourlyBuckets: Array.isArray(statsData?.todayHourlyBuckets) ? statsData.todayHourlyBuckets : [],
        lastLeadAt: statsData?.lastLeadAt ?? null,
      };

      const payload = { activeEvent: evData.activeEvent ?? null, forms: Array.isArray(formsData) ? formsData : [], stats };
      cacheSet(cacheKey, payload);
      setState({ status: "ready", ...payload });
    } catch (e: any) {
      const code = e?.code ?? "";
      const msg = e?.message ?? "Network error.";

      // treat auth issues as "needs provisioning"
      if (code === "UNAUTHENTICATED" || code === "UNAUTHORIZED") {
        setState({ status: "needsProvision" });
        return;
      }

      const lastKnown = cacheGet<{ activeEvent: ActiveEvent | null; forms: AssignedForm[]; stats: MyStatsToday }>(cacheKey, 24 * 60 * 60_000);
      setState({ status: "error", message: msg, lastKnown });
    }
  }, [baseUrl, cached]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, refresh };
}
