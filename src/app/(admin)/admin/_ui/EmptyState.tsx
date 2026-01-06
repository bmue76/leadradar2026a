"use client";

import * as React from "react";
import styles from "./EmptyState.module.css";

export function EmptyState(props: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  meta?: React.ReactNode;
  cta?: React.ReactNode;
}) {
  const { icon, title, hint, meta, cta } = props;

  return (
    <div className={styles.root}>
      {icon ? <div className={styles.icon} aria-hidden="true">{icon}</div> : null}
      <div className={styles.title}>{title}</div>
      {hint ? <div className={styles.hint}>{hint}</div> : null}
      {meta ? <div className={styles.meta}>{meta}</div> : null}
      {cta ? <div className={styles.cta}>{cta}</div> : null}
    </div>
  );
}
