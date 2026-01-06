"use client";

import * as React from "react";
import styles from "./BrandHeader.module.css";

export default function BrandHeader() {
  const [useFallback, setUseFallback] = React.useState(false);

  const src = useFallback
    ? "/brand/leadradar-icon.png"
    : "/brand/leadradar-logo.png";

  return (
    <div className={styles.wrap} aria-label="LeadRadar">
      <img
        className={useFallback ? styles.icon : styles.logo}
        src={src}
        alt="LeadRadar"
        onError={() => setUseFallback(true)}
      />
    </div>
  );
}
