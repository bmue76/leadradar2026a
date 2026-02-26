import { prisma } from "@/lib/prisma";

export type StatsCompareMode = "none" | "previous";

export type StatsEventListItem = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  startsAt: string | null;
  endsAt: string | null;
};

export type StatsQuery = {
  tenantId: string;
  eventId: string;
  from: Date;
  to: Date;
  compare: StatsCompareMode;
  includeDeleted: boolean;
};

type TrafficRow = { hourStart: Date; leads: number };
type DeviceRow = { deviceId: string | null; leads: number };
type TopFormRow = { formId: string; name: string; count: number };
type TopInterestRow = { label: string; count: number };

const TZ = "Europe/Zurich";

function clampToInt(n: unknown): number {
  if (typeof n === "number") return Math.trunc(n);
  if (typeof n === "bigint") return Number(n);
  return Number(n ?? 0);
}

function formatPeakLabel(hourStartIso: string): string {
  const d = new Date(hourStartIso);
  const d2 = new Date(d.getTime() + 60 * 60 * 1000);

  const fmt = new Intl.DateTimeFormat("de-CH", { hour: "2-digit", hour12: false, timeZone: TZ });
  const h1 = fmt.format(d);
  const h2 = fmt.format(d2);
  return `${h1}–${h2} Uhr`;
}

function hoursBetween(from: Date, to: Date): number {
  const ms = Math.max(1, to.getTime() - from.getTime());
  return ms / (60 * 60 * 1000);
}

function fillHourlyBuckets(from: Date, to: Date, rows: TrafficRow[], compareShiftMs: number | null, compareRows?: TrafficRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.hourStart.toISOString(), clampToInt(r.leads));

  const compareMap = new Map<string, number>();
  if (compareRows) for (const r of compareRows) compareMap.set(r.hourStart.toISOString(), clampToInt(r.leads));

  const start = new Date(from);
  start.setMinutes(0, 0, 0);
  const end = new Date(to);
  end.setMinutes(0, 0, 0);

  const out: Array<{ hourStart: string; leads: number; leadsCompare?: number }> = [];

  for (let t = start.getTime(); t <= end.getTime(); t += 60 * 60 * 1000) {
    const iso = new Date(t).toISOString();
    const leads = map.get(iso) ?? 0;

    if (compareShiftMs != null) {
      const compareIso = new Date(t - compareShiftMs).toISOString();
      const leadsCompare = compareMap.get(compareIso) ?? 0;
      out.push({ hourStart: iso, leads, leadsCompare });
    } else {
      out.push({ hourStart: iso, leads });
    }
  }

  return out;
}

export async function listEventsForStatistics(tenantId: string): Promise<StatsEventListItem[]> {
  const events = await prisma.event.findMany({
    where: { tenantId, status: { in: ["ACTIVE", "ARCHIVED"] } },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
    select: { id: true, name: true, status: true, startsAt: true, endsAt: true },
  });

  return events.map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    startsAt: e.startsAt ? e.startsAt.toISOString() : null,
    endsAt: e.endsAt ? e.endsAt.toISOString() : null,
  }));
}

