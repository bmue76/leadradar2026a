"use client";

import * as React from "react";
import Link from "next/link";

export type ChipSize = "md" | "sm";

/**
 * tone:
 * - neutral: default pill
 * - subtle: more UI-muted
 * - muted: very quiet label
 * - accent: uses tenant accent vars
 *
 * We allow arbitrary legacy strings, but normalize them to one of the 4.
 */
export type ChipTone = "neutral" | "subtle" | "muted" | "accent" | string;

type StyleWithVars = React.CSSProperties & { [key: `--${string}`]: string | number };

type ChipBaseProps = {
  children: React.ReactNode;
  selected?: boolean;
  size?: ChipSize;
  tone?: ChipTone;
  className?: string;
  style?: React.CSSProperties;
};

export type ChipButtonProps = ChipBaseProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

export type ChipLinkProps = ChipBaseProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    prefetch?: boolean;
  };

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeTone(t: ChipTone | undefined): "neutral" | "subtle" | "muted" | "accent" {
  if (t === "subtle") return "subtle";
  if (t === "muted") return "muted";
  if (t === "accent") return "accent";
  return "neutral";
}

function sizeClass(size: ChipSize) {
  if (size === "sm") return "h-7 px-2.5 text-[12px]";
  return "h-8 px-3 text-[13px]";
}

function toneClasses(tone: "neutral" | "subtle" | "muted" | "accent") {
  if (tone === "muted") return "border-slate-200 bg-slate-100 text-slate-700";
  if (tone === "subtle") return "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100";
  if (tone === "accent") return "border border-slate-200";
  return "border-slate-200 bg-white text-slate-900 hover:bg-slate-50";
}

function buildStyle(args: {
  tone: "neutral" | "subtle" | "muted" | "accent";
  selected: boolean;
  style?: React.CSSProperties;
}): StyleWithVars {
  const base: StyleWithVars = {
    ...(args.style ? (args.style as StyleWithVars) : {}),
    // Tailwind ring uses --tw-ring-color. We set it to tenant soft accent.
    "--tw-ring-color": "var(--lr-accent-soft)",
  };

  const effectiveTone = args.selected ? "accent" : args.tone;

  if (effectiveTone === "accent") {
    base.borderColor = "var(--lr-accent)";
    base.backgroundColor = "var(--lr-accent-soft)";
    base.color = "var(--lr-accent)";
  }

  return base;
}

export function Chip(props: ChipButtonProps | ChipLinkProps): React.ReactElement {
  const {
    children,
    selected = false,
    size = "md",
    tone: rawTone,
    className,
    style,
    ...rest
  } = props;

  const tone = normalizeTone(rawTone);

  const classes = cx(
    "inline-flex items-center justify-center gap-1 rounded-full border font-semibold",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    sizeClass(size),
    toneClasses(selected ? "accent" : tone),
    className,
  );

  const mergedStyle = buildStyle({ tone, selected, style });

  if ("href" in props && typeof props.href === "string") {
    const { href, prefetch, ...a } = rest as Omit<ChipLinkProps, keyof ChipBaseProps> & {
      href: string;
      prefetch?: boolean;
    };

    return (
      <Link href={href} prefetch={prefetch} className={classes} style={mergedStyle} {...a}>
        {children}
      </Link>
    );
  }

  const b = rest as Omit<ChipButtonProps, keyof ChipBaseProps>;

  return (
    <button className={classes} style={mergedStyle} {...b}>
      {children}
    </button>
  );
}
