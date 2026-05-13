import io
import json

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader

from app import codex_client, fill_pdf
from app.extract import extract_from_upload
from app.fill_pdf import fill
from app.main import app
from app.schema import FillPdfRequest

ALL_KEYS = (
    "owner_name", "owner_ssn", "owner_address", "vehicle_reg_no", "vehicle_vin",
    "vehicle_model", "vehicle_year", "vehicle_mileage", "vehicle_weight",
)


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 25), "white").save(buf, format="PNG")
    return buf.getvalue()


def _full_json(**overrides) -> str:
    obj = {
        "owner_name": "홍길동",
        "owner_ssn": "860101-1234567",
        "owner_address": "인천 미추홀구 어딘가로 12",
        "vehicle_reg_no": "123가4567",
        "vehicle_vin": "KL3AB12CD34567890",
        "vehicle_model": "레이",
        "vehicle_year": "2015",
        "vehicle_mileage": 12000,
        "vehicle_weight": 1200,
    }
    obj.update(overrides)
    return json.dumps(obj, ensure_ascii=False)


def _field_value(reader: PdfReader, name: str) -> str:
    return str(reader.get_fields()[name].get("/V"))


# --- PDF filling -----------------------------------------------------------

def test_fill_pdf_field_names_match_template():
    reader = PdfReader(fill_pdf._template_path())
    assert set((reader.get_fields() or {}).keys()) == set(fill_pdf.PDF_FIELD_NAMES)
    # 'vehicle_year ' must keep its trailing space
    assert "vehicle_year " in fill_pdf.PDF_FIELD_NAMES


def test_fill_pdf_all_fields():
    req = FillPdfRequest(
        owner_name="홍길동", owner_ssn="860101-1234567", owner_address="인천 미추홀구 어딘가로 12",
        vehicle_reg_no="123가4567", vehicle_vin="KL3AB12CD34567890", vehicle_model="레이",
        vehicle_year="2015", vehicle_mileage="12000", vehicle_weight="1200",
        current_date="2026년 5월 13일",
    )
    pdf_bytes, missing = fill(req)
    assert missing == []
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert _field_value(reader, "owner_name") == "홍길동"
    assert _field_value(reader, "vehicle_reg_no") == "123가4567"
    assert _field_value(reader, "vehicle_vin_1") == _field_value(reader, "vehicle_vin_2") == "KL3AB12CD34567890"
    assert _field_value(reader, "vehicle_year ") == "2015"
    assert _field_value(reader, "current_date") == "2026년 5월 13일"
    # both weight fields receive the consolidated 차량중량 value
    assert _field_value(reader, "vehicle_weight_1") == "1200"
    assert _field_value(reader, "vehicle_weight_2") == "1200"


def test_fill_pdf_defaults_and_missing():
    pdf_bytes, missing = fill(FillPdfRequest(owner_name="홍길동", vehicle_weight="850"))
    assert "vehicle_reg_no" in missing and "vehicle_vin_1" in missing
    assert "owner_name" not in missing
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert "년" in _field_value(reader, "current_date")  # defaulted to today
    # total weight falls back to weight
    assert _field_value(reader, "vehicle_weight_2") == "850"


# --- defensive output parsing ---------------------------------------------

def test_parse_pure_json(monkeypatch):
    monkeypatch.setattr(codex_client, "run_codex_ocr", lambda p: _full_json())
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.status == "ok"
    assert r.error_code is None
    assert r.fields.owner_name == "홍길동"
    assert r.fields.vehicle_mileage == 12000


def test_parse_codefence(monkeypatch):
    monkeypatch.setattr(codex_client, "run_codex_ocr", lambda p: f"```json\n{_full_json()}\n```")
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.status == "ok"
    assert r.fields.vehicle_model == "레이"


def test_parse_prose_plus_json(monkeypatch):
    blob = f"분석 결과는 다음과 같습니다:\n{_full_json()}\ntokens used: 1234"
    monkeypatch.setattr(codex_client, "run_codex_ocr", lambda p: blob)
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.status == "ok"
    assert r.fields.vehicle_reg_no == "123가4567"


def test_parse_garbage(monkeypatch):
    monkeypatch.setattr(codex_client, "run_codex_ocr", lambda p: "죄송하지만 이미지를 읽을 수 없습니다.")
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.status == "failed"
    assert r.error_code == "OCR_BAD_OUTPUT"
    assert all(getattr(r.fields, k) is None for k in ALL_KEYS)


# --- normalization ---------------------------------------------------------

def test_normalize(monkeypatch):
    raw = _full_json(
        vehicle_vin="kl3-ab 12!cd34567890",
        vehicle_mileage="약 12,000 km",
        owner_address="인천 미추홀구\n어딘가로  12",
        vehicle_year="2015년형 차량",
        vehicle_weight="1,050kg",
    )
    monkeypatch.setattr(codex_client, "run_codex_ocr", lambda p: raw)
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.fields.vehicle_vin == "KL3AB12CD34567890"
    assert r.fields.vehicle_mileage == 12000
    assert r.fields.owner_address == "인천 미추홀구 어딘가로 12"
    assert r.fields.vehicle_year == "2015"
    assert r.fields.vehicle_weight == 1050
    assert r.status == "ok"


def test_normalize_bad_number_warns(monkeypatch):
    monkeypatch.setattr(codex_client, "run_codex_ocr", lambda p: _full_json(vehicle_mileage="없음"))
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.fields.vehicle_mileage is None
    assert r.status == "partial"
    assert any("vehicle_mileage" in w for w in r.warnings)


# --- extract entrypoint ----------------------------------------------------

def test_extract_bad_image():
    r = extract_from_upload(b"this is definitely not an image", "fake.jpg")
    assert r.status == "failed"
    assert r.error_code == "OCR_BAD_IMAGE"


def test_extract_empty_file():
    r = extract_from_upload(b"", "x.jpg")
    assert r.status == "failed"
    assert r.error_code == "OCR_BAD_IMAGE"


def test_extract_codex_mocked_partial(monkeypatch):
    monkeypatch.setattr(
        codex_client, "run_codex_ocr",
        lambda p: json.dumps({"owner_name": "홍길동", "vehicle_vin": None}),
    )
    r = extract_from_upload(_png_bytes(), "cert.png")
    assert r.status == "partial"
    assert r.fields.owner_name == "홍길동"
    assert r.fields.vehicle_vin is None


def test_extract_codex_errors(monkeypatch):
    cases = {
        codex_client.CodexUnavailable: "OCR_UNAVAILABLE",
        codex_client.CodexAuth: "OCR_AUTH",
        codex_client.CodexRateLimit: "OCR_RATE_LIMIT",
        codex_client.CodexTimeout: "OCR_TIMEOUT",
        codex_client.CodexBadOutput: "OCR_BAD_OUTPUT",
    }
    for exc_cls, code in cases.items():
        def _raise(p, exc_cls=exc_cls):
            raise exc_cls("boom")

        monkeypatch.setattr(codex_client, "run_codex_ocr", _raise)
        r = extract_from_upload(_png_bytes(), "cert.png")
        assert r.status == "failed"
        assert r.error_code == code
        assert all(getattr(r.fields, k) is None for k in ALL_KEYS)


# --- health ----------------------------------------------------------------

def test_health():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "codex" in body
    assert body["codex"] in {"ok", "missing", "unauthenticated", "unknown"}
