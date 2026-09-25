import { CATEGORIES, PRIORITIES, priorityMeta, categoryMeta } from "../lib/format.js";

/**
 * System reference.
 *
 * The pipeline constants shown here are the ones the backend actually runs on
 * (preprocessor.py, similarity.py, gemini_client.py). This page is where the
 * shape of the system is documented for whoever is operating it.
 */
const ENDPOINTS = [
  ["POST", "/api/emails", "Ingest one email: preprocess, classify, match, store. Returns the triage result."],
  ["POST", "/api/emails/batch", "Accept a batch and process it in the background. Returns 202 with a job id."],
  ["GET", "/api/emails/batch/{job_id}", "Progress for a batch job: queued, processing or done."],
  ["GET", "/api/emails", "List the queue. Filterable by priority and category."],
  ["GET", "/api/emails/{id}", "One email with its full body, triage result and review state."],
  ["POST", "/api/triage/{id}/feedback", "Record a human confirmation or correction. Returns 204."],
  ["GET", "/api/stats", "Aggregate counts, average confidence and review accuracy."],
  ["GET", "/api/provider", "Which model backs triage, and whether a key is configured."],
];

export function SystemView({ focus = "connection", connection, apiBase, stats, error, provider }) {
  const live = connection === "live";
  const showConnection = focus === "connection";

  return (
    <div className="page">
      <div className="page-head">
        <h2>{showConnection ? "Connection" : "Configuration"}</h2>
        <p>
          {showConnection
            ? "How this console is wired to the triage backend, and the API it talks to."
            : "The model behind triage and the constants the pipeline runs on."}
        </p>
      </div>

      <div className="grid" data-cols="2" style={{ marginBottom: 14 }}>
        {showConnection ? (
        <div className="panel">
          <p className="mlabel">Connection</p>
          <dl className="kv">
            <dt>State</dt>
            <dd>
              <span className="chip" data-tone={live ? "ok" : "warn"}>
                {live ? "Connected" : connection === "down" ? "Unreachable" : "Demo data"}
              </span>
            </dd>

            <dt>API base</dt>
            <dd className="mono">{apiBase || "same origin (/api → vite proxy)"}</dd>

            <dt>Records</dt>
            <dd>
              {stats?.total_triaged != null
                ? `${stats.total_triaged} triage result${stats.total_triaged === 1 ? "" : "s"} stored`
                : "unknown"}
            </dd>

            {error ? (
              <>
                <dt>Last error</dt>
                <dd style={{ color: "var(--p1)" }}>
                  {error.headline}. {error.message}
                </dd>
              </>
            ) : null}
          </dl>
          {!live ? (
            <p className="form-help">
              Start the backend with <span className="mono">uvicorn app.main:app --reload --port 8000</span>{" "}
              from the backend directory, then press Refresh in the top bar.
            </p>
          ) : null}
        </div>
        ) : null}

        {!showConnection ? (
        <div className="panel">
          <p className="mlabel">Model and pipeline</p>
          <dl className="kv">
            <dt>Provider</dt>
            <dd>Google Gemini</dd>

            <dt>Model</dt>
            <dd className="mono">{provider?.model || "gemini-3.6-flash"}</dd>

            <dt>API key</dt>
            <dd>
              {provider
                ? provider.configured
                  ? "GEMINI_API_KEY is set"
                  : "GEMINI_API_KEY is not set, so live triage will fail"
                : "unknown"}
            </dd>

            <dt>Body budget</dt>
            <dd className="mono">3000 chars</dd>

            <dt>Log dump cap</dt>
            <dd className="mono">40 lines</dd>

            <dt>Similarity</dt>
            <dd className="mono">TF-IDF cosine ≥ 0.35</dd>

            <dt>Corpus</dt>
            <dd>subject + intent_summary of every prior triage</dd>

            <dt>Store</dt>
            <dd className="mono">SQLite · triage.db</dd>
          </dl>
        </div>
        ) : null}
      </div>

      {showConnection ? (
      <div className="panel" style={{ marginBottom: 14 }}>
        <p className="mlabel">
          API surface <span className="mlabel-tail">docs at /docs</span>
        </p>
        {ENDPOINTS.map(([method, path, note]) => (
          <div className="endpoint" key={method + path} data-m={method}>
            <b>{method}</b>
            <span>
              {path}
              <em>{note}</em>
            </span>
          </div>
        ))}
      </div>
      ) : null}

      {!showConnection ? (
      <div className="grid" data-cols="2">
        <div className="panel">
          <p className="mlabel">Priority ladder</p>
          <dl className="kv">
            {PRIORITIES.map((p) => {
              const meta = priorityMeta(p);
              return (
                <div key={p} style={{ display: "contents" }}>
                  <dt style={{ color: `var(--${p.toLowerCase()})` }}>
                    {p} {meta.label}
                  </dt>
                  <dd>{meta.note}</dd>
                </div>
              );
            })}
          </dl>
        </div>

        <div className="panel">
          <p className="mlabel">Categories</p>
          <dl className="kv">
            {CATEGORIES.map((c) => (
              <div key={c} style={{ display: "contents" }}>
                <dt>{categoryMeta(c).label}</dt>
                <dd>{c}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      ) : null}
    </div>
  );
}
