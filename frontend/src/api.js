/**
 * Thin client over the FastAPI triage backend.
 *
 * Every function maps 1:1 onto an endpoint in backend/app/main.py. No shape is
 * invented here; the UI renders exactly what the API returns.
 *
 *   POST   /api/emails                     ingest + triage one email
 *   POST   /api/emails/batch               async batch ingest -> 202 + job_id
 *   GET    /api/emails/batch/{job_id}      batch job progress
 *   GET    /api/emails?priority=&category= queue listing
 *   GET    /api/emails/{id}                detail (bodies + triage + feedback)
 *   POST   /api/triage/{id}/feedback       human review -> 204
 *   GET    /api/stats                      aggregates
 *   GET    /api/provider                   which model backs triage
 */

const BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");

/** Timeouts: a triage call waits on the Gemini API, so it gets a long leash. */
const TIMEOUT_FAST = 10_000;
const TIMEOUT_TRIAGE = 90_000;

export class ApiError extends Error {
  /** kind: "offline" | "timeout" | "http" | "parse" */
  constructor(message, { kind, status = null, detail = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }

  /** Operator-facing text, never a raw stack trace. */
  get headline() {
    if (this.kind === "offline") return "Cannot reach the triage API";
    if (this.kind === "timeout") return "The request timed out";
    if (this.status === 404) return "Not found";
    if (this.status === 422) return "The request was rejected as invalid";
    if (this.status === 429) return "Rate limited by the model provider";
    if (this.status === 503) return "Triage is unavailable";
    if (this.status === 504) return "The model provider did not respond";
    if (this.status >= 500) return "Triage could not be completed";
    return "Request failed";
  }
}

async function request(path, { method = "GET", body, timeout = TIMEOUT_FAST } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new ApiError(`No response within ${Math.round(timeout / 1000)}s.`, { kind: "timeout" });
    }
    throw new ApiError("The backend did not respond. Is uvicorn running on port 8000?", {
      kind: "offline",
    });
  }
  clearTimeout(timer);

  if (!response.ok) {
    let body = "";
    let detail = null;
    try {
      body = await response.text();
      const payload = JSON.parse(body);
      detail = typeof payload?.detail === "string" ? payload.detail : null;
    } catch {
      /* body was absent or not JSON, so fall through with no detail */
    }

    // Distinguish "the backend answered with an error" from "nothing answered".
    // The vite dev proxy reports an unreachable upstream as a 5xx with an empty
    // body, while every FastAPI failure carries a JSON detail. Keying on the
    // body rather than the status matters now that a Gemini outage surfaces as
    // a 502/503/504 with a real message: that is a working backend reporting a
    // provider problem, not a missing backend.
    if (response.status >= 500 && !body.trim()) {
      throw new ApiError("The backend did not respond. Is uvicorn running on port 8000?", {
        kind: "offline",
        status: response.status,
      });
    }

    throw new ApiError(detail || `HTTP ${response.status}`, {
      kind: "http",
      status: response.status,
      detail,
    });
  }

  if (response.status === 204) return null;

  try {
    return await response.json();
  } catch {
    throw new ApiError("The response was not valid JSON.", { kind: "parse" });
  }
}

export const api = {
  listEmails({ priority, category, limit = 100 } = {}) {
    const params = new URLSearchParams();
    if (priority && priority !== "ALL") params.set("priority", priority);
    if (category && category !== "ALL") params.set("category", category);
    params.set("limit", String(limit));
    return request(`/api/emails?${params}`);
  },

  getEmail(id) {
    return request(`/api/emails/${id}`);
  },

  ingestEmail(email) {
    return request("/api/emails", { method: "POST", body: email, timeout: TIMEOUT_TRIAGE });
  },

  ingestBatch(emails) {
    return request("/api/emails/batch", { method: "POST", body: { emails } });
  },

  batchStatus(jobId) {
    return request(`/api/emails/batch/${jobId}`);
  },

  submitFeedback(triageId, feedback) {
    return request(`/api/triage/${triageId}/feedback`, { method: "POST", body: feedback });
  },

  stats() {
    return request("/api/stats");
  },

  provider() {
    return request("/api/provider");
  },
};
