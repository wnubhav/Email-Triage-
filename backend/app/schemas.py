from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime


class EmailIn(BaseModel):
    message_id: str
    sender: str
    subject: str
    body: str


class BatchEmailIn(BaseModel):
    emails: list[EmailIn]


class JiraPayload(BaseModel):
    title: str
    priority: str
    component: str
    steps_to_reproduce: str
    expected: str
    actual: str


class FeedbackOut(BaseModel):
    """Human review recorded against a triage result (read-only projection)."""
    model_config = ConfigDict(from_attributes=True)

    correct: bool
    corrected_category: Optional[str] = None
    corrected_priority: Optional[str] = None
    logged_at: datetime


class TriageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email_id: int
    category: str
    priority: str
    intent_summary: str
    suggested_action: str
    confidence: float
    similar_issue: Optional[str]
    jira_payload: Optional[JiraPayload]
    draft_reply: Optional[str]
    created_at: datetime

    # ── additive fields (optional; older clients ignore them) ──
    # id of the TriageResult row, required by clients to POST HITL feedback
    # to /api/triage/{triage_id}/feedback.
    id: Optional[int] = None
    # populated on detail reads so the UI can show review state.
    feedback: Optional[FeedbackOut] = None


class EmailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message_id: str
    sender: str
    subject: str
    received_at: datetime
    triaged: bool
    triage: Optional[TriageOut] = None

    # ── additive fields (optional) ──
    # short excerpt of the cleaned body, sent on list responses so the queue
    # is scannable without shipping every full body.
    preview: Optional[str] = None
    # full bodies are sent on detail reads only. body_raw is what arrived,
    # body_clean is what the preprocessor produced and what the model saw.
    body_raw: Optional[str] = None
    body_clean: Optional[str] = None


class FeedbackIn(BaseModel):
    correct: bool
    corrected_category: Optional[str] = None
    corrected_priority: Optional[str] = None


class BatchStatusOut(BaseModel):
    job_id: str
    status: str          # queued | processing | done
    total: int
    completed: int
    # emails the model could not classify; they are stored untriaged rather
    # than dropped, so the job still completes.
    failed: int = 0
