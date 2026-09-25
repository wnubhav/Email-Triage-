import { useState } from "react";
import { IconCopy, IconChevron } from "./Icons.jsx";
import { priorityMeta } from "../lib/format.js";

/**
 * The generated Jira issue, rendered as an engineer would read it: title,
 * component, priority, then reproduction, expected and actual.
 *
 * The raw payload stays one click away because it is what a Jira integration
 * would actually POST, and copying it is the real, working action here. This
 * console does not create issues in Jira, so it does not offer a button that
 * claims to.
 */
export function JiraPreview({ jira }) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(null);
  const meta = priorityMeta(jira.priority);
  const payload = JSON.stringify(jira, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2200);
  }

  return (
    <div className="jira">
      <div className="jira-head">
        <div className="jira-title">{jira.title}</div>
        <div className="jira-tags" title={`${meta.code}: ${meta.label}`}>
          {jira.priority} &middot; {jira.component}
        </div>
      </div>

      <dl className="jira-grid">
        <div className="jira-cell">
          <dt>Steps to reproduce</dt>
          <dd className="mono">{jira.steps_to_reproduce}</dd>
        </div>
        <div className="jira-cell" data-tone="expected">
          <dt>Expected</dt>
          <dd>{jira.expected}</dd>
        </div>
        <div className="jira-cell" data-tone="actual">
          <dt>Actual</dt>
          <dd>{jira.actual}</dd>
        </div>
      </dl>

      {showRaw ? <pre className="jira-raw">{payload}</pre> : null}

      <div className="jira-foot">
        <button className="btn" data-size="sm" onClick={copy}>
          <IconCopy />
          {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy payload"}
        </button>
        <button
          className="btn"
          data-size="sm"
          data-variant="quiet"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
        >
          <IconChevron style={{ transform: showRaw ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
          {showRaw ? "Hide JSON" : "View JSON"}
        </button>
      </div>
    </div>
  );
}
