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

/**
 * Sidebar category icons — clean, consistent, "SumUp/Square-like"
 * - 24x24 grid
 * - round caps/joins
 * - strokeWidth 1.8
 */

export function IconHome(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.5 10.2 12 4.6l7.5 5.6V20a1.2 1.2 0 0 1-1.2 1.2H14v-6.3h-4V21.2H5.7A1.2 1.2 0 0 1 4.5 20v-9.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSetup(props: SVGProps<SVGSVGElement>) {
  // Sliders / Controls
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M6 7h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6 12h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6 17h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 7a2 2 0 1 0 0 .01V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M15 12a2 2 0 1 0 0 .01V12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M11 17a2 2 0 1 0 0 .01V17Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function IconOperations(props: SVGProps<SVGSVGElement>) {
  // Briefcase
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M9 7.2V6.3A1.3 1.3 0 0 1 10.3 5h3.4A1.3 1.3 0 0 1 15 6.3v.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.2 8h11.6A2.2 2.2 0 0 1 20 10.2v8.6A2.2 2.2 0 0 1 17.8 21H6.2A2.2 2.2 0 0 1 4 18.8v-8.6A2.2 2.2 0 0 1 6.2 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M4 13h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

export function IconLeads(props: SVGProps<SVGSVGElement>) {
  // Users
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M15.8 10.2a3.8 3.8 0 1 1-7.6 0 3.8 3.8 0 0 1 7.6 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.8 21a7.2 7.2 0 0 1 14.4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconStats(props: SVGProps<SVGSVGElement>) {
  // Bar chart
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7.5 20V11.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 20V6.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.5 20v-8.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBilling(props: SVGProps<SVGSVGElement>) {
  // Credit card
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5.6 7h12.8A2.2 2.2 0 0 1 20.6 9.2v8.6A2.2 2.2 0 0 1 18.4 20H5.6A2.2 2.2 0 0 1 3.4 17.8V9.2A2.2 2.2 0 0 1 5.6 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M3.4 11h17.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M7 16h4.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
