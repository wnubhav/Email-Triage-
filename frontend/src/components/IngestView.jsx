import { useRef, useState } from "react";
import { IconAlert, IconCheckCircle } from "./Icons.jsx";

const SAMPLE = `[
  {
    "message_id": "ops-2291@techventures.io",
    "sender": "ops@techventures.io",
    "subject": "License checkout failing on innovus queue",
    "body": "lmstat reports Connection refused on port 27000 since 18:30."
  }
]`;

/**
 * Ingest.
 *
 * Single ingest is synchronous: POST /api/emails runs the preprocessor, the
 * Gemini call and the similarity search before it responds, so it can take a
 * few seconds. Batch ingest returns 202 immediately and is then polled through
 * GET /api/emails/batch/{job_id}; the progress shown is the real completed
 * count from that job, never an animation.
 */
export function IngestView({ onIngest, onBatch, batch, disabled, disabledReason, onOpenEmail }) {
  return (
    <div className="page">
      <div className="page-head">
        <h2>Ingest</h2>
        <p>
          Submit mail to the pipeline. Every email is preprocessed, classified by the model, matched
          against previously triaged mail, and stored, by the same path a Gmail or IMAP connector
          would use.
        </p>
      </div>

      {disabled ? (
        <div className="panel" style={{ marginBottom: 12, borderColor: "rgba(223,160,42,.32)" }}>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <IconAlert style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
            <div>
              <b style={{ color: "var(--fg-hi)", fontSize: 12.5 }}>Ingest is unavailable</b>
              <p className="form-help" style={{ marginTop: 3 }}>{disabledReason}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid" data-cols="2">
        <SingleIngest onIngest={onIngest} disabled={disabled} onOpenEmail={onOpenEmail} />
        <BatchIngest onBatch={onBatch} batch={batch} disabled={disabled} />
      </div>
    </div>
  );
}

function SingleIngest({ onIngest, disabled, onOpenEmail }) {
  const [form, setForm] = useState({ message_id: "", sender: "", subject: "", body: "" });
  const [state, setState] = useState("idle"); // idle | sending | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const complete = form.sender.trim() && form.subject.trim() && form.body.trim();

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      const payload = {
        ...form,
        message_id: form.message_id.trim() || `console-${Date.now()}@triage.local`,
      };
      const triage = await onIngest(payload);
      setResult(triage);
      setState("done");
      setForm({ message_id: "", sender: "", subject: "", body: "" });
    } catch (err) {
      setError(err);
      setState("error");
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <p className="mlabel">
        Single email <span className="mlabel-tail">POST /api/emails</span>
      </p>

      <div className="form-row">
        <label htmlFor="in-sender">Sender</label>
        <input
          id="in-sender"
          className="field"
          value={form.sender}
          onChange={set("sender")}
          placeholder="engineer@customer.com"
          disabled={disabled || state === "sending"}
          required
        />
      </div>

      <div className="form-row">
        <label htmlFor="in-subject">Subject</label>
        <input
          id="in-subject"
          className="field"
          value={form.subject}
          onChange={set("subject")}
          placeholder="Virtuoso crash on netlist import"
          disabled={disabled || state === "sending"}
          required
        />
      </div>

      <div className="form-row">
        <label htmlFor="in-body">Body</label>
        <textarea
          id="in-body"
          className="field"
          rows={8}
          value={form.body}
          onChange={set("body")}
          placeholder="Paste the email body, including any log output or stack trace."
          disabled={disabled || state === "sending"}
          required
        />
        <p className="form-help">
          HTML, quoted thread history and over-long log dumps are stripped by the preprocessor
          before the model sees the text.
        </p>
      </div>

      <div className="form-row">
        <label htmlFor="in-mid">Message-ID (optional)</label>
        <input
          id="in-mid"
          className="field"
          value={form.message_id}
          onChange={set("message_id")}
          placeholder="generated if left blank"
          disabled={disabled || state === "sending"}
        />
        <p className="form-help">Re-sending a message_id that already exists returns the stored triage instead of re-running the model.</p>
      </div>

      <button className="btn" data-variant="primary" disabled={disabled || !complete || state === "sending"}>
        {state === "sending" ? "Triaging…" : "Ingest and triage"}
      </button>

      {state === "sending" ? (
        <p className="form-help">
          Waiting on the model. This request runs preprocessing, classification and similarity
          search before it returns.
        </p>
      ) : null}

      {state === "done" && result ? (
        <div className="recorded" style={{ marginTop: 12 }}>
          <IconCheckCircle />
          <div>
            <b>
              Triaged as {result.priority} · {result.category}
            </b>
            <span>
              Confidence {Math.round(result.confidence)}%.{" "}
              {onOpenEmail ? (
                <button
                  type="button"
                  className="btn"
                  data-size="sm"
                  data-variant="quiet"
                  style={{ padding: 0, height: "auto", color: "var(--accent)" }}
                  onClick={() => onOpenEmail(result.email_id)}
                >
                  Open in queue
                </button>
              ) : null}
            </span>
          </div>
        </div>
      ) : null}

      {state === "error" && error ? (
        <p className="form-help" role="alert" style={{ color: "var(--p1)" }}>
          {error.headline}. {error.message}
        </p>
      ) : null}
    </form>
  );
}

function BatchIngest({ onBatch, batch, disabled }) {
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const fileRef = useRef(null);

  function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result || ""));
      setParseError(null);
    };
    reader.onerror = () => setParseError("The file could not be read.");
    reader.readAsText(file);
    event.target.value = "";
  }

  function parse() {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return { error: `Not valid JSON: ${err.message}` };
    }
    const list = Array.isArray(data) ? data : data?.emails;
    if (!Array.isArray(list)) {
      return { error: 'Expected a JSON array of emails, or an object with an "emails" array.' };
    }
    if (list.length === 0) return { error: "The array is empty." };

    for (let i = 0; i < list.length; i += 1) {
      for (const key of ["sender", "subject", "body"]) {
        if (typeof list[i]?.[key] !== "string" || !list[i][key].trim()) {
          return { error: `Item ${i + 1} is missing a non-empty "${key}".` };
        }
      }
    }
    return {
      emails: list.map((item, i) => ({
        message_id: item.message_id || `batch-${Date.now()}-${i}@triage.local`,
        sender: item.sender,
        subject: item.subject,
        body: item.body,
      })),
    };
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitError(null);
    const { emails, error } = parse();
    if (error) {
      setParseError(error);
      return;
    }
    setParseError(null);
    try {
      await onBatch(emails);
    } catch (err) {
      setSubmitError(err);
    }
  }

  const running = batch && batch.status !== "done";

  return (
    <form className="panel" onSubmit={submit}>
      <p className="mlabel">
        Batch <span className="mlabel-tail">POST /api/emails/batch</span>
      </p>

      <div className="form-row">
        <label htmlFor="in-batch">Emails (JSON)</label>
        <textarea
          id="in-batch"
          className="field"
          rows={11}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParseError(null);
          }}
          placeholder={SAMPLE}
          disabled={disabled || running}
          spellCheck="false"
        />
        <p className="form-help">
          An array of {"{ message_id, sender, subject, body }"}. The server accepts the job
          immediately with 202 and processes it in the background.
        </p>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <button className="btn" data-variant="primary" disabled={disabled || !text.trim() || running}>
          {running ? "Batch running…" : "Queue batch"}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={disabled || running}>
          Load .json file
        </button>
        <button
          type="button"
          className="btn"
          data-variant="quiet"
          onClick={() => {
            setText(SAMPLE);
            setParseError(null);
          }}
          disabled={disabled || running}
        >
          Insert example
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={readFile}
          disabled={disabled || running}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {parseError ? (
        <p className="form-help" role="alert" style={{ color: "var(--p1)" }}>
          <IconAlert style={{ width: 12, height: 12, verticalAlign: "-1px", marginRight: 5 }} />
          {parseError}
        </p>
      ) : null}

      {submitError ? (
        <p className="form-help" role="alert" style={{ color: "var(--p1)" }}>
          {submitError.headline}. {submitError.message}
        </p>
      ) : null}

      {batch ? <BatchProgress batch={batch} /> : null}
    </form>
  );
}

function BatchProgress({ batch }) {
  const pct = batch.total ? Math.round((batch.completed / batch.total) * 100) : 0;
  const label = { queued: "Queued", processing: "Processing", done: "Complete" }[batch.status] || batch.status;

  return (
    <div className="batch" style={{ marginTop: 14 }}>
      <div className="batch-top">
        <span className="batch-state" data-s={batch.status}>
          {label}
        </span>
        <span className="batch-count">
          {batch.completed} <small>/ {batch.total}</small>
        </span>
      </div>
      <div
        className="batch-track"
        role="progressbar"
        aria-valuenow={batch.completed}
        aria-valuemin={0}
        aria-valuemax={batch.total}
        aria-label={`Batch ${label}: ${batch.completed} of ${batch.total} processed`}
      >
        <div className="batch-fill" data-s={batch.status} style={{ width: `${pct}%` }} />
      </div>
      <div className="batch-job">
        job {batch.job_id}
        {batch.status === "done" ? " · queue refreshed" : " · polling every 1.5s"}
      </div>
      {batch.error ? (
        <p className="form-help" role="alert" style={{ color: "var(--p1)" }}>
          Lost contact with the job: {batch.error}
        </p>
      ) : null}
    </div>
  );
}
