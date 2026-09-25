import {
  priorityMeta,
  categoryMeta,
  confidenceBand,
  parseSimilar,
  clampPercent,
  extractSignals,
} from "../lib/format.js";
import { JiraPreview } from "./JiraPreview.jsx";
import { ReviewBlock } from "./ReviewBlock.jsx";
import { EmptyState, PanelSkeleton } from "./States.jsx";
import { IconAlert, IconLink } from "./Icons.jsx";

/**
 * What the system decided, why that is plausible, and what to do about it.
 *
 * The panel answers three questions in order: the decision, the observable
 * evidence behind it, and the action. Everything below that is context the
 * operator reaches for rather than reads first.
 */
export function TriagePanel({ email, loading, onOpenEmail, onSubmitFeedback, readOnly, readOnlyReason }) {
  if (loading && !email) {
    return (
      <aside className="triage">
        <PanelSkeleton />
      </aside>
    );
  }

  if (!email) {
    return (
      <aside className="triage" aria-label="Triage analysis">
        <EmptyState icon={<IconAlert />} title="No analysis to show">
          Select an email and its classification, intent, recommended action and generated issue
          will appear here.
        </EmptyState>
      </aside>
    );
  }

  const triage = email.triage;

  if (!triage) {
    return (
      <aside className="triage" aria-label="Triage analysis">
        <div className="triage-scroll">
          <div className="tsection">
            <EmptyState icon={<IconAlert />} title="Triage did not complete">
              This email was stored but carries no triage result, which happens when the model call
              failed or returned something outside the expected schema. Re-ingesting the email runs
              the pipeline again.
            </EmptyState>
          </div>
        </div>
      </aside>
    );
  }

  const meta = priorityMeta(triage.priority);
  const cat = categoryMeta(triage.category);
  const band = confidenceBand(triage.confidence);
  const similar = parseSimilar(triage.similar_issue);
  const signals = extractSignals(email.subject, email.body_clean || email.preview);

  return (
    <aside className="triage" aria-label="Triage analysis">
      <div className="triage-scroll">
        {/* ── the assessment ── */}
        <section className="tsection decision">
          <h3 className="tlabel tlabel--eyebrow">AI assessment</h3>
          <div className="decision-head">
            <span className="verdict-code" data-p={triage.priority}>
              {triage.priority}
            </span>
            <div className="decision-lines">
              <div className="decision-label">{meta.label}</div>
              <div className="decision-cat">{triage.category}</div>
            </div>
          </div>

          <Confidence value={triage.confidence} band={band} />
        </section>

        {/* ── what it means ── */}
        <section className="tsection">
          <h3 className="tlabel">Intent</h3>
          <p className="tbody">{triage.intent_summary}</p>
        </section>

        {/* ── the evidence ── */}
        {signals.length > 0 ? (
          <section className="tsection">
            <h3 className="tlabel">Signals</h3>
            <div className="signals">
              {signals.map((s) => (
                <span className="signal" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── what to do ── */}
        <section className="tsection">
          <h3 className="tlabel">Recommended action</h3>
          <p className="tbody tbody--action">{triage.suggested_action}</p>
        </section>

        {/* ── prior context ── */}
        <section className="tsection">
          <h3 className="tlabel">Similar issue</h3>
          <SimilarIssue similar={similar} onOpenEmail={onOpenEmail} />
        </section>

        {/* ── the generated issue ── */}
        {triage.jira_payload ? (
          <section className="tsection">
            <h3 className="tlabel">Engineering issue</h3>
            <JiraPreview jira={triage.jira_payload} />
          </section>
        ) : null}

        {/* ── the human decision ── */}
        <section className="tsection">
          <h3 className="tlabel">Review</h3>
          <ReviewBlock
            triage={triage}
            onSubmit={onSubmitFeedback}
            disabled={readOnly || !triage.id}
            disabledReason={
              readOnly
                ? readOnlyReason
                : !triage.id
                  ? "This triage result has no id, so feedback cannot be attributed to it."
                  : undefined
            }
          />
        </section>
      </div>
    </aside>
  );
}

/** The 3px bar, kept. The invented tick marks and 0-100 scale around it are not. */
function Confidence({ value, band }) {
  const pct = clampPercent(value);
  return (
    <div className="conf">
      <div className="conf-top">
        <span className="conf-val">{Math.round(value)}%</span>
        <span className="conf-band">{band.label} confidence</span>
      </div>
      <div
        className="conf-track"
        role="meter"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Model confidence: ${Math.round(value)} percent`}
      >
        <div className="conf-fill" data-band={band.key} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SimilarIssue({ similar, onOpenEmail }) {
  if (!similar) {
    return (
      <p className="tnote">
        No earlier issue matched. Either this is the first of its kind, or the archive is still too
        small to match against.
      </p>
    );
  }

  const linkable = similar.emailId != null && typeof onOpenEmail === "function";
  const Tag = linkable ? "button" : "div";

  return (
    <>
      <Tag
        className="similar"
        {...(linkable
          ? { onClick: () => onOpenEmail(similar.emailId), title: "Open the matched email" }
          : {})}
      >
        <div className="similar-top">
          <span className="similar-id">
            {similar.emailId != null ? `#${similar.emailId}` : "Match"}
          </span>
          {similar.score != null ? <span className="similar-score">{similar.score}% similar</span> : null}
          {linkable ? <IconLink className="similar-go" /> : null}
        </div>
        <div className="similar-subject">{similar.subject}</div>
        {similar.category ? <div className="similar-meta">{similar.category}</div> : null}
      </Tag>
      <p className="tnote tnote--quiet">
        Found by TF-IDF cosine similarity against previously triaged mail, not by the model.
      </p>
    </>
  );
}
