from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text, DateTime, JSON
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./triage.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Email(Base):
    __tablename__ = "emails"

    id          = Column(Integer, primary_key=True, index=True)
    message_id  = Column(String, unique=True, index=True)
    sender      = Column(String)
    subject     = Column(String)
    body_raw    = Column(Text)       # original
    body_clean  = Column(Text)       # after preprocessing
    received_at = Column(DateTime, default=datetime.utcnow)
    triaged     = Column(Boolean, default=False)


class TriageResult(Base):
    __tablename__ = "triage_results"

    id              = Column(Integer, primary_key=True, index=True)
    email_id        = Column(Integer, index=True)
    category        = Column(String)
    priority        = Column(String)   # P1-P4
    intent_summary  = Column(Text)
    suggested_action= Column(Text)
    confidence      = Column(Float)
    similar_issue   = Column(String, nullable=True)
    jira_payload    = Column(JSON, nullable=True)
    draft_reply     = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class FeedbackLog(Base):
    __tablename__ = "feedback_log"

    id              = Column(Integer, primary_key=True, index=True)
    triage_id       = Column(Integer, index=True)
    correct         = Column(Boolean)
    corrected_category = Column(String, nullable=True)
    corrected_priority = Column(String, nullable=True)
    logged_at       = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
