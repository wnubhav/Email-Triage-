"""
Provider-neutral triage contract.

This module owns everything that is *not* specific to one vendor: the system
prompt, the JSON schema the model must return, the error taxonomy, and the
validation applied to whatever comes back. `app/gemini_client.py` holds the
Google Gemini specifics.

Keeping the split at exactly this line means a second provider would only need
its own `generate()` function; the prompt, the schema and the validation stay
shared and are tested once.
"""
import os

CATEGORIES = [
    "Tool Crash / Log Report",
    "License Server Escalation",
    "IP Integration / Design Review",
    "Bug / Jira Ticket",
    "General / Admin",
]

PRIORITIES = ["P1", "P2", "P3", "P4"]


# ── error taxonomy ────────────────────────────────────────────────────
# One exception type with a `kind`, so the API layer can map a failure to a
# sensible status code and an operator-readable sentence instead of leaking a
# traceback to the browser.

class TriageError(Exception):
    """A triage attempt that failed for a reason worth telling the user."""

    KINDS = {
        "missing_key": (
            503,
            "The triage model is not configured. Set GEMINI_API_KEY in backend/.env "
            "and restart the API.",
        ),
        "auth": (
            502,
            "The Gemini API rejected the configured key. Check that GEMINI_API_KEY is "
            "valid and enabled for the Generative Language API.",
        ),
        "rate_limit": (
            429,
            "The Gemini API is rate limiting this key. Wait a moment and retry, or "
            "reduce batch size.",
        ),
        "unavailable": (
            503,
            "The Gemini API is temporarily unavailable. Retry shortly.",
        ),
        "network": (
            504,
            "Could not reach the Gemini API. Check network access from the machine "
            "running the backend.",
        ),
        "blocked": (
            502,
            "Gemini returned no usable content for this email, most likely because the "
            "response was blocked. The email was not triaged.",
        ),
        "invalid_json": (
            502,
            "Gemini returned a response that was not valid JSON. The email was not triaged.",
        ),
        "validation": (
            502,
            "Gemini returned JSON that did not match the triage schema. The email was "
            "not triaged.",
        ),
        "model": (
            502,
            "The configured Gemini model rejected the request. Check GEMINI_MODEL.",
        ),
    }

    def __init__(self, kind: str, detail: str | None = None):
        status, message = self.KINDS.get(kind, (502, "The triage model call failed."))
        self.kind = kind
        self.status_code = status
        self.message = message
        # `detail` carries the provider's own words for the server log; it is not
        # sent to the browser verbatim.
        self.detail = detail
        super().__init__(f"{kind}: {detail or message}")


# ── prompt ────────────────────────────────────────────────────────────
# The classification logic is unchanged from the original implementation. Only
# the closing instruction about JSON has been dropped, because the schema is now
# enforced by the provider's structured-output mode rather than by asking.

SYSTEM_PROMPT = """You are an intelligent triage assistant for a Cadence Design Systems engineering inbox.
Analyze the email and classify it.

Categories (pick exactly one):
- "Tool Crash / Log Report"        : stack traces, SIGSEGV, tool crashes, EDA software errors
- "License Server Escalation"      : FlexNet/lmgrd down, license checkout failures, floating license issues
- "IP Integration / Design Review" : Verilog/VHDL/Verilog-A review, assertion syntax, model review, design questions
- "Bug / Jira Ticket"              : clear bug reports with steps to reproduce
- "General / Admin"                : invoices, pricing, HR, non-technical queries

Priority (pick exactly one):
- "P1" : production-blocking, tape-out at risk, all engineers blocked, revenue impact
- "P2" : significant engineering impact, workaround needed, SLA risk
- "P3" : technical question, non-urgent review, normal support request
- "P4" : admin, info request, low urgency

Field guidance:
- intent_summary  : 2 sentences max, plain language, what the sender actually wants
- suggested_action: one clear operational directive
- confidence      : 0-100, your certainty in the category and priority together
- needs_jira      : true only for a Tool Crash or a Bug with clear reproduction steps
- jira_payload    : populate only when needs_jira is true, otherwise null
- draft_reply     : 2-3 sentence acknowledgement, professional tone

Expect realistic EDA terminology: Virtuoso, Innovus, JasperGold, Spectre, FlexNet,
lmgrd, netlist import, SIGSEGV, assertion failures, tape-out deadlines, regressions,
timing violations and design reviews."""


