export default function ExecutiveReportPage() {
  const subject = encodeURIComponent("LeadRadar – Executive Bericht (Beta) Feedback");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            Executive Bericht
          </h1>

          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            Beta
          </span>
        </div>

        <p className="mt-2 text-sm text-slate-600">
          Automatisch generierter Management-Report mit Live-Performance-Analyse, Geräte-Ranking und strategischen Handlungsempfehlungen.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">Was Sie erwartet</h2>

        <ul className="mt-4 space-y-3 text-sm text-slate-700">
          {[
            "Mehrseitiger PDF-Bericht (2–5 A4 Seiten)",
            "Executive Summary für Geschäftsleitung",
            "Leads pro Stunde & Peak-Analyse",
            "Geräte-Ranking (Team/Stand)",
            "Interessen- & Qualitätsauswertung",
            "Strategische Empfehlungen für zukünftige Engagements",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="text-sm font-medium text-slate-900">Dieses Feature befindet sich in Vorbereitung.</div>
        <div className="mt-1 text-sm text-slate-600">
          Möchten Sie als Testkunde frühzeitig Zugriff erhalten?
        </div>

        <div className="mt-4">
          <a
            href={`mailto:support@leadradar.ch?subject=${subject}`}
            className={[
              "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium",
              "bg-[color:var(--lr-accent)] text-white",
              "hover:opacity-95",
              "focus:outline-none focus:ring-2 focus:ring-slate-200",
            ].join(" ")}
          >
            Feedback geben
          </a>
        </div>
      </section>
    </div>
  );
}
