"use client";

import * as React from "react";

export function PageShell({
  children,
  className,
  maxWClass = "max-w-6xl",
}: {
  children: React.ReactNode;
  className?: string;
  maxWClass?: string;
}) {
  return <div className={`mx-auto w-full ${maxWClass} px-6 py-6 ${className ?? ""}`}>{children}</div>;
}
