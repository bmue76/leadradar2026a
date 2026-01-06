"use client";

import * as React from "react";
import styles from "./Topbar.module.css";

type TopbarProps = {
  title?: string;
  rightSlot?: React.ReactNode;
};

export default function Topbar({ title, rightSlot }: TopbarProps) {
  return (
    <header className={styles.root}>
      <div className={styles.left}>
        {title ? <div className={styles.title}>{title}</div> : null}
      </div>

      <div
        className={styles.right}
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          minWidth: 0,
        }}
      >
        {rightSlot ? <div className={styles.slot}>{rightSlot}</div> : null}
      </div>
    </header>
  );
}
