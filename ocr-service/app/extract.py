"""Image upload -> codex OCR -> defensively parsed & normalized fields.

`extract_from_upload` NEVER raises and NEVER returns fake data — on any failure
it returns an ExtractResponse with status='failed' and an error_code.
"""

import io
import json
import os
import re
import tempfile
import threading

from PIL import Image

from . import codex_client
from .schema import ExtractedFields, ExtractResponse

MAX_DIM = 2000  # downscale long side to ~this (§2.6 image preprocessing)

# at most 2 concurrent OCR calls — route returns 429 beyond this (§2.8)
OCR_SEMAPHORE = threading.Semaphore(2)

_ALL_KEYS = (
    "owner_name", "owner_ssn", "owner_address", "vehicle_reg_no", "vehicle_vin",
    "vehicle_model", "vehicle_year", "vehicle_mileage", "vehicle_weight",
)

_ERR_MAP = {
    codex_client.CodexUnavailable: "OCR_UNAVAILABLE",
    codex_client.CodexAuth: "OCR_AUTH",
    codex_client.CodexRateLimit: "OCR_RATE_LIMIT",
    codex_client.CodexTimeout: "OCR_TIMEOUT",
    codex_client.CodexBadOutput: "OCR_BAD_OUTPUT",
}


def _failed(error_code: str, raw: str, warnings=None) -> ExtractResponse:
    return ExtractResponse(
        fields=ExtractedFields(), raw=raw, status="failed",
        error_code=error_code, warnings=warnings or [],
    )


def _load_image(data: bytes, filename: str) -> Image.Image:
    """Open the upload as a PIL image; for PDFs render the first page only (ADR-010)."""
    is_pdf = data[:5] == b"%PDF-" or filename.lower().endswith(".pdf")
    if is_pdf:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(data)
        try:
            if len(pdf) == 0:
                raise ValueError("PDF에 페이지가 없음")
            bitmap = pdf[0].render(scale=2.0)
            return bitmap.to_pil().convert("RGB")
        finally:
            pdf.close()
    img = Image.open(io.BytesIO(data))
    img.load()  # force decode so truncated/corrupt images fail here
    return img.convert("RGB")


def _downscale(img: Image.Image) -> Image.Image:
    w, h = img.size
    long_side = max(w, h)
    if long_side <= MAX_DIM:
        return img
    ratio = MAX_DIM / long_side
    return img.resize((max(1, round(w * ratio)), max(1, round(h * ratio))))


def _extract_json(text: str):
    """Pull a JSON object out of arbitrary codex output. Returns dict or None."""
    # 1) first '{' .. last '}'
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            obj = json.loads(text[start:end + 1])
            if isinstance(obj, dict):
                return obj
        except ValueError:
            pass
    # 2) ```json ... ``` fenced block
    m = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if m:
        inner = m.group(1)
        s, e = inner.find("{"), inner.rfind("}")
        if s != -1 and e != -1 and e > s:
            try:
                obj = json.loads(inner[s:e + 1])
                if isinstance(obj, dict):
                    return obj
            except ValueError:
                pass
    return None


def _norm_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _norm_address(v):
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v).replace("\r", " ").replace("\n", " ")).strip()
    return s or None


def _norm_vin(v):
    if v is None:
        return None
    s = re.sub(r"[^A-Z0-9]", "", str(v).upper())
    return s or None


def _norm_reg_no(v):
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def _norm_year(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    m = re.search(r"(?:19|20)\d{2}", s)
    return m.group(0) if m else s


def _to_int(v, warnings, key):
    if v is None:
        return None
    if isinstance(v, bool):
        warnings.append(f"{key}: 숫자가 아님 ({v!r})")
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    digits = re.sub(r"[^0-9]", "", str(v))
    if not digits:
        warnings.append(f"{key}: 숫자 변환 실패 ({v!r})")
        return None
    return int(digits)


def _parse_and_normalize(obj: dict, raw: str) -> ExtractResponse:
    warnings: list[str] = []
    fields = ExtractedFields()
    fields.owner_name = _norm_str(obj.get("owner_name"))
    fields.owner_ssn = _norm_str(obj.get("owner_ssn"))
    fields.owner_address = _norm_address(obj.get("owner_address"))
    fields.vehicle_reg_no = _norm_reg_no(obj.get("vehicle_reg_no"))
    fields.vehicle_vin = _norm_vin(obj.get("vehicle_vin"))
    if fields.vehicle_vin and len(fields.vehicle_vin) != 17:
        warnings.append(f"vehicle_vin: 17자가 아님 ({fields.vehicle_vin})")
    fields.vehicle_model = _norm_str(obj.get("vehicle_model"))
    fields.vehicle_year = _norm_year(obj.get("vehicle_year"))
    fields.vehicle_mileage = _to_int(obj.get("vehicle_mileage"), warnings, "vehicle_mileage")
    # Codex may still return a legacy "vehicle_total_weight" — prefer that (it's the value we keep
    # under the new "vehicle_weight" semantics, i.e. total/gross weight).
    raw_weight = obj.get("vehicle_total_weight")
    if raw_weight is None or (isinstance(raw_weight, str) and raw_weight.strip() == ""):
        raw_weight = obj.get("vehicle_weight")
    fields.vehicle_weight = _to_int(raw_weight, warnings, "vehicle_weight")

    for k in obj:
        if k not in _ALL_KEYS:
            warnings.append(f"알 수 없는 키 무시: {k}")

    empty = [k for k in _ALL_KEYS if getattr(fields, k) in (None, "")]
    if len(empty) == len(_ALL_KEYS):
        warnings.append("추출된 값이 없음")
        status = "partial"
    elif empty:
        warnings.append("비어있는 필드: " + ", ".join(empty))
        status = "partial"
    else:
        status = "ok"
    return ExtractResponse(fields=fields, raw=raw, status=status, warnings=warnings, error_code=None)


def extract_from_upload(data: bytes, filename: str) -> ExtractResponse:
    filename = filename or ""
    if not data:
        return _failed("OCR_BAD_IMAGE", "빈 파일")
    try:
        img = _load_image(data, filename)
    except Exception as exc:  # noqa: BLE001 — any decode failure -> bad image
        return _failed("OCR_BAD_IMAGE", f"이미지 열기 실패: {exc}")

    tmp_path = None
    try:
        img = _downscale(img)
        fd, tmp_path = tempfile.mkstemp(suffix=".jpg")
        os.close(fd)
        img.save(tmp_path, format="JPEG", quality=90)
    except Exception as exc:  # noqa: BLE001 — disk full / encode failure
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return _failed("OCR_BAD_IMAGE", f"이미지 처리 실패: {exc}")

    try:
        raw = codex_client.run_codex_ocr(tmp_path)
    except codex_client.CodexError as exc:
        code = _ERR_MAP.get(type(exc), "OCR_BAD_OUTPUT")
        return _failed(code, f"{type(exc).__name__}: {exc}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    obj = _extract_json(raw)
    if obj is None:
        return _failed("OCR_BAD_OUTPUT", raw)
    return _parse_and_normalize(obj, raw)
