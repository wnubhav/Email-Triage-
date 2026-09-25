import os
import uuid
from pathlib import Path

# Load backend/.env before anything reads the environment, so the documented
# setup (copy .env.example to .env, fill in the key) actually takes effect.
# Real environment variables still win: this never overrides an exported value.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
except ImportError:  # pragma: no cover - dotenv is a convenience, not a requirement
    pass

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_db, init_db, Email, TriageResult, FeedbackLog
from .schemas import (
    EmailIn, BatchEmailIn, TriageOut, EmailOut,
    FeedbackIn, BatchStatusOut, FeedbackOut
)
from .preprocessor import preprocess
from .llm import triage_email, provider_info, TriageError
from .similarity import find_similar

app = FastAPI(title="Email Triage API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory batch job tracker {job_id: {total, completed, status}}
_batch_jobs: dict[str, dict] = {}


@app.on_event("startup")
def startup():
    init_db()


# ── single email ingest + triage ────────────────────────────────────

@app.post("/api/emails", response_model=TriageOut, status_code=201)
def ingest_email(payload: EmailIn, db: Session = Depends(get_db)):
    # Idempotency check
    existing = db.query(Email).filter(Email.message_id == payload.message_id).first()
    if existing:
        result = db.query(TriageResult).filter(TriageResult.email_id == existing.id).first()
        if result:
            return _result_to_schema(result, db)

        # The email is stored but carries no triage result, which happens when
        # an earlier model call failed. Retry on the existing row: inserting a
        # second row would violate the unique message_id and 500.
        try:
            result = _run_triage(existing, db)
        except TriageError as exc:
            raise HTTPException(exc.status_code, exc.message)
        return _result_to_schema(result, db)

    body_clean = preprocess(payload.body)

    email = Email(
        message_id=payload.message_id,
        sender=payload.sender,
        subject=payload.subject,
        body_raw=payload.body,
        body_clean=body_clean,
    )
    db.add(email)
    db.commit()
    db.refresh(email)

    try:
        result = _run_triage(email, db)
    except TriageError as exc:
        # The email is stored either way, so nothing is lost; it simply stays
        # untriaged and can be re-ingested once the provider is reachable.
        raise HTTPException(exc.status_code, exc.message)

    return _result_to_schema(result, db)


# ── batch ingest (async) ─────────────────────────────────────────────

@app.post("/api/emails/batch", response_model=BatchStatusOut, status_code=202)
def batch_ingest(payload: BatchEmailIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job_id = str(uuid.uuid4())
    _batch_jobs[job_id] = {"total": len(payload.emails), "completed": 0, "failed": 0, "status": "queued"}
    background_tasks.add_task(_process_batch, job_id, payload.emails)
    return BatchStatusOut(job_id=job_id, status="queued", total=len(payload.emails), completed=0)


@app.get("/api/emails/batch/{job_id}", response_model=BatchStatusOut)
def batch_status(job_id: str):
    job = _batch_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return BatchStatusOut(job_id=job_id, **job)


# ── email listing + detail ───────────────────────────────────────────

@app.get("/api/emails", response_model=list[EmailOut])
def list_emails(
    priority: str | None = None,
    category: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    # Newest feedback per triage id, fetched once rather than per row.
    feedback_by_triage: dict[int, FeedbackLog] = {}
    for fb in db.query(FeedbackLog).order_by(FeedbackLog.id).all():
        feedback_by_triage[fb.triage_id] = fb

    out = []
    for email in db.query(Email).order_by(Email.received_at.desc()):
        result = db.query(TriageResult).filter(TriageResult.email_id == email.id).first()

        # Filter by priority/category if requested. An untriaged email carries
        # neither, so it cannot satisfy a filtered request.
        if priority or category:
            if result is None:
                continue
            if priority and result.priority != priority:
                continue
            if category and result.category != category:
                continue

        e_out = EmailOut.model_validate(email)
        # Bodies are detail-only; the queue gets a short excerpt instead.
        e_out.body_raw = None
        e_out.body_clean = None
        e_out.preview = _preview(email.body_clean)
        if result:
            e_out.triage = _result_to_schema(result, feedback_row=feedback_by_triage.get(result.id))
        out.append(e_out)

        if len(out) >= limit:
            break

    return out


@app.get("/api/emails/{email_id}", response_model=EmailOut)
def get_email(email_id: int, db: Session = Depends(get_db)):
    email = db.query(Email).filter(Email.id == email_id).first()
    if not email:
        raise HTTPException(404, "Email not found")
    result = db.query(TriageResult).filter(TriageResult.email_id == email_id).first()
    out = EmailOut.model_validate(email)   # includes body_raw + body_clean
    out.preview = _preview(email.body_clean)
    if result:
        out.triage = _result_to_schema(result, db)
    return out


# ── feedback ─────────────────────────────────────────────────────────

@app.post("/api/triage/{triage_id}/feedback", status_code=204)
def submit_feedback(triage_id: int, payload: FeedbackIn, db: Session = Depends(get_db)):
    result = db.query(TriageResult).filter(TriageResult.id == triage_id).first()
    if not result:
        raise HTTPException(404, "Triage result not found")

    fb = FeedbackLog(
        triage_id=triage_id,
        correct=payload.correct,
        corrected_category=payload.corrected_category,
        corrected_priority=payload.corrected_priority,
    )
    db.add(fb)
    db.commit()


# ── stats ─────────────────────────────────────────────────────────────

@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    results = db.query(TriageResult).all()
    if not results:
        return {}

    by_priority = {}
    by_category = {}
    for r in results:
        by_priority[r.priority] = by_priority.get(r.priority, 0) + 1
        by_category[r.category] = by_category.get(r.category, 0) + 1

    avg_conf = sum(r.confidence for r in results) / len(results)
    feedback = db.query(FeedbackLog).all()
    accuracy = (sum(1 for f in feedback if f.correct) / len(feedback) * 100) if feedback else None

    return {
        "total_triaged": len(results),
        "by_priority": by_priority,
        "by_category": by_category,
        "avg_confidence": round(avg_conf, 1),
        "feedback_accuracy": round(accuracy, 1) if accuracy is not None else None,
        "reviewed_count": len(feedback),
        "corrections_count": sum(1 for f in feedback if not f.correct),
    }


@app.get("/api/provider")
def provider():
    """Which model backs triage, and whether it is configured."""
    return provider_info()


# ── internal helpers ──────────────────────────────────────────────────

def _run_triage(email: Email, db: Session) -> TriageResult:
    model_out = triage_email(email.subject, email.sender, email.body_clean)
    similar   = find_similar(email.subject, email.body_clean, db, exclude_email_id=email.id)

    result = TriageResult(
        email_id        = email.id,
        category        = model_out["category"],
        priority        = model_out["priority"],
        intent_summary  = model_out["intent_summary"],
        suggested_action= model_out["suggested_action"],
        confidence      = model_out["confidence"],
        similar_issue   = similar,
        jira_payload    = model_out.get("jira_payload"),
        draft_reply     = model_out.get("draft_reply"),
    )
    db.add(result)
    email.triaged = True
    db.commit()
    db.refresh(result)
    return result


def _preview(body_clean: str | None, length: int = 180) -> str | None:
    """Single-line excerpt of the cleaned body for the queue list."""
    if not body_clean:
        return None
    flat = " ".join(body_clean.split())
    return flat if len(flat) <= length else flat[:length].rstrip() + "…"


def _result_to_schema(
    result: TriageResult,
    db: Session | None = None,
    feedback_row: FeedbackLog | None = None,
) -> TriageOut:
    feedback = FeedbackOut.model_validate(feedback_row) if feedback_row else None
    if feedback is None and db is not None:
        fb = (
            db.query(FeedbackLog)
            .filter(FeedbackLog.triage_id == result.id)
            .order_by(FeedbackLog.id.desc())
            .first()
        )
        if fb:
            feedback = FeedbackOut.model_validate(fb)

    return TriageOut(
        id              = result.id,
        feedback        = feedback,
        email_id        = result.email_id,
        category        = result.category,
        priority        = result.priority,
        intent_summary  = result.intent_summary,
        suggested_action= result.suggested_action,
        confidence      = result.confidence,
        similar_issue   = result.similar_issue,
        jira_payload    = result.jira_payload,
        draft_reply     = result.draft_reply,
        created_at      = result.created_at,
    )


def _process_batch(job_id: str, emails: list[EmailIn]):
    """Runs in background, processing each email sequentially."""
    from .database import SessionLocal
    db = SessionLocal()
    _batch_jobs[job_id]["status"] = "processing"
    try:
        for payload in emails:
            existing = db.query(Email).filter(Email.message_id == payload.message_id).first()
            if existing:
                _batch_jobs[job_id]["completed"] += 1
                continue

            body_clean = preprocess(payload.body)
            email = Email(
                message_id=payload.message_id,
                sender=payload.sender,
                subject=payload.subject,
                body_raw=payload.body,
                body_clean=body_clean,
            )
            db.add(email)
            db.commit()
            db.refresh(email)

            try:
                _run_triage(email, db)
            except TriageError:
                # Record the failure and keep going. The email is stored
                # untriaged rather than dropped, and the job still finishes.
                db.rollback()
                _batch_jobs[job_id]["failed"] += 1

            _batch_jobs[job_id]["completed"] += 1
    finally:
        db.close()
        _batch_jobs[job_id]["status"] = "done"
