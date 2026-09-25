import { PRIORITIES, CATEGORIES, priorityMeta, categoryMeta } from "../lib/format.js";
import { ErrorState, EmptyState, PanelSkeleton } from "./States.jsx";
import { IconChart } from "./Icons.jsx";

/**
 * Analytics.
 *
 * Everything here is either a field of GET /api/stats or a cross-tabulation of
 * the queue currently loaded, labelled as such. Nothing is padded out with a
 * chart that has no question behind it.
 */
export function AnalyticsView({ stats, emails, loading, error, onRetry, demo }) {
  if (loading) {
    return (
      <div className="page">
        <PanelSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={onRetry} context="Could not load statistics." />
      </div>
    );
  }

  const empty = !stats || Object.keys(stats).length === 0 || !stats.total_triaged;
  if (empty) {
    return (
      <div className="page">
        <EmptyState icon={<IconChart />} title="No triage results yet">
          /api/stats returns an empty object until the first email has been triaged. Ingest one and
          the distributions, confidence average and review accuracy will populate here.
        </EmptyState>
      </div>
    );
  }

  const total = stats.total_triaged;
  const p1 = stats.by_priority?.P1 || 0;
  const reviewed = stats.reviewed_count ?? 0;
  const accuracy = stats.feedback_accuracy;
  const triaged = emails.filter((e) => e.triage);

  return (
    <div className="page">
      <div className="page-head">
        <h2>Analytics</h2>
        <p>
          Aggregates over every triage result in the database. The matrix below cross-tabulates the{" "}
          {triaged.length} email{triaged.length === 1 ? "" : "s"} currently loaded in the queue.
          {demo ? " Figures are from the bundled demo dataset." : ""}
        </p>
      </div>

      <div className="metricband">
        <Metric label="Triaged" value={total} note="Emails with a triage result" />
        <Metric
          label="P1 share"
          value={total ? `${Math.round((p1 / total) * 100)}%` : "-"}
          tone={p1 ? "p1" : "muted"}
          note={`${p1} critical of ${total}`}
        />
        <Metric
          label="Avg confidence"
          value={stats.avg_confidence != null ? `${stats.avg_confidence}%` : "-"}
          note="Mean of the model's self-reported certainty"
        />
        <Metric
          label="Model accuracy"
          value={accuracy != null ? `${accuracy}%` : "-"}
          tone={accuracy == null ? "muted" : accuracy >= 90 ? "ok" : undefined}
          note={
            reviewed
              ? `${reviewed} reviewed, ${stats.corrections_count ?? 0} corrected`
              : "No human reviews recorded yet"
          }
        />
      </div>

      <div className="grid" data-cols="2" style={{ marginBottom: 12 }}>
        <div className="panel">
          <p className="mlabel">
            Priority distribution <span className="mlabel-tail">all results</span>
          </p>
          <Distribution
            rows={PRIORITIES.map((p) => ({
              key: p,
              label: `${p} ${priorityMeta(p).label}`,
              value: stats.by_priority?.[p] || 0,
              tone: p,
            }))}
            total={total}
          />
        </div>

        <div className="panel">
          <p className="mlabel">
            Category distribution <span className="mlabel-tail">all results</span>
          </p>
          <Distribution
            rows={CATEGORIES.map((c) => ({
              key: c,
              label: categoryMeta(c).label,
              title: c,
              value: stats.by_category?.[c] || 0,
            }))}
            total={total}
          />
        </div>
      </div>

      <div className="panel">
        <p className="mlabel">
          Category × priority <span className="mlabel-tail">loaded queue</span>
        </p>
        <Matrix emails={triaged} />
      </div>
    </div>
  );
}

function Metric({ label, value, note, tone }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-val" data-tone={tone}>
        {value}
      </span>
      {note ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}

function Distribution({ rows, total }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="dist">
      {rows.map((row) => (
        <div className="dist-item" key={row.key}>
          <span className="dist-key" title={row.title || row.label}>
            {row.label}
          </span>
          <span className="dist-track">
            <span
              className="dist-fill"
              data-p={row.tone}
              style={{ width: row.value ? `max(2px, ${(row.value / max) * 100}%)` : 0 }}
            />
          </span>
          <span className="dist-val">
            {row.value} <small>{total ? `${Math.round((row.value / total) * 100)}%` : "0%"}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Which kinds of problem arrive at which urgency: the question a support lead
 * actually asks of this data.
 */
function Matrix({ emails }) {
  if (emails.length === 0) {
    return <p className="form-help">No triaged email is loaded in the queue.</p>;
  }

  const counts = {};
  for (const email of emails) {
    const { category, priority } = email.triage;
    counts[category] = counts[category] || {};
    counts[category][priority] = (counts[category][priority] || 0) + 1;
  }

  const present = CATEGORIES.filter((c) => counts[c]);
  const max = Math.max(1, ...present.flatMap((c) => PRIORITIES.map((p) => counts[c][p] || 0)));

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="matrix">
        <caption className="sr-only">Count of triaged emails by category and priority</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            {PRIORITIES.map((p) => (
              <th scope="col" key={p}>
                {p}
              </th>
            ))}
            <th scope="col">Σ</th>
          </tr>
        </thead>
        <tbody>
          {present.map((category) => {
            const row = counts[category];
            const sum = PRIORITIES.reduce((a, p) => a + (row[p] || 0), 0);
            return (
              <tr key={category}>
                <th scope="row" title={category}>
                  {categoryMeta(category).label}
                </th>
                {PRIORITIES.map((p) => {
                  const n = row[p] || 0;
                  return (
                    <td
                      key={p}
                      data-zero={n === 0}
                      style={
                        n
                          ? { background: `color-mix(in srgb, var(--accent) ${(n / max) * 26}%, transparent)` }
                          : undefined
                      }
                    >
                      {n || "·"}
                    </td>
                  );
                })}
                <td>{sum}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
