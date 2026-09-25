# Intelligent Email Triage Assistant

An AI-assisted triage console for EDA engineering support mail. It reads each incoming email,
classifies it by category and priority, states the sender's intent and a recommended action, matches
it against previously triaged issues, generates a structured engineering issue where the email is a
genuine defect report, and records a human confirmation or correction for every decision.

```
Manual / batch ingest → preprocessor → Google Gemini → FastAPI → SQLite × TF-IDF → React console → human review
```

See [`docs/design_document.pdf`](docs/design_document.pdf) for the full design rationale and
[`docs/architecture_diagram.png`](docs/architecture_diagram.png) for the system diagram.

---

## Quick start

Two processes: the API on port 8000, the console on port 5173.

> **A Gemini API key is required for live AI triage.** Get one free at
> <https://aistudio.google.com/apikey>. Without it the API still runs, but any ingest attempt
> returns a clear "triage model is not configured" error rather than a fabricated result.

### 1. Backend

```bash
cd backend

python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

Configure the key. Either copy the template and edit it:

```bash
cp .env.example .env              # then set GEMINI_API_KEY inside
```

or export it directly:

```bash
export GEMINI_API_KEY=your_key_here     # Windows: set GEMINI_API_KEY=your_key_here
```

Then start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs at <http://localhost:8000/docs>. Confirm the key was picked up with
<http://localhost:8000/api/provider>, which reports the model and whether a key is configured.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server proxies `/api` to port 8000, so no CORS setup or
environment variables are needed for local development.

> **Without a backend**, the console detects that the API is unreachable, loads a bundled demo
> dataset, and labels itself `DEMO DATA` in the top bar. Reading and reviewing work against that
> data; ingest is disabled with an explanation, because ingest is a backend operation.

---

## Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GEMINI_API_KEY` | yes | none | Authenticates the triage call. Live triage fails cleanly without it. |
| `GEMINI_MODEL` | no | `gemini-3.6-flash` | Override the model. A Flash-class model suits this workload: short-context classification and structured extraction. |

The key is read from the environment only, never hardcoded, and `.env` is gitignored.

---

## Sample data

Two files are included so the console can be filled without inventing test mail. Run them from
`backend/` with the API up.

**1. Seed the queue.** Eight realistic EDA support emails covering all five categories and all four
priorities, including one with an HTML wrapper and a quoted reply thread (so the `Cleaned` /
`Source` tabs show a real preprocessor delta), stack traces, FlexNet diagnostics and a
SystemVerilog assertion:

```bash
curl -X POST http://localhost:8000/api/emails/batch      -H "Content-Type: application/json" -d @sample_emails.json
```

**2. Then demonstrate similarity.** A follow-up on the same Virtuoso crash. Ingesting it after the
seed matches the earlier report through TF-IDF at roughly 0.50 cosine, comfortably over the 0.35
threshold:

```bash
curl -X POST http://localhost:8000/api/emails      -H "Content-Type: application/json"      -d "$(python -c "import json;print(json.dumps(json.load(open('sample_followup.json'))['emails'][0]))")"
```

The order matters: similarity compares an incoming email against everything triaged before it, so
the corpus has to exist first.

---

## Using the console

| Section | What it does |
|---------|--------------|
| **Queue** | The triage workstation: priority-banded queue → message → AI decision |
| **Review** | Human review worklist, lowest confidence first |
| **Stats** | Distributions, mean confidence, review accuracy, category × priority matrix |
| **Ingest** | Submit one email, or a JSON batch with live progress from the job |
| **System** | Connection state, provider and model, pipeline constants, API reference |

**Keyboard:** `j` / `k` move through the queue · `/` focuses search · `1`–`5` switch sections ·
`r` refreshes · `Esc` clears search or returns to the queue on mobile.

---

## Tests

```bash
cd backend
pytest tests/ -v
```

20 tests covering the preprocessor, ingest, idempotency, conditional issue generation, similarity
pass-through, batch handling, listing, detail, feedback and statistics. The model call is mocked,
so the suite is deterministic and needs no API key. Current output:
[`docs/test_results.png`](docs/test_results.png).

