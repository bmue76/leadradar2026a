"use client";

import * as React from "react";
import styles from "./Topbar.module.css";

type TopbarProps = {
  title?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
};

export default function Topbar({ title, leftSlot, rightSlot }: TopbarProps) {
  return (
    <header className={styles.root}>
      <div className={styles.left}>
        {leftSlot ? <div className={styles.leftSlot}>{leftSlot}</div> : null}
        {title ? <div className={styles.title}>{title}</div> : null}
      </div>

      <div className={styles.right}>
        {rightSlot ? <div className={styles.slot}>{rightSlot}</div> : null}
      </div>
    </header>
  );
}
