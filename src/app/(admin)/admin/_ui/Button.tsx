"use client";

import * as React from "react";
import Link from "next/link";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

function variantClass(v: ButtonVariant) {
  if (v === "primary") return styles.primary;
  if (v === "ghost") return styles.ghost;
  return styles.secondary;
}

function sizeClass(s: ButtonSize) {
  if (s === "sm") return styles.sm;
  return undefined;
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
) {
  const { variant = "secondary", size = "md", className, ...rest } = props;

  return (
    <button
      {...rest}
      className={cx(styles.button, variantClass(variant), sizeClass(size), className)}
    />
  );
}

export function ButtonLink(
  props: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    prefetch?: boolean;
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
) {
  const {
    href,
    prefetch,
    variant = "ghost",
    size = "sm",
    className,
    children,
    ...rest
  } = props;

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cx(styles.button, variantClass(variant), sizeClass(size), className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
