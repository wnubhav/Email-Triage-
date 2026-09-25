import { useEffect, useRef } from "react";
import {
  PRIORITIES,
  CATEGORIES,
  priorityMeta,
  categoryMeta,
  formatWhen,
  senderParts,
  confidenceBand,
  clampPercent,
} from "../lib/format.js";
import { QueueSkeleton, ErrorState, NoResults, EmptyQueue } from "./States.jsx";

/**
 * The triage queue.
 *
 * Rows are grouped into priority bands with sticky headers, so "what needs my
 * attention right now" is answered by the structure of the list before any
 * colour is read. Within a band, mail stays in arrival order.
 */
export function QueuePanel({
  emails,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  priority,
  category,
  onPriority,
  onCategory,
  query,
  onClearFilters,
  onIngest,
  totalLoaded,
}) {
  const filtersActive = priority !== "ALL" || category !== "ALL" || Boolean(query);

  return (
    <section className="queue" aria-label="Triage queue">
      <div className="queue-filters">
        <div className="segmented" role="group" aria-label="Filter by priority">
          {["ALL", ...PRIORITIES].map((p) => (
            <button
              key={p}
              data-p={p}
              aria-pressed={priority === p}
              onClick={() => onPriority(p)}
              title={p === "ALL" ? "All priorities" : `${p}: ${priorityMeta(p).label}`}
            >
              {p}
            </button>
          ))}
        </div>

        <select
          className="field"
          value={category}
          onChange={(e) => onCategory(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="ALL">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="queue-meta">
        <span>
          {emails.length} shown
          {totalLoaded !== emails.length ? ` / ${totalLoaded} loaded` : ""}
        </span>
        {filtersActive ? <button onClick={onClearFilters}>Clear</button> : null}
      </div>

      <div className="queue-scroll">
        <QueueBody
          emails={emails}
          loading={loading}
          error={error}
          onRetry={onRetry}
          selectedId={selectedId}
          onSelect={onSelect}
          filtersActive={filtersActive}
          query={query}
          onClearFilters={onClearFilters}
          onIngest={onIngest}
          totalLoaded={totalLoaded}
        />
      </div>
    </section>
  );
}

function QueueBody({
  emails,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  filtersActive,
  query,
  onClearFilters,
  onIngest,
  totalLoaded,
}) {
  if (loading) return <QueueSkeleton />;
  if (error) return <ErrorState error={error} onRetry={onRetry} context="Could not load the queue." />;
  if (emails.length === 0 && totalLoaded === 0) return <EmptyQueue onIngest={onIngest} />;
  if (emails.length === 0) {
    return filtersActive ? <NoResults query={query} onClear={onClearFilters} /> : <EmptyQueue onIngest={onIngest} />;
  }

  // Group into priority bands, preserving arrival order inside each band.
  const bands = [...PRIORITIES, "none"]
    .map((p) => ({
      key: p,
      items: emails.filter((e) => (e.triage?.priority || "none") === p),
    }))
    .filter((band) => band.items.length > 0);

  return (
    <div role="listbox" aria-label="Emails" onKeyDown={(e) => handleArrowKeys(e, emails, selectedId, onSelect)}>
      {bands.map((band) => {
        const meta = priorityMeta(band.key === "none" ? null : band.key);
        return (
          <div
            key={band.key}
            role="group"
            aria-label={`${meta.code} ${meta.label}, ${band.items.length} item${band.items.length === 1 ? "" : "s"}`}
          >
            <div className="band" data-p={band.key} aria-hidden="true">
              <i className="band-tick" />
              <span className="band-name">{meta.label}</span>
              <span className="band-count">{band.items.length}</span>
            </div>
            {band.items.map((email) => (
              <QueueRow
                key={email.id}
                email={email}
                selected={email.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function handleArrowKeys(event, emails, selectedId, onSelect) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const index = emails.findIndex((e) => e.id === selectedId);
  const next = event.key === "ArrowDown" ? index + 1 : index - 1;
  if (next >= 0 && next < emails.length) onSelect(emails[next]);
}

function QueueRow({ email, selected, onSelect }) {
  const ref = useRef(null);
  const triage = email.triage;
  const meta = priorityMeta(triage?.priority);
  const cat = triage ? categoryMeta(triage.category) : null;
  const when = formatWhen(email.received_at);
  const sender = senderParts(email.sender);
  const band = triage ? confidenceBand(triage.confidence) : null;

  // Keep the selected row in view when selection moves by keyboard.
  useEffect(() => {
    if (selected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const label = [
    meta.code,
    meta.label,
    email.subject,
    `from ${sender.address}`,
    triage ? `${triage.category}, confidence ${Math.round(triage.confidence)} percent` : "not yet triaged",
    when.full,
  ].join(". ");

  return (
    <div
      ref={ref}
      role="option"
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-label={label}
      className="row"
      data-bright={meta.bright}
      onClick={() => onSelect(email)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(email);
        }
      }}
    >
      <i className="row-rail" data-p={triage?.priority || "none"} data-rail={meta.rail} aria-hidden="true" />

      <span className="row-p" data-p={triage?.priority || "none"} aria-hidden="true">
        {meta.code}
      </span>

      <div className="row-body">
        <div className="row-subject" aria-hidden="true">
          {email.subject}
        </div>

        <div className="row-meta" aria-hidden="true">
          <span className="row-sender">
            {sender.name}
            {sender.domain ? ` · ${sender.domain}` : ""}
          </span>
        </div>

        <div className="row-foot" aria-hidden="true">
          <span className="row-cat">{triage ? cat.label : "Not yet triaged"}</span>
          {triage ? (
            <>
              <span className="row-conf" title={`Model confidence ${Math.round(triage.confidence)}%`}>
                <i style={{ width: `${clampPercent(triage.confidence)}%` }} data-band={band.key} />
              </span>
              <span className="row-flags">
                {triage.similar_issue ? <i className="row-flag" data-kind="sim" title="Matched an earlier issue" /> : null}
                {triage.jira_payload ? <i className="row-flag" data-kind="jira" title="Generated an engineering issue" /> : null}
                {triage.feedback ? <i className="row-flag" data-kind="rvw" title="Reviewed by a human" /> : null}
              </span>
            </>
          ) : null}
          <span className="row-time" title={when.full}>
            {when.short}
          </span>
        </div>
      </div>
    </div>
  );
}
