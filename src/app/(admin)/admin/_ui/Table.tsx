"use client";

import * as React from "react";
import styles from "./Table.module.css";

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

export function Table(props: {
  ariaLabel?: string;
  minWidth?: number | string;
  children: React.ReactNode;
  className?: string;
}) {
  const { ariaLabel, minWidth, children, className } = props;

  const style: React.CSSProperties | undefined =
    minWidth === undefined
      ? undefined
      : { minWidth: typeof minWidth === "number" ? `${minWidth}px` : minWidth };

  return (
    <div className={cx(styles.container, className)}>
      <div className={styles.scroller}>
        <table className={styles.table} aria-label={ariaLabel} style={style}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function TableHead(props: { children: React.ReactNode }) {
  return <thead className={styles.thead}>{props.children}</thead>;
}

export function TableHeadRow(props: { children: React.ReactNode }) {
  return <tr className={styles.theadRow}>{props.children}</tr>;
}

export function TableHeadCell(props: { align?: "left" | "right"; children: React.ReactNode }) {
  const { align = "left", children } = props;
  return <th className={cx(align === "right" && styles.alignRight)}>{children}</th>;
}

export function TableBody(props: { children: React.ReactNode }) {
  return <tbody>{props.children}</tbody>;
}

export function TableRow(
  props: React.HTMLAttributes<HTMLTableRowElement> & {
    interactive?: boolean;
    actions?: React.ReactNode;
  }
) {
  const { interactive, actions, className, children, ...rest } = props;

  return (
    <tr className={cx(styles.row, interactive && styles.rowInteractive, className)} {...rest}>
      {children}
      {actions ? (
        <td className={cx(styles.cell, styles.actionsCell, styles.alignRight)}>
          <div className={styles.actions}>{actions}</div>
        </td>
      ) : null}
    </tr>
  );
}

export function TableCell(
  props: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }
) {
  const { align = "left", className, ...rest } = props;

  return (
    <td
      {...rest}
      className={cx(styles.cell, align === "right" && styles.alignRight, className)}
    />
  );
}
