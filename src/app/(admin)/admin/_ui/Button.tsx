"use client";

import * as React from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

type StyleWithVars = React.CSSProperties & { [key: `--${string}`]: string | number };

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

function sizeClass(s: ButtonSize) {
  if (s === "sm") return "h-8 px-3 text-sm rounded-xl";
  return "h-10 px-4 text-sm rounded-2xl";
}

function variantClass(v: ButtonVariant) {
  if (v === "primary") {
    return cx(
      "text-white",
      "bg-[color:var(--lr-accent)]",
      "hover:opacity-95",
      "active:opacity-90",
    );
  }

  if (v === "ghost") {
    return cx(
      "bg-transparent",
      "text-[color:var(--lr-accent)]",
      "hover:bg-[color:var(--lr-accent-soft)]",
      "active:opacity-95",
    );
  }

  return cx(
    "bg-white",
    "text-slate-900",
    "border border-slate-200",
    "hover:bg-slate-50",
    "active:bg-slate-100",
  );
}

function focusVars(style?: React.CSSProperties): StyleWithVars {
  return {
    ...(style ? (style as StyleWithVars) : {}),
    // Tailwind ring uses --tw-ring-color
    "--tw-ring-color": "var(--lr-accent-soft)",
  };
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  },
) {
  const { variant = "secondary", size = "md", className, style, ...rest } = props;

  return (
    <button
      {...rest}
      style={focusVars(style)}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-semibold",
        "transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        sizeClass(size),
        variantClass(variant),
        className,
      )}
    />
  );
}

export function ButtonLink(
  props: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    prefetch?: boolean;
    variant?: ButtonVariant;
    size?: ButtonSize;
  },
) {
  const {
    href,
    prefetch,
    variant = "ghost",
    size = "sm",
    className,
    style,
    children,
    ...rest
  } = props;

  return (
    <Link
      href={href}
      prefetch={prefetch}
      style={focusVars(style)}
      className={cx(
        "inline-flex items-center justify-center gap-2 font-semibold",
        "transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        sizeClass(size),
        variantClass(variant),
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
