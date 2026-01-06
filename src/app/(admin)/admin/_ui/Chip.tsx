"use client";

import * as React from "react";
import styles from "./Chip.module.css";

export type ChipTone = "neutral" | "subtle" | "muted";

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Chip(props: { tone?: ChipTone; className?: string; children: React.ReactNode }) {
  const { tone = "neutral", className, children } = props;

  const toneClass =
    tone === "muted" ? styles.muted : tone === "subtle" ? styles.subtle : styles.neutral;

  return <span className={cx(styles.chip, toneClass, className)}>{children}</span>;
}
