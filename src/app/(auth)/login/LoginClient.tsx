"use client";

import { useSearchParams } from "next/navigation";

// TODO:
// 1) Nimm den bisherigen Inhalt aus deiner alten login/page.tsx
// 2) Füge ihn hier ein (inkl. aller Imports/Logik/UI)
// 3) Wichtig: useSearchParams() bleibt hier drin – NICHT mehr in page.tsx

export default function LoginClient() {
  const searchParams = useSearchParams();

  // Minimaler Platzhalter, damit der Build sicher läuft,
  // falls du den Inhalt erst gleich rüberkopierst:
  const reason = searchParams.get("reason");

  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Login</h1>
      {reason ? <p style={{ opacity: 0.75 }}>Hinweis: {reason}</p> : null}
      <p style={{ opacity: 0.75 }}>Bitte Login UI/Logik aus der bisherigen Page hier einfügen.</p>
    </main>
  );
}
