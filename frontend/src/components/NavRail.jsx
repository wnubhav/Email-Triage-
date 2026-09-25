import { IconQueue, IconIngest, IconChart, IconReview, IconSystem, IconLink } from "./Icons.jsx";

/**
 * Sidebar navigation.
 *
 * Grouped rather than flat: the four working sections sit together, and the
 * reference material is set below under its own heading. Every entry maps to
 * functionality that exists; there are no placeholder destinations.
 */
export const SECTIONS = [
  { id: "queue", label: "Queue", short: "Queue", Icon: IconQueue, group: "Triage", title: "Triage queue" },
  { id: "review", label: "Review", short: "Review", Icon: IconReview, group: "Triage", title: "Human review" },
  { id: "analytics", label: "Analytics", short: "Stats", Icon: IconChart, group: "Triage", title: "Analytics" },
  { id: "ingest", label: "Ingest", short: "Ingest", Icon: IconIngest, group: "Triage", title: "Ingest and batch processing" },
  { id: "connection", label: "Connection", short: "Status", Icon: IconLink, group: "System", title: "Connection and API reference" },
  { id: "configuration", label: "Configuration", short: "Config", Icon: IconSystem, group: "System", title: "Model and pipeline configuration" },
];

export function NavRail({ active, onChange, badges = {} }) {
  let lastGroup = null;

  return (
    <nav className="rail" aria-label="Sections">
      {SECTIONS.map(({ id, label, short, Icon, group, title }, index) => {
        const badge = badges[id];
        const newGroup = group !== lastGroup;
        lastGroup = group;

        return (
          <div key={id} style={{ display: "contents" }}>
            {newGroup ? (
              <div className="rail-group" aria-hidden="true">
                {group}
              </div>
            ) : null}
            <button
              className="rail-btn"
              onClick={() => onChange(id)}
              aria-current={active === id ? "page" : undefined}
              data-badge={id === "queue" ? "p1" : "muted"}
              title={`${title}  (${index + 1})`}
            >
              <Icon />
              <span className="rail-label">
                <span className="rail-label-full">{label}</span>
                <span className="rail-label-short">{short}</span>
              </span>
              {badge ? (
                <span className="rail-badge" aria-hidden="true">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
              {badge ? <span className="sr-only">, {badge} needing attention</span> : null}
            </button>
          </div>
        );
      })}
      <div className="rail-spacer" />
    </nav>
  );
}

/**
 * Brand mark: three rules of descending weight, a queue being sorted.
 * Drawn without a container tile so it sits directly on the dark chrome.
 */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect x="2" y="4" width="18" height="2.6" rx="1.3" fill="#6F9BEB" />
      <rect x="2" y="9.7" width="18" height="2.6" rx="1.3" fill="#6F9BEB" opacity=".6" />
      <rect x="2" y="15.4" width="10" height="2.6" rx="1.3" fill="#6F9BEB" opacity=".34" />
    </svg>
  );
}
