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


class EPSMetadata(BaseModel):
    """Employee Pension Scheme — pension component of EPF.

    Corpus = 8.33% × min(pensionable_salary, 15000) × months of service.
    Projected monthly pension at retirement = (pensionable_salary × service_years) / 70.
    """
    asset_type: Literal["eps"]
    uan_number: Optional[str] = None
    employer_name: Optional[str] = None
    pensionable_salary: float  # basic salary; formula caps it at ₹15,000
    date_of_joining: Optional[str] = None  # ISO date, used to compute service years
    date_of_exit: Optional[str] = None  # ISO date if already left/retired
    known_service_years: Optional[float] = None  # override computed value
    employer_eps_monthly: float = 0.0  # override auto-computed (8.33% × min(sal,15000))


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


class NPSMetadata(BaseModel):
    """National Pension System — one record per tier (tier1 or tier2).

    Corpus is manually updated by the user; no auto-growth is applied.
    expected_return_rate is used only for projection display, not valuation.
    """
    asset_type: Literal["nps"]
    pran_number: Optional[str] = None
    cra_name: Optional[str] = None  # NSDL / KFintech (formerly Karvy)
    tier: Literal["tier1", "tier2"] = "tier1"
    fund_name: Optional[str] = None  # SBI / HDFC / UTI / LIC / Kotak / Aditya Birla
    balance: float  # current corpus in INR (manually entered)
    monthly_contribution: float = 0.0
    employer_contribution: float = 0.0  # for govt employees (NPS mandatory)
    expected_return_rate: float = 10.0  # % p.a., display-only projection


class RealEstateMetadata(BaseModel):
    asset_type: Literal["real_estate"]
    address: Optional[str] = None
    city: Optional[str] = None
    area_sqft: Optional[float] = None
    rental_monthly: float = 0.0
    mortgage_outstanding: float = 0.0


AssetMetadataUnion = Annotated[
    Union[BondMetadata, EPFMetadata, EPSMetadata, NPSMetadata, PPFMetadata, InsuranceMetadata, RealEstateMetadata],
    Field(discriminator="asset_type"),
]

ILLIQUID_TYPES = {"bond", "epf", "eps", "nps", "ppf", "insurance", "real_estate"}
TRADEABLE_TYPES = {"equity", "crypto", "mutual_fund", "commodity"}
