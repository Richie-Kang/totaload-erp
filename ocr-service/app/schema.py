"""Pydantic models for the OCR/PDF service."""

from typing import Literal, Optional

from pydantic import BaseModel


class ExtractedFields(BaseModel):
    owner_name: Optional[str] = None
    owner_ssn: Optional[str] = None
    owner_address: Optional[str] = None
    vehicle_reg_no: Optional[str] = None
    vehicle_vin: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[str] = None
    vehicle_mileage: Optional[int] = None
    vehicle_weight: Optional[int] = None


class ExtractResponse(BaseModel):
    fields: ExtractedFields
    raw: str
    status: Literal["ok", "partial", "failed"]
    warnings: list[str] = []
    error_code: Optional[str] = None  # OCR_UNAVAILABLE | OCR_AUTH | OCR_RATE_LIMIT | OCR_TIMEOUT | OCR_BAD_OUTPUT | OCR_BAD_IMAGE | None
    provider: Optional[str] = None    # 'upstage' | 'codex' | 'gemini'


class FillPdfRequest(BaseModel):
    # logical fields — numbers are accepted as strings and written verbatim into the PDF
    owner_name: Optional[str] = None
    owner_ssn: Optional[str] = None
    owner_address: Optional[str] = None
    vehicle_reg_no: Optional[str] = None
    vehicle_vin: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[str] = None
    vehicle_mileage: Optional[str] = None
    vehicle_weight: Optional[str] = None
    current_date: Optional[str] = None