export async function getAdminStatistics(q: StatsQuery) {
  const { tenantId, eventId, from, to, compare, includeDeleted } = q;

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId },
    select: { id: true, name: true, status: true },
  });

  if (!event) return { notFound: true as const };

  const durationMs = Math.max(1, to.getTime() - from.getTime());
  const compareShiftMs = compare === "previous" ? durationMs : null;

  const baseWhereSql = `
    l."tenantId" = $1
    AND l."eventId" = $2
    AND l."capturedAt" >= $3
    AND l."capturedAt" < $4
    ${includeDeleted ? "" : 'AND l."isDeleted" = false'}
  `;

  const leadsTotal = await prisma.lead.count({
    where: { tenantId, eventId, capturedAt: { gte: from, lt: to }, ...(includeDeleted ? {} : { isDeleted: false }) },
  });

  let compareTotal: number | null = null;
  if (compareShiftMs != null) {
    const cf = new Date(from.getTime() - compareShiftMs);
    const ct = new Date(from.getTime());
    compareTotal = await prisma.lead.count({
      where: { tenantId, eventId, capturedAt: { gte: cf, lt: ct }, ...(includeDeleted ? {} : { isDeleted: false }) },
    });
  }

  const deltaPct =
    compareTotal != null && compareTotal > 0 ? Math.round(((leadsTotal - compareTotal) / compareTotal) * 1000) / 10 : null;

  const trafficRows = (await prisma.$queryRawUnsafe(
    `
    SELECT date_trunc('hour', l."capturedAt") AS "hourStart",
           COUNT(*)::int AS "leads"
    FROM "Lead" l
    WHERE ${baseWhereSql}
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    tenantId,
    eventId,
    from,
    to
  )) as TrafficRow[];

  let trafficCompareRows: TrafficRow[] | undefined;
  if (compareShiftMs != null) {
    const cf = new Date(from.getTime() - compareShiftMs);
    const ct = new Date(from.getTime());
    trafficCompareRows = (await prisma.$queryRawUnsafe(
      `
      SELECT date_trunc('hour', l."capturedAt") AS "hourStart",
             COUNT(*)::int AS "leads"
      FROM "Lead" l
      WHERE
        l."tenantId" = $1
        AND l."eventId" = $2
        AND l."capturedAt" >= $3
        AND l."capturedAt" < $4
        ${includeDeleted ? "" : 'AND l."isDeleted" = false'}
      GROUP BY 1
      ORDER BY 1 ASC
      `,
      tenantId,
      eventId,
      cf,
      ct
    )) as TrafficRow[];
  }

  const trafficByHour = fillHourlyBuckets(from, to, trafficRows, compareShiftMs, trafficCompareRows);

  let peakHourLabel: string | null = null;
  let peakMax = -1;
  for (const p of trafficByHour) {
    if (p.leads > peakMax) {
      peakMax = p.leads;
      peakHourLabel = formatPeakLabel(p.hourStart);
    }
  }

  const deviceRows = (await prisma.$queryRawUnsafe(
    `
    SELECT
      COALESCE(l."capturedByDeviceId", l."meta"->>'deviceId', l."meta"->>'mobileDeviceId') AS "deviceId",
      COUNT(*)::int AS "leads"
    FROM "Lead" l
    WHERE ${baseWhereSql}
    GROUP BY 1
    ORDER BY "leads" DESC
    LIMIT 10
    `,
    tenantId,
    eventId,
    from,
    to
  )) as DeviceRow[];

  const deviceIds = deviceRows.map((r) => r.deviceId).filter((x): x is string => !!x);

  const devicesMap = new Map<string, { id: string; name: string }>();
  if (deviceIds.length > 0) {
    const devices = await prisma.mobileDevice.findMany({
      where: { tenantId, id: { in: deviceIds } },
      select: { id: true, name: true },
    });
    for (const d of devices) devicesMap.set(d.id, { id: d.id, name: d.name });
  }

  const durHours = hoursBetween(from, to);
  const devicesRanking = deviceRows
    .filter((r) => r.deviceId)
    .map((r) => {
      const id = r.deviceId!;
      const label = devicesMap.get(id)?.name ?? "Unbekanntes Gerät";
      const leads = clampToInt(r.leads);
      const leadsPerHourAvg = Math.round((leads / Math.max(1, durHours)) * 10) / 10;
      return { deviceId: id, label, leadsTotal: leads, leadsPerHourAvg };
    });

  const now = new Date();
  const liveAllowed = event.status === "ACTIVE";
  let devicesActiveCount = 0;

  if (liveAllowed) {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const rows = (await prisma.$queryRawUnsafe(
      `
      SELECT
        COALESCE(l."capturedByDeviceId", l."meta"->>'deviceId', l."meta"->>'mobileDeviceId') AS "deviceId"
      FROM "Lead" l
      WHERE
        l."tenantId" = $1
        AND l."eventId" = $2
        AND l."capturedAt" >= $3
        ${includeDeleted ? "" : 'AND l."isDeleted" = false'}
      GROUP BY 1
      `,
      tenantId,
      eventId,
      since
    )) as Array<{ deviceId: string | null }>;

    devicesActiveCount = rows.filter((r) => r.deviceId).length;
  } else {
    devicesActiveCount = deviceRows.filter((r) => r.deviceId).length;
  }

  const cardCountRow = (await prisma.$queryRawUnsafe(
    `
    SELECT COUNT(DISTINCT l."id")::int AS "count"
    FROM "Lead" l
    JOIN "LeadAttachment" a ON a."leadId" = l."id" AND a."tenantId" = l."tenantId"
    WHERE
      ${baseWhereSql}
      AND a."type" = 'BUSINESS_CARD_IMAGE'
    `,
    tenantId,
    eventId,
    from,
    to
  )) as Array<{ count: number }>;
  const cardCount = clampToInt(cardCountRow[0]?.count ?? 0);

  const notesCountRow = (await prisma.$queryRawUnsafe(
    `
    SELECT COUNT(*)::int AS "count"
    FROM "Lead" l
    WHERE
      ${baseWhereSql}
      AND (
        l."hasNotes" = true
        OR NULLIF(COALESCE(l."meta"->>'notes', l."meta"->>'note', l."values"->>'notes', l."values"->>'note'), '') IS NOT NULL
      )
    `,
    tenantId,
    eventId,
    from,
    to
  )) as Array<{ count: number }>;
  const notesCount = clampToInt(notesCountRow[0]?.count ?? 0);

  const qualifiedCountRow = (await prisma.$queryRawUnsafe(
    `
    SELECT COUNT(*)::int AS "count"
    FROM "Lead" l
    WHERE
      ${baseWhereSql}
      AND (
        l."isQualified" = true
        OR lower(COALESCE(l."meta"->>'isQualified', l."meta"->>'qualified', l."values"->>'isQualified', l."values"->>'qualified', '')) IN ('true','1','yes','ja')
      )
    `,
    tenantId,
    eventId,
    from,
    to
  )) as Array<{ count: number }>;
  const qualifiedCount = clampToInt(qualifiedCountRow[0]?.count ?? 0);

  const pct = (num: number, den: number) => (den <= 0 ? 0 : Math.round((num / den) * 100));
  const cardPct = pct(cardCount, leadsTotal);
  const notesPct = pct(notesCount, leadsTotal);
  const qualifiedPct = pct(qualifiedCount, leadsTotal);

  const funnel = [
    { label: "Erfasst", count: leadsTotal },
    { label: "Mit Visitenkarte", count: cardCount },
    { label: "Qualifiziert", count: qualifiedCount },
  ];

  const topFormsRows = (await prisma.$queryRawUnsafe(
    `
    SELECT l."formId" AS "formId", f."name" AS "name", COUNT(*)::int AS "count"
    FROM "Lead" l
    JOIN "Form" f ON f."id" = l."formId" AND f."tenantId" = l."tenantId"
    WHERE ${baseWhereSql}
    GROUP BY 1,2
    ORDER BY "count" DESC
    LIMIT 5
    `,
    tenantId,
    eventId,
    from,
    to
  )) as Array<TopFormRow>;

  const topInterestsRows = (await prisma.$queryRawUnsafe(
    `
    WITH select_fields AS (
      SELECT ff."formId", ff."key", ff."type"
      FROM "FormField" ff
      WHERE
        ff."tenantId" = $1
        AND ff."isActive" = true
        AND ff."type" IN ('SINGLE_SELECT','MULTI_SELECT')
    ),
    singles AS (
      SELECT (l."values"->>sf."key") AS val
      FROM "Lead" l
      JOIN select_fields sf ON sf."formId" = l."formId" AND sf."type" = 'SINGLE_SELECT'
      WHERE
        ${baseWhereSql}
        AND (l."values" ? sf."key")
    ),
    multis AS (
      SELECT jsonb_array_elements_text(l."values"->sf."key") AS val
      FROM "Lead" l
      JOIN select_fields sf ON sf."formId" = l."formId" AND sf."type" = 'MULTI_SELECT'
      WHERE
        ${baseWhereSql}
        AND jsonb_typeof(l."values"->sf."key") = 'array'
    )
    SELECT val AS "label", COUNT(*)::int AS "count"
    FROM (
      SELECT val FROM singles WHERE val IS NOT NULL AND val <> ''
      UNION ALL
      SELECT val FROM multis WHERE val IS NOT NULL AND val <> ''
    ) t
    GROUP BY 1
    ORDER BY "count" DESC
    LIMIT 12
    `,
    tenantId,
    eventId,
    from,
    to
  )) as Array<TopInterestRow>;

  return {
    notFound: false as const,
    generatedAt: new Date().toISOString(),
    event: { id: event.id, name: event.name, status: event.status },
    range: { from: from.toISOString(), to: to.toISOString(), compareLabel: "" },
    headline: {
      leadsTotal,
      deltaPct,
      qualifiedPct,
      devicesActiveCount,
      peakHourLabel: peakHourLabel ?? "—",
      liveAllowed,
    },
    traffic: { byHour: trafficByHour },
    devices: { ranking: devicesRanking },
    insights: {
      topInterests: topInterestsRows.map((r) => ({ label: r.label, count: clampToInt(r.count) })),
      topForms: topFormsRows.map((r) => ({ formId: r.formId, name: r.name, count: clampToInt(r.count) })),
    },
    quality: { cardPct, notesPct, qualifiedPct, funnel },
  };
}
