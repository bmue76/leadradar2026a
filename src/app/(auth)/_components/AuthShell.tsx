import * as React from "react";
import BrandHeader from "./BrandHeader";
import styles from "./AuthShell.module.css";

type Props = {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export default function AuthShell({ title, subtitle, footer, children }: Props) {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <BrandHeader />
        </div>

        <div className={styles.headline}>
          <h1 className={styles.h1}>{title}</h1>
          {subtitle ? <p className={styles.sub}>{subtitle}</p> : null}
        </div>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </main>
  );
}
