import type { SVGProps } from "react";

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5.25 7.75L10 12.5l4.75-4.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.6a.8.8 0 0 0 .2-1l-1.9-3.3a.8.8 0 0 0-1-.3l-2.4 1a8.4 8.4 0 0 0-1.7-1l-.3-2.6A.8.8 0 0 0 12.5 2h-4a.8.8 0 0 0-.8.7l-.3 2.6a8.4 8.4 0 0 0-1.7 1l-2.4-1a.8.8 0 0 0-1 .3L.4 8.9a.8.8 0 0 0 .2 1l2 1.6a7.9 7.9 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.6a.8.8 0 0 0-.2 1l1.9 3.3a.8.8 0 0 0 1 .3l2.4-1c.53.4 1.1.73 1.7 1l.3 2.6a.8.8 0 0 0 .8.7h4a.8.8 0 0 0 .8-.7l.3-2.6c.6-.27 1.17-.6 1.7-1l2.4 1a.8.8 0 0 0 1-.3l1.9-3.3a.8.8 0 0 0-.2-1l-2-1.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function IconLogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 17V7h6.2c2.2 0 3.8 1.4 3.8 3.4 0 2.1-1.6 3.6-3.9 3.6H10.2V17H7Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M10.2 11.6h2.6c1 0 1.7-.6 1.7-1.4 0-.8-.7-1.3-1.7-1.3h-2.6v2.7Z"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}
