import { useState } from "react";
import { CATEGORIES, PRIORITIES, priorityMeta } from "../lib/format.js";
import { IconCheckCircle, IconAlert } from "./Icons.jsx";

/**
 * Human-in-the-loop review: an engineering sign-off on the model's decision,
 * not a thumbs-up widget.
 *
 * Confirming POSTs {correct: true}. Correcting POSTs the replacement category
 * and priority alongside {correct: false}, which is what feeds the accuracy
 * figure in Analytics.
 */
export function ReviewBlock({ triage, onSubmit, disabled, disabledReason }) {
  const [mode, setMode] = useState("idle"); // idle | correcting | sending | error
  const [category, setCategory] = useState(triage.category);
  const [priority, setPriority] = useState(triage.priority);
  const [error, setError] = useState(null);

  const existing = triage.feedback;

  if (existing) {
    return (
      <div className="recorded">
        <IconCheckCircle />
        <div>
          <b>{existing.correct ? "Classification confirmed" : "Correction recorded"}</b>
          <span>
            {existing.correct
              ? "A reviewer accepted this triage as correct. It counts toward model accuracy in Analytics."
              : `Reclassified as ${existing.corrected_category || triage.category} · ${
                  existing.corrected_priority || triage.priority
                }. The original model output is kept for comparison.`}
          </span>
        </div>
      </div>
    );
  }

  async function send(payload) {
    setMode("sending");
    setError(null);
    try {
      await onSubmit(payload);
      // The parent refetches, so the confirmed branch above takes over.
    } catch (err) {
      setError(err);
      setMode("error");
    }
  }

  const changed = category !== triage.category || priority !== triage.priority;

  return (
    <div>
      <p className="review-q">
        Was this classification correct? Your answer is written to the feedback log and shown as
        model accuracy in Analytics.
      </p>

      {mode === "idle" || mode === "error" ? (
        <div className="review-actions">
          <button
            className="review-btn"
            data-kind="ok"
            disabled={disabled || mode === "sending"}
            onClick={() => send({ correct: true })}
            title={disabledReason}
          >
            <b>Correct</b>
            <span>Category and priority both stand</span>
          </button>
          <button
            className="review-btn"
            data-kind="fix"
            disabled={disabled}
            onClick={() => setMode("correcting")}
            title={disabledReason}
          >
            <b>Needs correction</b>
            <span>Reclassify this email</span>
          </button>
        </div>
      ) : null}

      {mode === "sending" ? <p className="form-help">Recording review…</p> : null}

      {mode === "correcting" ? (
        <div className="correction">
          <div className="correction-row">
            <label htmlFor="correct-category">Category</label>
            <select
              id="correct-category"
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="correction-row">
            <legend className="correction-legend">Priority</legend>
            <div className="segmented">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  data-p={p}
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  title={priorityMeta(p).label}
                >
                  {p}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="correction-foot">
            <button
              className="btn"
              data-variant="primary"
              data-size="sm"
              disabled={!changed}
              title={changed ? undefined : "Change the category or priority before submitting"}
              onClick={() =>
                send({
                  correct: false,
                  corrected_category: category,
                  corrected_priority: priority,
                })
              }
            >
              Submit correction
            </button>
            <button className="btn" data-size="sm" data-variant="quiet" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="form-help" role="alert" style={{ color: "var(--p1)", marginTop: 10 }}>
          <IconAlert style={{ width: 12, height: 12, verticalAlign: "-1px", marginRight: 5 }} />
          {error.headline}. {error.message}
        </p>
      ) : null}

      {disabled && disabledReason ? <p className="form-help">{disabledReason}</p> : null}
    </div>
  );
}
