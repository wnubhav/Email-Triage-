/**
 * Inline icon set. Hand-drawn on a 16px grid with a 1.5 stroke so the weight
 * sits alongside Inter at 12–13px without looking bolted on. No icon library.
 */

const base = {
  viewBox: "0 0 16 16",
  // An intrinsic size, so an icon is never laid out at the SVG default of
  // 300x150 at a call site that does not size it. CSS still overrides.
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

export const IconQueue = (p) => (
  <svg {...base} {...p}>
    <path d="M2 4h12M2 8h12M2 12h7" />
  </svg>
);

export const IconIngest = (p) => (
  <svg {...base} {...p}>
    <path d="M8 10V2M5 5l3-3 3 3" />
    <path d="M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
  </svg>
);

export const IconChart = (p) => (
  <svg {...base} {...p}>
    <path d="M2 13.5h12" />
    <path d="M4 13.5V9M8 13.5V4M12 13.5V7" />
  </svg>
);

export const IconReview = (p) => (
  <svg {...base} {...p}>
    <path d="M3 8.5 6 11.5 13 4.5" />
  </svg>
);

export const IconSystem = (p) => (
  <svg {...base} {...p}>
    <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
    <rect x="2" y="9" width="12" height="4.5" rx="1" />
    <path d="M4.5 4.75h.01M4.5 11.25h.01" />
  </svg>
);

export const IconSearch = (p) => (
  <svg {...base} {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.2 10.2 3.3 3.3" />
  </svg>
);

export const IconRefresh = (p) => (
  <svg {...base} {...p}>
    <path d="M13.5 7a5.5 5.5 0 1 0-1.2 4.4" />
    <path d="M13.5 3.5V7H10" />
  </svg>
);

export const IconBack = (p) => (
  <svg {...base} {...p}>
    <path d="M12.5 8h-9M7 3.5 2.5 8 7 12.5" />
  </svg>
);

export const IconAlert = (p) => (
  <svg {...base} {...p}>
    <path d="M8 2.5 14.5 13.5h-13z" />
    <path d="M8 6.5v3M8 11.75h.01" />
  </svg>
);

export const IconCheckCircle = (p) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="m5.5 8 1.75 1.75L10.5 6.5" />
  </svg>
);

export const IconInboxEmpty = (p) => (
  <svg {...base} {...p}>
    <path d="M2 9.5h3.5l1 2h3l1-2H14" />
    <path d="M2.5 9.5 4 3.5h8l1.5 6v3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z" />
  </svg>
);

export const IconLink = (p) => (
  <svg {...base} {...p}>
    <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.47 2.47 0 0 0-3.5-3.5l-.6.6" />
    <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2A2.47 2.47 0 0 0 7.5 12l.6-.6" />
  </svg>
);

export const IconCopy = (p) => (
  <svg {...base} {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
    <path d="M10.5 3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1" />
  </svg>
);

export const IconChevron = (p) => (
  <svg {...base} {...p}>
    <path d="m5.5 3.5 4.5 4.5-4.5 4.5" />
  </svg>
);

export const IconOffline = (p) => (
  <svg {...base} {...p}>
    <path d="M1.5 1.5l13 13" />
    <path d="M3 6.2A9 9 0 0 1 5.6 4.6M13 6.2a9 9 0 0 0-4.8-2.1" />
    <path d="M5.3 8.8a5.5 5.5 0 0 1 1.6-1M10.7 8.8a5.5 5.5 0 0 0-1.4-.9" />
    <path d="M8 12.25h.01" />
  </svg>
);
