"""
Google Gemini implementation of the triage call.

Everything vendor-specific lives here: client construction, structured-output
configuration, and the translation of SDK exceptions into the shared
TriageError taxonomy. The prompt and the schema come from `llm.py`.

Structured output is used rather than asking the model to "return valid JSON":
`response_mime_type="application/json"` plus a response schema constrains the
model to the application's shape, and the category and priority fields are
declared as enums so an out-of-taxonomy label cannot come back in the first
place.
"""
import json
import os

from .llm import TriageError

# A Flash-class model: this workload is short-context classification and
# structured extraction, which does not warrant a premium tier. Override with
# GEMINI_MODEL if a different one is preferred; gemini-3.7-flash also works and
# is a little faster. Older 2.x Flash models are no longer served to new keys.
DEFAULT_MODEL = "gemini-3.6-flash"

# Deterministic-ish classification. The same email should not drift between P2
# and P3 across runs.
TEMPERATURE = 0.2
MAX_OUTPUT_TOKENS = 2048

_client = None


def _get_client():
    """Build the Gemini client once. Raises TriageError if the key is absent."""
    global _client
    if _client is not None:
        return _client

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise TriageError("missing_key", "GEMINI_API_KEY is not set")

    try:
        from google import genai
    except ImportError as exc:
        raise TriageError(
            "missing_key",
            f"the google-genai package is not installed ({exc}); run pip install -r requirements.txt",
        )

    try:
        _client = genai.Client(api_key=api_key)
    except Exception as exc:
        raise TriageError("auth", f"could not construct the Gemini client: {exc}")

    return _client


def _classify_api_error(exc) -> TriageError:
    """Map an SDK exception onto the shared taxonomy."""
    code = getattr(exc, "code", None)
    status = str(getattr(exc, "status", "") or "").upper()
    text = f"{status} {exc}".upper()

    if code in (401, 403) or "PERMISSION_DENIED" in text or "UNAUTHENTICATED" in text or "API_KEY" in text:
        return TriageError("auth", str(exc))
    if code == 429 or "RESOURCE_EXHAUSTED" in text or "RATE" in text or "QUOTA" in text:
        return TriageError("rate_limit", str(exc))
    if code == 404 or "NOT_FOUND" in text or "NOT FOUND" in text:
        return TriageError("model", str(exc))
    if code == 400 or "INVALID_ARGUMENT" in text:
        return TriageError("model", str(exc))
    if code is not None and code >= 500 or "UNAVAILABLE" in text or "INTERNAL" in text:
        return TriageError("unavailable", str(exc))
    return TriageError("unavailable", str(exc))


def generate(system_prompt: str, user_content: str, schema: dict) -> dict:
    """
    One structured Gemini call. Returns the parsed JSON object.

    Raises TriageError for every failure mode. It never returns a partial or
    invented result: an email that could not be triaged stays untriaged.
    """
    client = _get_client()
    model = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL

    try:
        from google.genai import errors as genai_errors
        from google.genai import types
    except ImportError as exc:
        raise TriageError("missing_key", f"the google-genai package is not installed ({exc})")

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=TEMPERATURE,
        max_output_tokens=MAX_OUTPUT_TOKENS,
        response_mime_type="application/json",
        response_schema=schema,
    )

    try:
        response = client.models.generate_content(
            model=model,
            contents=user_content,
            config=config,
        )
    except genai_errors.APIError as exc:
        raise _classify_api_error(exc)
    except Exception as exc:
        # Connection resets, DNS failures, timeouts: anything that never
        # reached the service.
        name = type(exc).__name__
        if any(t in name for t in ("Connect", "Timeout", "SSL", "Network", "Resolve")):
            raise TriageError("network", f"{name}: {exc}")
        raise TriageError("unavailable", f"{name}: {exc}")

    text = (getattr(response, "text", None) or "").strip()
    if not text:
        # An empty body normally means the candidate was blocked or truncated.
        reason = None
        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None:
            reason = getattr(feedback, "block_reason", None)
        raise TriageError("blocked", f"empty response (block_reason={reason})")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise TriageError("invalid_json", f"{exc}; first 200 chars: {text[:200]!r}")
