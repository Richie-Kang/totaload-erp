"""Fill the 말소등록 신청서 AcroForm template with logical field values (pypdf).

The 12 template field names are fixed (ADR-003) — note the trailing space in
'vehicle_year '. None/empty values are left blank; the form is still generated.
"""

import io
import os
from datetime import date

from pypdf import PdfReader, PdfWriter

from .schema import FillPdfRequest

# exact AcroForm field names — 'vehicle_year ' has a trailing space on purpose.
PDF_FIELD_NAMES = [
    "owner_name", "owner_ssn", "owner_address", "vehicle_reg_no",
    "vehicle_vin_1", "vehicle_vin_2", "vehicle_model", "vehicle_year ",
    "vehicle_mileage", "vehicle_weight_1", "vehicle_weight_2", "current_date",
]

# fields whose emptiness is worth flagging back to the caller (X-Missing-Fields)
_IMPORTANT_FIELDS = ["owner_name", "vehicle_reg_no", "vehicle_vin_1"]

_checked = False


class PdfTemplateMissing(Exception):
    """Template PDF file is absent at TEMPLATE_PATH / assets/."""


def _template_path() -> str:
    env = os.environ.get("TEMPLATE_PATH")
    if env:
        return env
    here = os.path.dirname(os.path.abspath(__file__))  # ocr-service/app/
    return os.path.normpath(os.path.join(here, "..", "..", "assets", "malso_application_template.pdf"))


def assert_field_names_match() -> None:
    """Verify the template's AcroForm keys are exactly PDF_FIELD_NAMES."""
    path = _template_path()
    if not os.path.isfile(path):
        raise PdfTemplateMissing(f"템플릿 PDF 없음: {path}")
    keys = set((PdfReader(path).get_fields() or {}).keys())
    expected = set(PDF_FIELD_NAMES)
    if keys != expected:
        raise AssertionError(
            f"PDF 필드명 불일치 — template={sorted(keys)} expected={sorted(expected)}"
        )


def _ensure_checked() -> None:
    global _checked
    if not _checked:
        assert_field_names_match()
        _checked = True


def fill(req: FillPdfRequest) -> tuple[bytes, list[str]]:
    """Return (filled PDF bytes, list of empty important field names)."""
    _ensure_checked()
    path = _template_path()

    def s(v) -> str:
        return "" if v is None else str(v).strip()

    current_date = s(req.current_date)
    if not current_date:
        today = date.today()
        current_date = f"{today.year}년 {today.month}월 {today.day}일"

    vin = s(req.vehicle_vin)
    weight = s(req.vehicle_weight)

    mapping = {
        "owner_name": s(req.owner_name),
        "owner_ssn": s(req.owner_ssn),
        "owner_address": s(req.owner_address),
        "vehicle_reg_no": s(req.vehicle_reg_no),
        "vehicle_vin_1": vin,
        "vehicle_vin_2": vin,
        "vehicle_model": s(req.vehicle_model),
        "vehicle_year ": s(req.vehicle_year),
        "vehicle_mileage": s(req.vehicle_mileage),
        # 2p WEIGHT KG and 2p 총합계 KG both get the same value (consolidated 차량중량).
        "vehicle_weight_1": weight,
        "vehicle_weight_2": weight,
        "current_date": current_date,
    }
    missing = [k for k in _IMPORTANT_FIELDS if not mapping.get(k)]

    reader = PdfReader(path)
    writer = PdfWriter()
    writer.append(reader)
    for page in writer.pages:
        writer.update_page_form_field_values(page, mapping, auto_regenerate=False)
    # ensure viewers regenerate field appearances (so values are visible everywhere)
    writer.set_need_appearances_writer(True)

    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue(), missing
