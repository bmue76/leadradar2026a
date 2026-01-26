"use client";

import React, { useEffect } from "react";

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("lr-builder-mode");
    return () => document.documentElement.classList.remove("lr-builder-mode");
  }, []);

  return <>{children}</>;
}
