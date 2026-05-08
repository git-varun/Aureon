"""Pydantic models for JSONB asset_metadata — one per illiquid asset type."""

from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field


class BondMetadata(BaseModel):
    asset_type: Literal["bond"]
    isin: str
    nse_symbol: Optional[str] = None  # NSE listed-bond ticker (e.g. "726054"), used for yfinance
    issuer: str
    face_value: float = 1000.0
    coupon_rate: float  # annual %, e.g. 7.5
    coupon_frequency: Literal["annual", "semi-annual", "quarterly"] = "semi-annual"
    credit_rating: Optional[str] = None  # "AAA", "AA+", etc.


class EPFMetadata(BaseModel):
    asset_type: Literal["epf"]
    uan_number: Optional[str] = None
    employer_name: Optional[str] = None
    employee_monthly: float  # employee contribution INR
    employer_monthly: float  # employer contribution INR
    vpf_monthly: float = 0.0
    interest_rate: float = 8.15  # current EPFO rate


class PPFMetadata(BaseModel):
    asset_type: Literal["ppf"]
    account_number: Optional[str] = None
    bank: Optional[str] = None
    interest_rate: float = 7.1
    subscription_year: Optional[int] = None
    maturity_year: Optional[int] = None


class InsuranceMetadata(BaseModel):
    asset_type: Literal["insurance"]
    sub_type: Literal["term", "health", "endowment", "ulip"]
    policy_number: str
    insurer: str
    sum_assured: float
    annual_premium: float
    maturity_date: Optional[str] = None  # ISO date string
    nominee: Optional[str] = None
    # ULIP-only fields (ignored for other sub_types)
    fund_name: Optional[str] = None
    nav: Optional[float] = None
    units: Optional[float] = None


class RealEstateMetadata(BaseModel):
    asset_type: Literal["real_estate"]
    address: Optional[str] = None
    city: Optional[str] = None
    area_sqft: Optional[float] = None
    rental_monthly: float = 0.0
    mortgage_outstanding: float = 0.0


AssetMetadataUnion = Annotated[
    Union[BondMetadata, EPFMetadata, PPFMetadata, InsuranceMetadata, RealEstateMetadata],
    Field(discriminator="asset_type"),
]

ILLIQUID_TYPES = {"bond", "epf", "ppf", "insurance", "real_estate"}
TRADEABLE_TYPES = {"equity", "crypto", "mutual_fund", "commodity"}
