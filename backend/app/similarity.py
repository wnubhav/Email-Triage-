from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from sqlalchemy.orm import Session
from .database import TriageResult, Email

THRESHOLD = 0.35   # minimum cosine similarity to surface a match


def find_similar(subject: str, body: str, db: Session, exclude_email_id: int | None = None) -> str | None:
    """
    Compare incoming email against all previously triaged emails.
    Returns a human-readable match string or None.
    """
    past = (
        db.query(TriageResult, Email)
        .join(Email, TriageResult.email_id == Email.id)
        .filter(TriageResult.email_id != exclude_email_id)
        .all()
    )

    if not past:
        return None

    corpus = [f"{e.subject} {t.intent_summary}" for t, e in past]
    query  = f"{subject} {body[:500]}"

    vec = TfidfVectorizer(stop_words="english", max_features=5000)
    try:
        tfidf = vec.fit_transform(corpus + [query])
    except ValueError:
        return None

    scores = cosine_similarity(tfidf[-1], tfidf[:-1]).flatten()
    best_idx = int(np.argmax(scores))

    if scores[best_idx] < THRESHOLD:
        return None

    best_triage, best_email = past[best_idx]
    match_pct = round(float(scores[best_idx]) * 100)
    return (
        f"Issue #{best_email.id}: {best_email.subject} "
        f"({best_triage.category}, {best_triage.priority}, {match_pct}%)"
    )
