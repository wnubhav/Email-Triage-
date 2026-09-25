import { priorityMeta, categoryMeta, formatWhen, senderParts } from "../lib/format.js";
import { EmptyState, ErrorState, QueueSkeleton } from "./States.jsx";
import { IconReview, IconChevron } from "./Icons.jsx";

/**
 * The human review worklist.
 *
 * Splits the loaded queue by whether a feedback row exists, lowest confidence
 * first, so the classifications most worth a second pair of eyes surface soonest.
 * Selecting an item opens it in the triage workspace with the review block in
 * view, so review happens against the full evidence, not in isolation.
 */
export function ReviewView({ emails, loading, error, onRetry, onOpenEmail, stats }) {
  if (loading) {
    return (
      <div className="page">
        <QueueSkeleton rows={5} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={onRetry} context="Could not load the review queue." />
      </div>
    );
  }

  const triaged = emails.filter((e) => e.triage);
  const pending = triaged
    .filter((e) => !e.triage.feedback)
    .sort((a, b) => a.triage.confidence - b.triage.confidence);
  const reviewed = triaged.filter((e) => e.triage.feedback);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Human review</h2>
        <p>
          Every triage result can be confirmed or corrected. Confirmations and corrections are
          written to the feedback log and become the model accuracy figure in Analytics. This is
          the loop that makes the classifier auditable rather than opaque.
        </p>
      </div>

      <div className="metricband">
        <Metric label="Awaiting" value={pending.length} tone={pending.length ? undefined : "muted"} />
        <Metric label="Reviewed" value={reviewed.length} />
        <Metric
          label="Corrections"
          value={stats?.corrections_count ?? reviewed.filter((e) => !e.triage.feedback.correct).length}
        />
        <Metric
          label="Accuracy"
          value={stats?.feedback_accuracy != null ? `${stats.feedback_accuracy}%` : "-"}
          tone={stats?.feedback_accuracy == null ? "muted" : stats.feedback_accuracy >= 90 ? "ok" : undefined}
        />
      </div>

      <p className="mlabel">
        Awaiting review <span className="mlabel-tail">lowest confidence first</span>
      </p>
      {pending.length ? (
        <div className="rlist" style={{ marginBottom: 22 }}>
          {pending.map((email) => (
            <ReviewItem key={email.id} email={email} onOpenEmail={onOpenEmail} />
          ))}
        </div>
      ) : (
        <div className="panel" style={{ marginBottom: 22 }}>
          <EmptyState icon={<IconReview />} title="Everything loaded has been reviewed">
            {triaged.length
              ? "No triage result in the current queue is waiting on a human decision."
              : "Nothing has been triaged yet, so there is nothing to review."}
          </EmptyState>
        </div>
      )}

      {reviewed.length ? (
        <>
          <p className="mlabel">
            Reviewed <span className="mlabel-tail">{reviewed.length}</span>
          </p>
          <div className="rlist">
            {reviewed.map((email) => (
              <ReviewItem key={email.id} email={email} onOpenEmail={onOpenEmail} reviewed />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-val" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

function ReviewItem({ email, onOpenEmail, reviewed }) {
  const triage = email.triage;
  const meta = priorityMeta(triage.priority);
  const cat = categoryMeta(triage.category);
  const when = formatWhen(email.received_at);
  const sender = senderParts(email.sender);
  const fb = triage.feedback;

  return (
    <button className="ritem" onClick={() => onOpenEmail(email.id)}>
      <span className="ritem-p" data-p={triage.priority} title={meta.label}>
        {triage.priority}
      </span>

      <span className="ritem-main">
        <span className="ritem-subject">{email.subject}</span>
        <span className="ritem-sub">
          {sender.address} · {cat.label} · {when.short}
          {fb
            ? fb.correct
              ? " · confirmed"
              : ` · corrected to ${fb.corrected_category || triage.category} ${fb.corrected_priority || triage.priority}`
            : ""}
        </span>
      </span>

      {reviewed ? (
        <span className="ritem-state" data-tone={fb.correct ? "ok" : "warn"}>
          {fb.correct ? "Confirmed" : "Corrected"}
        </span>
      ) : (
        <span className="ritem-conf" title="Model confidence">
          {Math.round(triage.confidence)}%
        </span>
      )}

      <IconChevron style={{ color: "var(--fg-dim)", width: 13, height: 13 }} />
    </button>
  );
}
