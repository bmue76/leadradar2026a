"use client";

import * as React from "react";
import Image from "next/image";
import styles from "./AuthShell.module.css";

type AuthShellProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true">
            <Image src="/brand/leadradar-icon.png" alt="" width={34} height={34} priority />
          </div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>LEADRADAR</div>
            <div className={styles.brandSub}>Admin Console</div>
          </div>
        </div>

        <div className={styles.header}>
          {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
          <h1 className={styles.title}>{title}</h1>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
