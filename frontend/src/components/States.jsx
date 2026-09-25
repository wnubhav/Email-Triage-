/**
 * Loading, empty and error states.
 *
 * Errors are rendered from ApiError.headline plus the operator-facing message,
 * never from a raw traceback. Where an action would resolve the state, the
 * state itself offers it.
 */
import { IconAlert, IconInboxEmpty, IconSearch, IconOffline, IconRefresh } from "./Icons.jsx";

export function EmptyState({ icon, title, children, action, note }) {
  return (
    <div className="state">
      <div className="state-icon">{icon}</div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
      {note ? <p className="state-note">{note}</p> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, context }) {
  const offline = error?.kind === "offline";
  return (
    <div className="state" data-tone="error" role="alert">
      <div className="state-icon">{offline ? <IconOffline /> : <IconAlert />}</div>
      <h3>{error?.headline || "Something went wrong"}</h3>
      <p>
        {context ? context + " " : ""}
        {offline
          ? "The console could not open a connection to the triage API."
          : error?.message || "The request did not complete."}
      </p>
      {offline ? (
        <div className="state-detail">uvicorn app.main:app --reload --port 8000</div>
      ) : null}
      {onRetry ? (
        <button className="btn" onClick={onRetry}>
          <IconRefresh /> Try again
        </button>
      ) : null}
    </div>
  );
}

export function NoResults({ query, onClear }) {
  return (
    <EmptyState
      icon={<IconSearch />}
      title="Nothing matched"
      action={
        onClear ? (
          <button className="btn" onClick={onClear}>
            Clear filters
          </button>
        ) : null
      }
    >
      {query
        ? `Nothing matches “${query}” under the current filters.`
        : "No email in the queue matches the current filters."}
    </EmptyState>
  );
}

export function EmptyQueue({ onIngest }) {
  return (
    <EmptyState
      icon={<IconInboxEmpty />}
      title="Inbox clear"
      action={
        onIngest ? (
          <button className="btn" data-variant="primary" onClick={onIngest}>
            Ingest email
          </button>
        ) : null
      }
      note="Incoming messages appear here once they have been preprocessed and classified."
    >
      No messages have been triaged yet.
    </EmptyState>
  );
}

/** Queue skeleton that mirrors the real row geometry so nothing jumps on load. */
export function QueueSkeleton({ rows = 7 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}>
          <div className="skel" style={{ width: "34%", height: 8, marginBottom: 8 }} />
          <div className="skel" style={{ width: `${88 - (i % 3) * 13}%`, height: 10, marginBottom: 6 }} />
          <div className="skel" style={{ width: "52%", height: 8 }} />
        </div>
      ))}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div style={{ padding: "18px 20px" }} aria-hidden="true">
      <div className="skel" style={{ width: "72%", height: 15, marginBottom: 14 }} />
      <div className="skel" style={{ width: "45%", height: 9, marginBottom: 8 }} />
      <div className="skel" style={{ width: "38%", height: 9, marginBottom: 26 }} />
      <div className="skel" style={{ width: "100%", height: 9, marginBottom: 8 }} />
      <div className="skel" style={{ width: "94%", height: 9, marginBottom: 8 }} />
      <div className="skel" style={{ width: "66%", height: 9 }} />
    </div>
  );
}

/** Announces async state changes to screen readers without visual noise. */
export function LiveRegion({ children }) {
  return (
    <div className="sr-only" role="status" aria-live="polite">
      {children}
    </div>
  );
}
