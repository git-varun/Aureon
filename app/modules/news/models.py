"""News models."""
from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.sql import func
from app.core.db import Base


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text)
    summary = Column(Text)
    source = Column(String, nullable=False)
    url = Column(String)
    published_at = Column(DateTime(timezone=True))
    sentiment_score = Column(Float)  # -1 to 1
    relevance_score = Column(Float)  # 0 to 1
    symbols = Column(String)  # comma-separated
    created_at = Column(DateTime(timezone=True), server_default=func.now())