# ── response schema ───────────────────────────────────────────────────
# Expressed as plain JSON Schema so it is provider-portable. gemini_client.py
# hands this to Gemini's structured-output mode; the same dict documents the
# contract for any future provider.

JIRA_PROPERTIES = {
    "title": {"type": "string"},
    "priority": {"type": "string"},
    "component": {"type": "string"},
    "steps_to_reproduce": {"type": "string"},
    "expected": {"type": "string"},
    "actual": {"type": "string"},
}

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "priority": {"type": "string", "enum": PRIORITIES},
        "intent_summary": {"type": "string"},
        "suggested_action": {"type": "string"},
        "confidence": {"type": "number"},
        "needs_jira": {"type": "boolean"},
        "jira_payload": {
            "type": "object",
            "nullable": True,
            "properties": JIRA_PROPERTIES,
            "required": list(JIRA_PROPERTIES),
        },
        "draft_reply": {"type": "string", "nullable": True},
    },
    "required": [
        "category",
        "priority",
        "intent_summary",
        "suggested_action",
        "confidence",
        "needs_jira",
    ],
}


# ── validation ────────────────────────────────────────────────────────

def _validate(result: dict) -> dict:
    """Check and normalise a model response. Raises TriageError('validation')."""
    if not isinstance(result, dict):
        raise TriageError("validation", f"expected an object, got {type(result).__name__}")

    for field in ("category", "priority", "intent_summary", "suggested_action", "confidence"):
        if result.get(field) in (None, ""):
            raise TriageError("validation", f"missing field: {field}")

    if result["category"] not in CATEGORIES:
        raise TriageError("validation", f"unknown category: {result['category']!r}")
    if result["priority"] not in PRIORITIES:
        raise TriageError("validation", f"unknown priority: {result['priority']!r}")

    try:
        confidence = float(result["confidence"])
    except (TypeError, ValueError):
        raise TriageError("validation", f"confidence is not a number: {result['confidence']!r}")
    result["confidence"] = max(0.0, min(100.0, confidence))

    # needs_jira governs the payload, exactly as before: a model that sets the
    # flag false does not get to leave a half-built issue behind.
    if not result.get("needs_jira"):
        result["jira_payload"] = None

    payload = result.get("jira_payload")
    if payload is not None:
        if not isinstance(payload, dict):
            raise TriageError("validation", "jira_payload is not an object")
        missing = [k for k in JIRA_PROPERTIES if not payload.get(k)]
        if missing:
            # An incomplete issue is worse than no issue: drop it rather than
            # rendering a half-populated card in the console.
            result["jira_payload"] = None

    if not result.get("draft_reply"):
        result["draft_reply"] = None

    return result


# ── entry point ───────────────────────────────────────────────────────

def triage_email(subject: str, sender: str, body_clean: str) -> dict:
    """
    Classify one preprocessed email.

    Returns the same dict shape the rest of the application has always
    consumed. Raises TriageError on any failure; never returns a fabricated
    result.
    """
    from .gemini_client import generate  # imported here so the SDK is optional at import time

    user_content = f"From: {sender}\nSubject: {subject}\n\n{body_clean}"
    raw = generate(SYSTEM_PROMPT, user_content, RESPONSE_SCHEMA)
    return _validate(raw)


def provider_info() -> dict:
    """Describes the configured provider. Used by the API for its status view."""
    from .gemini_client import DEFAULT_MODEL

    return {
        "provider": "Google Gemini",
        "model": os.environ.get("GEMINI_MODEL", DEFAULT_MODEL),
        "configured": bool(os.environ.get("GEMINI_API_KEY")),
    }