> Note: the test fixtures drop and recreate tables in `backend/triage.db`, the same file the running
> app uses. Stop the API before running the suite, or your development data will be cleared.

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/emails` | Ingest + triage a single email (idempotent on `message_id`) |
| POST | `/api/emails/batch` | Async batch ingest, returns `202` with a job id |
| GET | `/api/emails/batch/{job_id}` | Batch job progress: `queued` → `processing` → `done` |
| GET | `/api/emails` | List the queue (filter: `?priority=P1&category=...&limit=`) |
| GET | `/api/emails/{id}` | Email detail: both bodies, triage result, review state |
| POST | `/api/triage/{triage_id}/feedback` | Record a human confirmation or correction |
| GET | `/api/stats` | Aggregate counts, mean confidence, review accuracy |
| GET | `/api/provider` | Which model backs triage, and whether a key is configured |

### Classification taxonomy

**Categories:** Tool Crash / Log Report · License Server Escalation · IP Integration / Design
Review · Bug / Jira Ticket · General / Admin

**Priorities:** `P1` production-blocking, tape-out at risk · `P2` significant engineering impact ·
`P3` technical question, non-urgent · `P4` admin, low urgency

Both are declared as enums in the Gemini response schema, so an out-of-taxonomy label cannot be
returned.

### Triage failures

Failures are typed and surfaced as an HTTP status with one readable sentence, never a stack trace
and never a fabricated classification:

| Condition | Status |
|-----------|--------|
| `GEMINI_API_KEY` not set | `503` |
| Key rejected by Gemini | `502` |
| Rate limited | `429` |
| Gemini unavailable | `503` |
| Network failure reaching Gemini | `504` |
| Blocked, malformed or off-schema response | `502` |

An email that cannot be triaged is stored untriaged and can be re-ingested. A batch records the
failure and finishes the remaining emails.

---

## Project structure

```
backend/
  app/
    main.py            FastAPI routes, batch orchestration
    database.py        SQLAlchemy models: emails, triage_results, feedback_log
    schemas.py         Pydantic request/response schemas
    llm.py             Provider-neutral contract: prompt, response schema,
                       error taxonomy, validation
    gemini_client.py   Google Gemini call and SDK error translation
    preprocessor.py    HTML strip, thread removal, log truncation, token cap
    similarity.py      TF-IDF cosine similarity over prior triage
  tests/test_api.py    20 unit tests
  sample_emails.json   8 EDA support emails to seed the queue
  sample_followup.json 1 follow-up email that triggers TF-IDF similarity
frontend/
  src/
    App.jsx            Shell, data flow, keyboard handling
    api.js             Typed client over the eight endpoints
    styles.css         Design tokens and the full component system
    demoData.js        Bundled dataset for the offline fallback
    lib/
      format.js        Priority/category metadata, technical-content detection,
                       similarity parsing, signal extraction, preprocessor delta
      demoSource.js    Offline stand-in with the same interface as api.js
    components/        Queue, message, triage panel, analytics, ingest, review, system
docs/
  design_document.pdf        Full design rationale
  architecture_diagram.png   System diagram
  test_results.png           Test suite output
  console*.png               Screenshots: queue, analytics, review, ingest,
                             batch progress, configuration, offline fallback
```

---

## Notes on the engineering

- **The schema is enforced, not requested.** Category and priority are enums in the Gemini response
  schema, so the taxonomy is a decoding constraint rather than an instruction the model may ignore.
- **Nothing is fabricated on failure.** Every error path raises; an email that could not be
  classified stays untriaged rather than being filled in with a guess.
- **The preprocessor is auditable.** Both `body_raw` and `body_clean` are stored, and the console
  shows the difference (`Cleaned` / `Source` tabs plus the character delta), so a preprocessing bug
  is visible rather than silent.
- **Similarity is classical, not a model call.** TF-IDF cosine over the subject + intent corpus,
  surfaced above a 0.35 threshold with its score. No API cost, and the result is explainable.
- **Corrections never overwrite predictions.** Human feedback is a separate row; the original
  classification stays intact, which is what makes the accuracy figure meaningful.
- **Nothing in the UI pretends to work.** There is no Jira integration, so the console renders the
  generated issue and lets you copy the payload; it does not offer a "Create issue" button.
