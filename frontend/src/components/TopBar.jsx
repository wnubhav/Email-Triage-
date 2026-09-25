import { IconSearch, IconRefresh } from "./Icons.jsx";

/**
 * Application bar: what you are looking at, search, how much is waiting, and
 * whether the console is connected.
 *
 * Implementation details such as the model name deliberately do not appear
 * here. They live in System > Configuration, where someone goes to look them
 * up rather than being shown them on every screen.
 */
export function TopBar({
  query,
  onQuery,
  searchRef,
  counts,
  connection, // "live" | "demo" | "busy" | "down"
  busyLabel,
  onRefresh,
  refreshing,
  sectionLabel,
}) {
  const state = connection === "down" ? "demo" : connection;
  const statusText = {
    live: "Connected",
    demo: connection === "down" ? "API unavailable" : "Demo data",
    busy: busyLabel || "Working",
  }[state];

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{sectionLabel || "Triage Console"}</h1>
        <span className="topbar-sub">EDA engineering support</span>
      </div>

      <div className="topbar-search">
        <IconSearch />
        <input
          ref={searchRef}
          className="field"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search subject, sender or intent"
          aria-label="Search the queue"
        />
        <kbd aria-hidden="true">/</kbd>
      </div>

      <div className="topbar-right">
        <div className="counter" data-tone="p1" title="Open P1 items in the loaded queue">
          <b>{counts.p1}</b>
          <span>critical</span>
        </div>
        <div className="counter" data-optional="true" title="Triage results still awaiting human review">
          <b>{counts.unreviewed}</b>
          <span>to review</span>
        </div>

        <div className="counter-sep" aria-hidden="true" />

        <span className="status" data-state={state} title={connectionTitle(connection)}>
          <i className="status-dot" aria-hidden="true" />
          {statusText}
        </span>

        <button
          className="btn"
          data-size="sm"
          data-variant="quiet"
          onClick={onRefresh}
          disabled={refreshing}
          title="Reload the queue and statistics"
        >
          <IconRefresh />
          <span className="sr-only">Refresh</span>
        </button>
      </div>
    </header>
  );
}

function connectionTitle(connection) {
  if (connection === "live") return "Connected to the triage API";
  if (connection === "busy") return "A request is in flight";
  if (connection === "down") return "The triage API is not reachable, so the demo dataset is shown";
  return "Showing the bundled demo dataset; no backend connected";
}
