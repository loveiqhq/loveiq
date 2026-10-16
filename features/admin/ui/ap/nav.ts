/**
 * AP-Analytics' navigation, as the design's sidebar lists it. Links keep the filters, so
 * moving between reports keeps the period and the narrowing.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  level: 1 | 2;
  badge?: "live" | "soon";
  /** A section of a page, reached by its anchor. */
  anchor?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const AP_BASE = "/admin/ap";
export const ASSESSMENT_A = `${AP_BASE}/assessment-a`;

export const NAV: NavGroup[] = [
  {
    title: "Reports",
    items: [{ key: "focus", label: "Dashboard", href: AP_BASE, level: 1 }],
  },
  {
    title: "Assessments",
    items: [
      { key: "a", label: "Assessment A", href: ASSESSMENT_A, level: 1, badge: "live" },
      { key: "a-dashboard", label: "Dashboard", href: ASSESSMENT_A, level: 2 },
      { key: "a-traffic", label: "Traffic", href: `${ASSESSMENT_A}/traffic`, level: 2 },
      { key: "a-landing", label: "Landing page", href: `${ASSESSMENT_A}/landing`, level: 2 },
      {
        key: "a-page",
        label: "Assessment page",
        href: `${ASSESSMENT_A}/landing`,
        anchor: "assessment-page",
        level: 2,
      },
      { key: "a-survey", label: "Survey", href: `${ASSESSMENT_A}/survey`, level: 2 },
      { key: "a-report", label: "Report", href: `${ASSESSMENT_A}/report`, level: 2 },
      { key: "a-payment", label: "Payment", href: `${ASSESSMENT_A}/payment`, level: 2 },
      { key: "b", label: "Assessment B", href: "", level: 1, badge: "soon" },
      { key: "c", label: "Assessment C", href: "", level: 1, badge: "soon" },
    ],
  },
  {
    title: "Data sources",
    items: [
      { key: "sources", label: "Catalog", href: `${AP_BASE}/sources`, level: 1 },
      {
        key: "s-prod",
        label: "Production",
        href: `${AP_BASE}/sources?source=production`,
        level: 2,
      },
      { key: "s-ph", label: "PostHog", href: `${AP_BASE}/sources?source=posthog`, level: 2 },
      { key: "s-ga", label: "Google Analytics", href: `${AP_BASE}/sources?source=ga4`, level: 2 },
      { key: "s-ads", label: "Google Ads", href: `${AP_BASE}/sources?source=ads`, level: 2 },
      { key: "explorer", label: "Raw data explorer", href: `${AP_BASE}/explorer`, level: 1 },
    ],
  },
];

/** Which page a path is, for the sidebar's highlight. */
export function activeKey(pathname: string): string {
  const p = pathname.replace(/\/+$/, "");
  if (p === AP_BASE) return "focus";
  if (p === ASSESSMENT_A) return "a-dashboard";
  if (p === `${ASSESSMENT_A}/traffic`) return "a-traffic";
  if (p === `${ASSESSMENT_A}/payment`) return "a-payment";
  if (p === `${ASSESSMENT_A}/landing`) return "a-landing";
  if (p === `${ASSESSMENT_A}/survey`) return "a-survey";
  if (p === `${ASSESSMENT_A}/report`) return "a-report";
  if (p === `${AP_BASE}/sources`) return "sources";
  if (p === `${AP_BASE}/explorer`) return "explorer";
  return "";
}

/** A link to a report page with the current filters; data pages take no filters. */
export function navHref(item: NavItem, filterQuery: string): string {
  if (!item.href) return "";
  const keepsFilters =
    !item.href.startsWith(`${AP_BASE}/sources`) && !item.href.startsWith(`${AP_BASE}/explorer`);
  return `${item.href}${keepsFilters ? filterQuery : ""}${item.anchor ? `#${item.anchor}` : ""}`;
}
