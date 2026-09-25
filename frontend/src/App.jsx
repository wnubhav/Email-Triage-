import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "./api.js";
import { createDemoSource } from "./lib/demoSource.js";
import { NavRail, BrandMark, SECTIONS } from "./components/NavRail.jsx";
import { TopBar } from "./components/TopBar.jsx";
import { QueuePanel } from "./components/QueuePanel.jsx";
import { MessagePanel } from "./components/MessagePanel.jsx";
import { TriagePanel } from "./components/TriagePanel.jsx";
import { AnalyticsView } from "./components/AnalyticsView.jsx";
import { IngestView } from "./components/IngestView.jsx";
import { ReviewView } from "./components/ReviewView.jsx";
import { SystemView } from "./components/SystemView.jsx";
import { LiveRegion } from "./components/States.jsx";

const API_BASE = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");
const BATCH_POLL_MS = 1500;

/** True while the layout is a single column and queue/detail become stages. */
function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export default function App() {
  /* ── data source: the live API, or the demo set if it cannot be reached ── */
  const [demoSource, setDemoSource] = useState(null);
  const source = demoSource || api;
  const demo = Boolean(demoSource);

  /* ── queue ── */
  const [emails, setEmails] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState(null);

  /* ── selection and detail ── */
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState({}); // id -> full email record
  const detailsRef = useRef({}); // same cache, readable without re-creating callbacks
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [messageTab, setMessageTab] = useState("clean");

  /* ── filters ── */
  const [priority, setPriority] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");

  /* ── stats, batch, shell ── */
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [provider, setProvider] = useState(null); // which model backs triage
  const [batch, setBatch] = useState(null);
  const [section, setSection] = useState("queue");
  const [stage, setStage] = useState("queue"); // narrow layout only
  const [announcement, setAnnouncement] = useState("");

  const [ready, setReady] = useState(false); // bootstrap finished; filters may drive loads

  const narrow = useIsNarrow();
  const searchRef = useRef(null);
  const bootstrapped = useRef(false);
  const loadedFilters = useRef("ALL|ALL"); // last filter pair actually fetched

  /* The active client, readable synchronously. Bootstrap swaps in the demo
     source mid-flight, and a callback captured before that swap would
     otherwise keep talking to the API that just failed. */
  const sourceRef = useRef(api);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  /* ── loading ─────────────────────────────────────────────────────── */

  const loadQueue = useCallback(
    async (client, filters) => {
      setQueueLoading(true);
      setQueueError(null);
      try {
        const list = await client.listEmails(filters);
        setEmails(list);
        return list;
      } catch (err) {
        setQueueError(err);
        throw err;
      } finally {
        setQueueLoading(false);
      }
    },
    [],
  );

  /* Which model backs triage, and whether a key is configured. Fetched once;
     a failure here is not worth surfacing, the System page just says unknown. */
  const loadProvider = useCallback(async (client) => {
    if (client?.isDemo || typeof client?.provider !== "function") return;
    try {
      setProvider(await client.provider());
    } catch {
      setProvider(null);
    }
  }, []);

  const loadStats = useCallback(async (client) => {
    setStatsError(null);
    try {
      setStats(await client.stats());
    } catch (err) {
      setStatsError(err);
    }
  }, []);

  /* First load: try the API. Only an unreachable backend falls back to demo;
     a 500 is a real failure and is surfaced as one. */
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const list = await loadQueue(api, { priority: "ALL", category: "ALL" });
        await loadStats(api);
        loadProvider(api);
        if (list.length) selectFirst(list);
      } catch (err) {
        if (err?.kind === "offline" || err?.kind === "timeout") {
          const fallback = createDemoSource();
          sourceRef.current = fallback; // effective immediately, unlike the state update
          setDemoSource(fallback);
          const list = await loadQueue(fallback, { priority: "ALL", category: "ALL" });
          await loadStats(fallback);
          if (list.length) selectFirst(list);
          setAnnouncement("The triage API is unreachable. Showing the bundled demo dataset.");
        }
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Priority and category filtering is done by the backend, as the API
     supports it. Refetch when either changes.

     This waits for `ready` so it cannot race the bootstrap above; otherwise a
     doomed request against the live API would overwrite the demo state that
     bootstrap had just installed. Comparing against the last-loaded filter
     signature also makes it idempotent, so StrictMode's double-invocation in
     development does not fire a second identical request. */
  useEffect(() => {
    if (!ready) return;
    const signature = `${priority}|${category}`;
    if (loadedFilters.current === signature) return;
    loadedFilters.current = signature;
    loadQueue(source, { priority, category }).catch(() => {});
  }, [ready, priority, category, source, loadQueue]);

  function selectFirst(list) {
    const first = list[0];
    if (first) {
      setSelectedId(first.id);
      fetchDetail(first.id);
    }
  }

  /* ── detail ─────────────────────────────────────────────────────── */

  const fetchDetail = useCallback(
    async (id, { force = false } = {}) => {
      if (!force && detailsRef.current[id]) return detailsRef.current[id];
      setDetailLoading(true);
      setDetailError(null);
      try {
        const full = await sourceRef.current.getEmail(id);
        detailsRef.current = { ...detailsRef.current, [id]: full };
        setDetails(detailsRef.current);
        // Keep the queue row in step with the detail (review flags, etc.).
        setEmails((prev) =>
          prev.map((e) => (e.id === full.id ? { ...e, triaged: full.triaged, triage: full.triage } : e)),
        );
        return full;
      } catch (err) {
        setDetailError(err);
        return null;
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const selectEmail = useCallback(
    (email) => {
      const id = typeof email === "object" ? email.id : email;
      setSelectedId(id);
      setMessageTab("clean");
      setDetailError(null);
      if (narrow) setStage("detail");
      fetchDetail(id);
    },
    [fetchDetail, narrow],
  );

  /** Used by the similarity link and the other views: focus an email by id. */
  const openEmailById = useCallback(
    async (id) => {
      setSection("queue");
      setSelectedId(id);
      setMessageTab("clean");
      setDetailError(null);
      if (narrow) setStage("detail");
      const known = emails.some((e) => e.id === id);
      const full = await fetchDetail(id, { force: !known });

      // A similar-issue match often sits outside the active filter. Widen the
      // queue so the row the user was just sent to is actually in the list.
      if (full && !known) {
        setQuery("");
        if (priority !== "ALL" || category !== "ALL") {
          setPriority("ALL");
          setCategory("ALL"); // the filter effect refetches
        } else {
          loadedFilters.current = "ALL|ALL";
          loadQueue(source, { priority: "ALL", category: "ALL" }).catch(() => {});
        }
      }
    },
    [emails, fetchDetail, narrow, priority, category, source, loadQueue],
  );

  /* ── actions ────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    try {
      await loadQueue(source, { priority, category });
      await loadStats(source);
      if (selectedId != null) await fetchDetail(selectedId, { force: true });
      setAnnouncement("Queue refreshed.");
    } catch {
      /* the error is already rendered by the queue panel */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, priority, category, selectedId]);

  const submitFeedback = useCallback(
    async (payload) => {
      const triageId = detailsRef.current[selectedId]?.triage?.id;
      if (!triageId) throw new Error("No triage id");
      await source.submitFeedback(triageId, payload);
      await fetchDetail(selectedId, { force: true });
      await loadStats(source);
      setAnnouncement(payload.correct ? "Classification confirmed." : "Correction recorded.");
    },
    [selectedId, source, fetchDetail, loadStats],
  );

  const ingestOne = useCallback(
    async (payload) => {
      const triage = await source.ingestEmail(payload);
      await loadQueue(source, { priority, category }).catch(() => {});
      await loadStats(source);
      setAnnouncement(`Email triaged as ${triage.priority}, ${triage.category}.`);
      return triage;
    },
    [source, priority, category, loadQueue, loadStats],
  );

  const startBatch = useCallback(
    async (list) => {
      const job = await source.ingestBatch(list);
      setBatch(job);
      setAnnouncement(`Batch of ${job.total} queued.`);
      return job;
    },
    [source],
  );

  /* Poll a batch job only while one is actually running. */
  useEffect(() => {
    if (!batch || batch.status === "done" || batch.error) return undefined;
    const timer = setInterval(async () => {
      try {
        const next = await source.batchStatus(batch.job_id);
        setBatch(next);
        if (next.status === "done") {
          await loadQueue(source, { priority, category }).catch(() => {});
          await loadStats(source);
          setAnnouncement(`Batch complete: ${next.completed} of ${next.total} processed.`);
        }
      } catch (err) {
        setBatch((prev) => (prev ? { ...prev, error: err.message } : prev));
      }
    }, BATCH_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.job_id, batch?.status, source, priority, category]);

  /* ── derived ────────────────────────────────────────────────────── */

  /* Backend handles priority and category; free-text search runs over the
     records already loaded, and says so in the placeholder. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) =>
      [e.subject, e.sender, e.preview, e.triage?.intent_summary, e.triage?.category]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q)),
    );
  }, [emails, query]);

  const counts = useMemo(
    () => ({
      total: emails.length,
      p1: emails.filter((e) => e.triage?.priority === "P1").length,
      unreviewed: emails.filter((e) => e.triage && !e.triage.feedback).length,
    }),
    [emails],
  );

  const selected = selectedId != null ? details[selectedId] || emails.find((e) => e.id === selectedId) : null;

  const connection = queueLoading && !emails.length ? "busy" : demo ? "demo" : queueError ? "down" : "live";

  /* ── keyboard ───────────────────────────────────────────────────── */

  useEffect(() => {
    function onKeyDown(event) {
      const el = event.target;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

      if (event.key === "Escape") {
        if (typing) el.blur();
        else if (query) setQuery("");
        else if (narrow && stage === "detail") setStage("queue");
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const index = SECTIONS.findIndex((_, i) => String(i + 1) === event.key);
      if (index !== -1) {
        event.preventDefault();
        setSection(SECTIONS[index].id);
        return;
      }

      if (event.key === "r") {
        event.preventDefault();
        refresh();
        return;
      }

      if (section !== "queue") return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        const at = visible.findIndex((e) => e.id === selectedId);
        const next = event.key === "j" ? at + 1 : at - 1;
        if (next >= 0 && next < visible.length) selectEmail(visible[next]);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, selectedId, selectEmail, refresh, section, query, narrow, stage]);

  /* ── render ─────────────────────────────────────────────────────── */

  const readOnlyReason = demo
    ? "The console is showing demo data, so reviews are kept in this browser session only and are not written to the feedback log."
    : undefined;

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="brand">
        <BrandMark />
        <span className="brand-name">Triage Console</span>
      </div>

      <TopBar
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        counts={counts}
        connection={connection}
        busyLabel="Loading"
        onRefresh={refresh}
        refreshing={queueLoading}
        sectionLabel={SECTIONS.find((s) => s.id === section)?.label}
      />

      <NavRail
        active={section}
        onChange={setSection}
        badges={{ review: counts.unreviewed, queue: counts.p1 }}
      />

      <main className="view" id="main">
        {section === "queue" ? (
          <div className="workspace" data-stage={stage}>
            <QueuePanel
              emails={visible}
              totalLoaded={emails.length}
              selectedId={selectedId}
              onSelect={selectEmail}
              loading={queueLoading}
              error={queueError}
              onRetry={refresh}
              priority={priority}
              category={category}
              onPriority={setPriority}
              onCategory={setCategory}
              query={query}
              onClearFilters={() => {
                setPriority("ALL");
                setCategory("ALL");
                setQuery("");
              }}
              onIngest={() => setSection("ingest")}
            />

            {/* display:contents on wide screens so message + triage sit
                directly in the workspace grid; a real flex column below
                1180px, where they stack instead. See styles.css. */}
            <div className="stage-detail">
              <MessagePanel
                email={selected}
                loading={detailLoading}
                error={detailError}
                onRetry={() => selectedId != null && fetchDetail(selectedId, { force: true })}
                tab={messageTab}
                onTab={setMessageTab}
                showBack={narrow}
                onBack={() => setStage("queue")}
              />
              <TriagePanel
                email={selected}
                loading={detailLoading}
                onOpenEmail={openEmailById}
                onSubmitFeedback={submitFeedback}
                readOnly={false}
                readOnlyReason={readOnlyReason}
              />
            </div>
          </div>
        ) : null}

        {section === "ingest" ? (
          <IngestView
            onIngest={ingestOne}
            onBatch={startBatch}
            batch={batch}
            disabled={demo}
            disabledReason={
              demo
                ? "The console cannot reach the triage API, and ingest is a backend operation: it runs the preprocessor, the model call and the similarity search. Start uvicorn on port 8000 and press Refresh."
                : undefined
            }
            onOpenEmail={openEmailById}
          />
        ) : null}

        {section === "analytics" ? (
          <AnalyticsView
            stats={stats}
            emails={emails}
            loading={queueLoading && !stats}
            error={statsError}
            onRetry={() => loadStats(source)}
            demo={demo}
          />
        ) : null}

        {section === "review" ? (
          <ReviewView
            emails={emails}
            stats={stats}
            loading={queueLoading}
            error={queueError}
            onRetry={refresh}
            onOpenEmail={openEmailById}
          />
        ) : null}

        {section === "connection" || section === "configuration" ? (
          <SystemView
            focus={section}
            connection={connection}
            apiBase={API_BASE}
            stats={stats}
            error={queueError || statsError}
            provider={provider}
          />
        ) : null}
      </main>

      <LiveRegion>{announcement}</LiveRegion>
    </div>
  );
}
