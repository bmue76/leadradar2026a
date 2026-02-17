"use client";

import * as React from "react";

type StyleWithVars = React.CSSProperties & { [key: `--${string}`]: string | number };

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

function withAccentRing(style?: React.CSSProperties): StyleWithVars {
  // Tailwind ring (falls genutzt) soll auch accent-soft sein.
  return {
    ...(style ? (style as StyleWithVars) : {}),
    "--tw-ring-color": "var(--lr-accent-soft)",
  };
}

export type InputTone = "default" | "mono";

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    tone?: InputTone;
    invalid?: boolean;
  },
) {
  const { className, tone = "default", invalid, style, ...rest } = props;

  return (
    <input
      {...rest}
      data-invalid={invalid ? "true" : undefined}
      style={withAccentRing(style)}
      className={cx(
        "lr-input",
        tone === "mono" ? "font-mono" : undefined,
        className,
      )}
    />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    tone?: InputTone;
    invalid?: boolean;
  },
) {
  const { className, tone = "default", invalid, style, ...rest } = props;

  return (
    <textarea
      {...rest}
      data-invalid={invalid ? "true" : undefined}
      style={withAccentRing(style)}
      className={cx(
        "lr-textarea",
        tone === "mono" ? "font-mono" : undefined,
        className,
      )}
    />
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    invalid?: boolean;
  },
) {
  const { className, invalid, style, ...rest } = props;

  return (
    <select
      {...rest}
      data-invalid={invalid ? "true" : undefined}
      style={withAccentRing(style)}
      className={cx("lr-select", className)}
    />
  );
}
