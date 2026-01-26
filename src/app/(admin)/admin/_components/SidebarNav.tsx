"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AdminShell.module.css";

type Item = {
  href: string;
  label: string;
  icon: string;
};

const items: Item[] = [
  { href: "/admin", label: "Dashboard", icon: "🏠" },
  { href: "/admin/forms", label: "Forms", icon: "🧩" },
  { href: "/admin/leads", label: "Leads", icon: "👥" },
  { href: "/admin/exports", label: "Exports", icon: "⬇️" },
  { href: "/admin/recipients", label: "Recipients", icon: "📨" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin Navigation">
      <div className={styles.navGroupLabel}>Workspace</div>
      {items.map((it) => {
        const active = isActive(pathname, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => onNavigate?.()}
            className={[styles.navItem, active ? styles.navItemActive : ""].join(" ")}
          >
            <span className={styles.navIcon} aria-hidden="true">
              {it.icon}
            </span>
            <span className={styles.navText}>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
