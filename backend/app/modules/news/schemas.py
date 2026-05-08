"""Pydantic schemas for news module request/response validation."""

from typing import Optional

from pydantic import BaseModel, Field


class NewsArticleSchema(BaseModel):
    """Response schema for a single news article."""

    id: int = Field(..., description="Unique article ID")
    title: str = Field(..., description="Article title")
    summary: Optional[str] = Field(None, description="Article summary/description")
    source: str = Field(..., description="News source provider (e.g., 'rss', 'finnhub', 'newsapi')")
    url: str = Field(..., description="URL to original article")
    symbols: Optional[str] = Field(None, description="Comma-separated symbols related to article")
    published_at: Optional[str] = Field(None, description="Publication timestamp (ISO format)")
    sentiment_score: Optional[float] = Field(None, ge=-1.0, le=1.0, description="Sentiment score (-1 to 1)")

    class Config:
        from_attributes = True


class NewsFeedSchema(BaseModel):
    """Response schema for grouped news feed."""

    __root__: dict[str, list[NewsArticleSchema]] = Field(..., description="News grouped by symbol")

    class Config:
        from_attributes = True
