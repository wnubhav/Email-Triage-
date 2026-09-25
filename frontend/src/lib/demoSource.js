/**
 * A stand-in for the API, used only when the backend is unreachable.
 *
 * It implements the same method signatures as api.js and mirrors the backend's
 * own behaviour (list responses drop the bodies and carry a preview; detail
 * responses carry both bodies) so App.jsx never branches on demo vs. live.
 *
 * Writes are held in memory for the session and are honestly labelled as such
 * in the UI. Ingest is refused rather than faked, because there is nothing
 * here to run the preprocessor, the model or the similarity search.
 */
import { ApiError } from "../api.js";
import { DEMO_EMAILS } from "../demoData.js";

const DELAY = 140; // enough for loading states to be real, not a fake spinner

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDemoSource() {
  const store = deepCopy(DEMO_EMAILS);

  function find(id) {
    return store.find((e) => e.id === Number(id));
  }

  return {
    isDemo: true,

    async listEmails({ priority, category, limit = 100 } = {}) {
      await sleep(DELAY);
      return store
        .filter((e) => {
          if (priority && priority !== "ALL" && e.triage?.priority !== priority) return false;
          if (category && category !== "ALL" && e.triage?.category !== category) return false;
          return true;
        })
        .slice(0, limit)
        .map((e) => ({ ...deepCopy(e), body_raw: null, body_clean: null }));
    },

    async getEmail(id) {
      await sleep(DELAY);
      const email = find(id);
      if (!email) throw new ApiError("Not found", { kind: "http", status: 404 });
      return deepCopy(email);
    },

    async submitFeedback(triageId, feedback) {
      await sleep(DELAY);
      const email = store.find((e) => e.triage?.id === Number(triageId));
      if (!email) throw new ApiError("Triage result not found", { kind: "http", status: 404 });
      email.triage.feedback = {
        correct: feedback.correct,
        corrected_category: feedback.corrected_category ?? null,
        corrected_priority: feedback.corrected_priority ?? null,
        logged_at: new Date().toISOString().replace(/\.\d+Z$/, ""),
      };
      return null;
    },

    async stats() {
      await sleep(DELAY);
      const triages = store.map((e) => e.triage).filter(Boolean);
      if (triages.length === 0) return {};

      const by_priority = {};
      const by_category = {};
      for (const t of triages) {
        by_priority[t.priority] = (by_priority[t.priority] || 0) + 1;
        by_category[t.category] = (by_category[t.category] || 0) + 1;
      }

      const reviews = triages.map((t) => t.feedback).filter(Boolean);
      const accuracy = reviews.length
        ? (reviews.filter((f) => f.correct).length / reviews.length) * 100
        : null;

      return {
        total_triaged: triages.length,
        by_priority,
        by_category,
        avg_confidence: Math.round((triages.reduce((a, t) => a + t.confidence, 0) / triages.length) * 10) / 10,
        feedback_accuracy: accuracy != null ? Math.round(accuracy * 10) / 10 : null,
        reviewed_count: reviews.length,
        corrections_count: reviews.filter((f) => !f.correct).length,
      };
    },

    async ingestEmail() {
      throw new ApiError(
        "Ingest needs the backend running: it is the backend that preprocesses the text, calls the model and searches the corpus.",
        { kind: "offline" },
      );
    },

    async ingestBatch() {
      throw new ApiError("Batch processing needs the backend running.", { kind: "offline" });
    },

    async batchStatus() {
      throw new ApiError("No batch jobs exist without a backend.", { kind: "offline" });
    },
  };
}
