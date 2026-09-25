import { segmentBody, formatWhen, senderParts, preprocessDelta } from "../lib/format.js";
import { PanelSkeleton, ErrorState, EmptyState } from "./States.jsx";
import { IconInboxEmpty, IconBack } from "./Icons.jsx";

/**
 * The message itself, presented as mail rather than as a text dump.
 *
 * Three views of the same record, all real:
 *   CLEANED : body_clean, what preprocess() produced and what the model saw
 *   SOURCE  : body_raw, exactly what arrived
 *   REPLY   : the draft acknowledgement the model returned, if any
 */
export function MessagePanel({ email, loading, error, onRetry, tab, onTab, onBack, showBack }) {
  if (!email && loading) return <div className="message"><PanelSkeleton /></div>;

  if (error) {
    return (
      <div className="message">
        <ErrorState error={error} onRetry={onRetry} context="Could not open this email." />
      </div>
    );
  }

  if (!email) {
    return (
      <div className="message">
        <EmptyState icon={<IconInboxEmpty />} title="No email selected">
          Choose an item from the queue to read it, see how it was classified, and act on it.
          Use <b>j</b> and <b>k</b> to move through the queue.
        </EmptyState>
      </div>
    );
  }

  const when = formatWhen(email.received_at);
  const sender = senderParts(email.sender);
  const delta = preprocessDelta(email.body_raw, email.body_clean);
  const triage = email.triage;
  const detailPending = loading && !email.body_clean;

  return (
    <article className="message" aria-label="Message">
      {showBack ? (
        <div className="backbar">
          <button className="btn" data-size="sm" data-variant="quiet" onClick={onBack}>
            <IconBack /> Queue
          </button>
        </div>
      ) : null}

      <header className="message-head">
        <h2 className="message-subject">{email.subject}</h2>

        <dl className="headers">
          <dt>From</dt>
          <dd>
            <span className="sender-name">{sender.name}</span>
            <span className="sender-addr">{sender.address}</span>
          </dd>

          <dt>Received</dt>
          <dd className="mono">
            <time dateTime={when.iso || undefined}>{when.full}</time>
          </dd>

          <dt>Message-ID</dt>
          <dd className="mono">{email.message_id}</dd>


        </dl>

        <div className="tabs" role="tablist" aria-label="Message view">
          <button
            role="tab"
            className="tab"
            aria-selected={tab === "clean"}
            onClick={() => onTab("clean")}
            title="The preprocessed body: this is the text the model was given"
          >
            Cleaned
          </button>
          <button
            role="tab"
            className="tab"
            aria-selected={tab === "raw"}
            onClick={() => onTab("raw")}
            disabled={!email.body_raw}
            title="The body exactly as it arrived"
          >
            Source
          </button>
          <button
            role="tab"
            className="tab"
            aria-selected={tab === "reply"}
            onClick={() => onTab("reply")}
            disabled={!triage?.draft_reply}
            title="The draft acknowledgement returned by the model"
          >
            Draft reply
          </button>

          {delta && tab !== "reply" ? (
            <span className="tab-note" title="Difference between body_raw and body_clean">
              {delta.removed > 0
                ? `preprocessor −${delta.removed.toLocaleString()} chars (−${delta.percent}%)`
                : "preprocessor: no change"}
              {delta.truncated ? " · truncated" : ""}
            </span>
          ) : null}
        </div>
      </header>

      <div className="message-body" role="tabpanel">
        {detailPending ? <PanelSkeleton /> : <BodyView email={email} tab={tab} />}
      </div>
    </article>
  );
}

function BodyView({ email, tab }) {
  if (tab === "reply") {
    return (
      <>
        <p className="tnote tnote--quiet">Model-generated acknowledgement. Not sent.</p>
        <p className="prose">{email.triage.draft_reply}</p>
      </>
    );
  }

  if (tab === "raw") {
    if (!email.body_raw) return <p className="prose">The source body is not loaded for this email.</p>;
    return (
      <div className="techblock">
        <pre>
          {email.body_raw.split("\n").map((line, i) => (
            <div className="techline" key={i}>
              <i>{i + 1}</i>
              <span>{line || " "}</span>
            </div>
          ))}
        </pre>
      </div>
    );
  }

  const body = email.body_clean || email.preview;
  if (!body) return <p className="prose">This email has no body content.</p>;

  const blocks = segmentBody(body);

  return (
    <>
      {blocks.map((block, i) =>
        block.type === "technical" ? (
          <TechnicalBlock key={i} lines={block.lines} />
        ) : (
          <p className="prose" key={i}>
            {block.lines.join("\n")}
          </p>
        ),
      )}
      {!email.body_clean ? (
        <p className="form-help">Showing the queue excerpt. Open the email to load the full body.</p>
      ) : null}
    </>
  );
}

/**
 * Stack traces, assertions, licence diagnostics and command lines. A line
 * gutter is included because engineers reference these by line.
 */
function TechnicalBlock({ lines }) {
  return (
    <div className="techblock">
      <pre>
        {lines.map((line, i) => (
          <div className="techline" key={i}>
            <i>{i + 1}</i>
            <span>{line || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
