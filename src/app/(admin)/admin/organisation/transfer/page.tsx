import Link from "next/link";
import type { ReactNode } from "react";

function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const styles =
    variant === "primary"
      ? "bg-foreground text-background hover:opacity-90"
      : "border bg-background text-foreground hover:bg-muted/60";
  return (
    <Link href={href} className={`${base} ${styles}`}>
      {children}
    </Link>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-background shadow-sm">
      <div className="px-5 py-4">
        <div className="text-base font-semibold tracking-tight">{title}</div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-muted/30 px-5 py-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default function MandantTransferPage() {
  const subject = encodeURIComponent("LeadRadar — Mandant übertragen (Beta) — Vormerkung");
  const body = encodeURIComponent(
    "Hallo LeadRadar Support\n\nBitte mich für die Testphase „Mandant übertragen“ vormerken.\n\nMandantenname:\nSlug:\nKontakt:\n\nDanke!"
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mandant übertragen</h1>
          <p className="mt-1 text-sm text-muted-foreground">Eigentümerwechsel (Beta-Scaffold).</p>
        </div>
        <ButtonLink href="/admin/organisation">Zur Übersicht</ButtonLink>
      </div>

      <div className="mb-4">
        <Callout title="Diese Funktion befindet sich in Vorbereitung.">
          Die Übertragung ist im MVP noch nicht aktiv. Sie sehen hier bereits die saubere Struktur und den Teaser für die Testphase.
        </Callout>
      </div>

      <Card title="Was bedeutet „Übertragen“?">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Übertragung des Tenant-Owners auf eine neue Person.</li>
          <li>Alle Rechte gehen an die neue Person über.</li>
          <li>Nicht rückgängig machbar.</li>
        </ul>

        <div className="flex items-center justify-end pt-5">
          <a
            className="inline-flex items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            href={`mailto:support@leadradar.ch?subject=${subject}&body=${body}`}
          >
            Für Testphase vormerken
          </a>
        </div>
      </Card>
    </div>
  );
}
