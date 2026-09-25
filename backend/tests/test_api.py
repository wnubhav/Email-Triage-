import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import json

from app.main import app
from app.preprocessor import preprocess
from app.database import init_db, Base, engine

# ── fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fresh_db():
    """Recreate tables before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


MOCK_TRIAGE_RESPONSE = {
    "category": "Tool Crash / Log Report",
    "priority": "P1",
    "intent_summary": "Virtuoso 23.1.1 crashes with SIGSEGV on netlist import. Blocks Friday tape-out.",
    "suggested_action": "Escalate to Virtuoso engineering. Assign regression ticket immediately.",
    "confidence": 96,
    "needs_jira": True,
    "jira_payload": {
        "title": "Virtuoso 23.1.1 SIGSEGV on netlist import",
        "priority": "P1",
        "component": "Virtuoso / Parser",
        "steps_to_reproduce": "1. Open Virtuoso 23.1.1\n2. Import netlist\n3. Observe crash",
        "expected": "Netlist imports successfully",
        "actual": "SIGSEGV at NetlistParser::parseNode"
    },
    "draft_reply": "Thank you for reporting this. We have escalated to the Virtuoso engineering team and assigned a P1 ticket. We will follow up within 2 hours."
}

MOCK_TRIAGE_NO_JIRA = {
    "category": "General / Admin",
    "priority": "P4",
    "intent_summary": "Invoice pricing discrepancy on license renewal.",
    "suggested_action": "Forward to account management.",
    "confidence": 94,
    "needs_jira": False,
    "jira_payload": None,
    "draft_reply": "Thank you for reaching out. We have forwarded this to account management who will respond within 1 business day."
}


# ── preprocessor tests ────────────────────────────────────────────────

class TestPreprocessor:
    def test_strips_html_tags(self):
        html = "<p>Hello <b>world</b></p><br/><span>test</span>"
        result = preprocess(html)
        assert "<p>" not in result
        assert "<b>" not in result
        assert "Hello" in result
        assert "world" in result

    def test_removes_quoted_thread(self):
        body = "My new message.\n\nOn Mon, Jan wrote:\n> Old quoted content here\n> More old content"
        result = preprocess(body)
        assert "Old quoted content" not in result
        assert "My new message" in result

    def test_removes_gt_quoted_lines(self):
        body = "Actual message.\n> Quoted line 1\n> Quoted line 2"
        result = preprocess(body)
        assert "> Quoted" not in result

    def test_truncates_long_body(self):
        long_body = "A" * 4000
        result = preprocess(long_body)
        assert len(result) <= 3100   # 3000 chars + truncation notice
        assert "truncated" in result

    def test_collapses_whitespace(self):
        body = "Line one.\n\n\n\n\nLine two."
        result = preprocess(body)
        assert "\n\n\n" not in result

    def test_normal_email_unchanged_structure(self):
        body = "Hi team,\n\nWe have a bug in Virtuoso.\n\nThanks,\nPriya"
        result = preprocess(body)
        assert "Hi team" in result
        assert "Virtuoso" in result


# ── API endpoint tests ────────────────────────────────────────────────

class TestIngestEmail:
    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_ingest_single_email(self, mock_sim, mock_triage, client):
        payload = {
            "message_id": "msg-001",
            "sender": "priya@globalfab.com",
            "subject": "Virtuoso crash",
            "body": "Virtuoso is crashing on netlist import. SIGSEGV in parser."
        }
        r = client.post("/api/emails", json=payload)
        assert r.status_code == 201
        data = r.json()
        assert data["category"] == "Tool Crash / Log Report"
        assert data["priority"] == "P1"
        assert data["confidence"] == 96
        assert data["jira_payload"] is not None

    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_idempotent_on_duplicate_message_id(self, mock_sim, mock_triage, client):
        payload = {
            "message_id": "msg-dup",
            "sender": "a@b.com",
            "subject": "Dup subject",
            "body": "Dup body"
        }
        r1 = client.post("/api/emails", json=payload)
        r2 = client.post("/api/emails", json=payload)
        assert r1.status_code == 201
        assert r2.status_code == 201
        # the model should only be called once
        assert mock_triage.call_count == 1

    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_NO_JIRA)
    @patch("app.main.find_similar", return_value=None)
    def test_no_jira_for_admin_email(self, mock_sim, mock_triage, client):
        payload = {
            "message_id": "msg-admin",
            "sender": "billing@co.com",
            "subject": "Invoice query",
            "body": "Our invoice shows wrong amount."
        }
        r = client.post("/api/emails", json=payload)
        assert r.status_code == 201
        assert r.json()["jira_payload"] is None

    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value="Issue #12: Similar crash (Tool Crash / Log Report, P1)")
    def test_similar_issue_returned(self, mock_sim, mock_triage, client):
        payload = {
            "message_id": "msg-sim",
            "sender": "x@y.com",
            "subject": "Another crash",
            "body": "Similar crash to before."
        }
        r = client.post("/api/emails", json=payload)
        assert r.json()["similar_issue"] is not None
        assert "Issue #12" in r.json()["similar_issue"]


class TestBatchIngest:
    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_batch_returns_202(self, mock_sim, mock_triage, client):
        payload = {
            "emails": [
                {"message_id": "b-1", "sender": "a@b.com", "subject": "Sub1", "body": "Body1"},
                {"message_id": "b-2", "sender": "c@d.com", "subject": "Sub2", "body": "Body2"},
            ]
        }
        r = client.post("/api/emails/batch", json=payload)
        assert r.status_code == 202
        data = r.json()
        assert data["status"] in ("queued", "processing", "done")
        assert data["total"] == 2
        assert "job_id" in data

    def test_batch_status_404_unknown_job(self, client):
        r = client.get("/api/emails/batch/nonexistent-job")
        assert r.status_code == 404


class TestListing:
    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_list_emails(self, mock_sim, mock_triage, client):
        client.post("/api/emails", json={
            "message_id": "list-1", "sender": "a@b.com",
            "subject": "Crash", "body": "Crash body"
        })
        r = client.get("/api/emails")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_get_email_by_id(self, mock_sim, mock_triage, client):
        ingest = client.post("/api/emails", json={
            "message_id": "get-1", "sender": "a@b.com",
            "subject": "Sub", "body": "Body"
        })
        email_id = ingest.json()["email_id"]
        r = client.get(f"/api/emails/{email_id}")
        assert r.status_code == 200
        assert r.json()["id"] == email_id

    def test_get_nonexistent_email(self, client):
        r = client.get("/api/emails/99999")
        assert r.status_code == 404


class TestFeedback:
    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_submit_correct_feedback(self, mock_sim, mock_triage, client):
        client.post("/api/emails", json={
            "message_id": "fb-1", "sender": "a@b.com",
            "subject": "Sub", "body": "Body"
        })
        # triage id will be 1 for the first record
        r = client.post("/api/triage/1/feedback", json={"correct": True})
        assert r.status_code == 204

    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_submit_correction_feedback(self, mock_sim, mock_triage, client):
        client.post("/api/emails", json={
            "message_id": "fb-2", "sender": "a@b.com",
            "subject": "Sub", "body": "Body"
        })
        r = client.post("/api/triage/1/feedback", json={
            "correct": False,
            "corrected_category": "General / Admin",
            "corrected_priority": "P4"
        })
        assert r.status_code == 204

    def test_feedback_404_unknown_triage(self, client):
        r = client.post("/api/triage/9999/feedback", json={"correct": True})
        assert r.status_code == 404


class TestStats:
    @patch("app.main.triage_email", return_value=MOCK_TRIAGE_RESPONSE)
    @patch("app.main.find_similar", return_value=None)
    def test_stats_returns_aggregates(self, mock_sim, mock_triage, client):
        client.post("/api/emails", json={
            "message_id": "st-1", "sender": "a@b.com",
            "subject": "Sub", "body": "Body"
        })
        r = client.get("/api/stats")
        assert r.status_code == 200
        data = r.json()
        assert "total_triaged" in data
        assert "by_priority" in data
        assert "avg_confidence" in data

    def test_stats_empty_db(self, client):
        r = client.get("/api/stats")
        assert r.status_code == 200
        assert r.json() == {}
