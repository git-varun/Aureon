"""Users models."""
from sqlalchemy import Column, Float, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=True)  # nullable: users who sign in via OAuth/magic have no password
    first_name = Column(String)
    last_name = Column(String)
    phone = Column(String, unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    profile_picture = Column(String)
    bio = Column(Text)
    google_id = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Extended investment profile
    risk_profile = Column(String, nullable=True)      # conservative/moderate/balanced/aggressive/speculative
    working_area = Column(String, nullable=True)
    target_profit_pct = Column(Float, nullable=True)  # annual target %
    monthly_saving = Column(Float, nullable=True)     # INR
    swing_trading_enabled = Column(Boolean, default=False)
