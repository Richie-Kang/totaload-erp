import base64
import io
import json
import os

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader

from app import fill_pdf, providers
from app.providers import codex as codex_provider
from app.providers import gemini as gemini_provider
from app.providers import upstage as upstage_provider
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
    assert "vehicle_year " in fill_pdf.PDF_FIELD_NAMES  # trailing space matters


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
    assert _field_value(reader, "vehicle_weight_1") == "1200"
    assert _field_value(reader, "vehicle_weight_2") == "1200"


def test_fill_pdf_defaults_and_missing():
    pdf_bytes, missing = fill(FillPdfRequest(owner_name="홍길동", vehicle_weight="850"))
    assert "vehicle_reg_no" in missing and "vehicle_vin_1" in missing
    assert "owner_name" not in missing
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert "년" in _field_value(reader, "current_date")
    # both weight fields share the single 차량중량
    assert _field_value(reader, "vehicle_weight_2") == "850"


# --- defensive output parsing (provider = codex by default in these tests) ---

def _mock_codex(monkeypatch, returner):
    monkeypatch.setattr(codex_provider, "run_codex_ocr", returner)


def test_parse_pure_json(monkeypatch):
    _mock_codex(monkeypatch, lambda p: _full_json())
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.status == "ok"
    assert r.error_code is None
    assert r.provider == "codex"
    assert r.fields.owner_name == "홍길동"
    assert r.fields.vehicle_mileage == 12000


def test_parse_codefence(monkeypatch):
    _mock_codex(monkeypatch, lambda p: f"```json\n{_full_json()}\n```")
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.status == "ok"
    assert r.fields.vehicle_model == "레이"


def test_parse_prose_plus_json(monkeypatch):
    blob = f"분석 결과는 다음과 같습니다:\n{_full_json()}\ntokens used: 1234"
    _mock_codex(monkeypatch, lambda p: blob)
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.status == "ok"
    assert r.fields.vehicle_reg_no == "123가4567"


def test_parse_garbage(monkeypatch):
    _mock_codex(monkeypatch, lambda p: "죄송하지만 이미지를 읽을 수 없습니다.")
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
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
    _mock_codex(monkeypatch, lambda p: raw)
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.fields.vehicle_vin == "KL3AB12CD34567890"
    assert r.fields.vehicle_mileage == 12000
    assert r.fields.owner_address == "인천 미추홀구 어딘가로 12"
    assert r.fields.vehicle_year == "2015"
    assert r.fields.vehicle_weight == 1050
    assert r.status == "ok"


def test_normalize_bad_number_warns(monkeypatch):
    _mock_codex(monkeypatch, lambda p: _full_json(vehicle_mileage="없음"))
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.fields.vehicle_mileage is None
    assert r.status == "partial"
    assert any("vehicle_mileage" in w for w in r.warnings)


def test_owner_name_splits_address_and_company(monkeypatch):
    """LLM puts '[address] [company]' into owner_name → post-processing splits it."""
    _mock_codex(
        monkeypatch,
        lambda p: _full_json(
            owner_name="경기도 이천시 장호원읍 경충대로718번길 53 (주)카비드 이천지점(상품용)",
            owner_address=None,
        ),
    )
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.fields.owner_name == "(주)카비드 이천지점(상품용)"
    assert r.fields.owner_address == "경기도 이천시 장호원읍 경충대로718번길 53"
    assert any("주소를 분리" in w for w in r.warnings)


def test_owner_name_leaves_clean_company_alone(monkeypatch):
    """Already-clean owner_name (no address prefix) is untouched."""
    _mock_codex(monkeypatch, lambda p: _full_json(owner_name="(주)카비드 이천지점"))
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.fields.owner_name == "(주)카비드 이천지점"
    # personal name with no company tag is also untouched
    _mock_codex(monkeypatch, lambda p: _full_json(owner_name="홍길동"))
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.fields.owner_name == "홍길동"


def test_owner_name_split_preserves_existing_address(monkeypatch):
    """If owner_address already has a value, splitting owner_name keeps the existing one."""
    _mock_codex(
        monkeypatch,
        lambda p: _full_json(
            owner_name="서울특별시 강남구 테헤란로 1 주식회사 어쩌고",
            owner_address="실제주소가 따로 있음",
        ),
    )
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.fields.owner_name.startswith("주식회사")
    assert r.fields.owner_address == "실제주소가 따로 있음"


# --- extract entrypoint ----------------------------------------------------

def test_extract_bad_image():
    r = extract_from_upload(b"this is definitely not an image", "fake.jpg", provider="codex")
    assert r.status == "failed"
    assert r.error_code == "OCR_BAD_IMAGE"


def test_extract_empty_file():
    r = extract_from_upload(b"", "x.jpg", provider="codex")
    assert r.status == "failed"
    assert r.error_code == "OCR_BAD_IMAGE"


def test_extract_codex_mocked_partial(monkeypatch):
    _mock_codex(
        monkeypatch,
        lambda p: json.dumps({"owner_name": "홍길동", "vehicle_vin": None}),
    )
    r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
    assert r.status == "partial"
    assert r.fields.owner_name == "홍길동"
    assert r.fields.vehicle_vin is None


def test_extract_provider_errors(monkeypatch):
    cases = {
        providers.ProviderUnavailable: "OCR_UNAVAILABLE",
        providers.ProviderAuth: "OCR_AUTH",
        providers.ProviderRateLimit: "OCR_RATE_LIMIT",
        providers.ProviderTimeout: "OCR_TIMEOUT",
        providers.ProviderBadOutput: "OCR_BAD_OUTPUT",
    }
    for exc_cls, code in cases.items():
        def _raise(p, exc_cls=exc_cls):
            raise exc_cls("boom")

        monkeypatch.setattr(codex_provider, "run_codex_ocr", _raise)
        r = extract_from_upload(_png_bytes(), "cert.png", provider="codex")
        assert r.status == "failed"
        assert r.error_code == code
        assert all(getattr(r.fields, k) is None for k in ALL_KEYS)


def test_extract_unknown_provider():
    r = extract_from_upload(_png_bytes(), "cert.png", provider="claude")
    assert r.status == "failed"
    assert r.error_code == "OCR_BAD_OUTPUT"


# --- upstage provider ------------------------------------------------------

def test_upstage_requires_api_key(monkeypatch):
    monkeypatch.delenv("UPSTAGE_API_KEY", raising=False)
    r = extract_from_upload(_png_bytes(), "cert.png", provider="upstage")
    assert r.status == "failed"
    assert r.error_code == "OCR_UNAVAILABLE"
    assert r.provider == "upstage"


def test_upstage_two_step_pipeline(monkeypatch):
    """Document Parse → Solar Chat. Both calls are mocked at the module's httpx.post."""
    monkeypatch.setenv("UPSTAGE_API_KEY", "test-key")

    calls = []

    class _Resp:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.text = json.dumps(payload)
        def json(self):
            return self._payload

    def _fake_post(url, **kwargs):
        calls.append((url, kwargs))
        if "document-digitization" in url:
            return _Resp(200, {"content": {"text": "raw OCR text from doc-parse"}})
        if "chat/completions" in url:
            return _Resp(200, {"choices": [{"message": {"content": _full_json()}}]})
        return _Resp(404, {"error": "unexpected"})

    monkeypatch.setattr(upstage_provider.httpx, "post", _fake_post)
    r = extract_from_upload(_png_bytes(), "cert.png", provider="upstage")
    assert r.status == "ok"
    assert r.provider == "upstage"
    assert r.fields.owner_name == "홍길동"
    # confirms 2-step: 1st call = document-parse, 2nd = chat
    assert "document-digitization" in calls[0][0]
    assert "chat/completions" in calls[1][0]


def test_upstage_auth_error(monkeypatch):
    monkeypatch.setenv("UPSTAGE_API_KEY", "bad-key")

    class _Resp:
        status_code = 401
        text = "unauthorized"
        def json(self): return {}

    monkeypatch.setattr(upstage_provider.httpx, "post", lambda *a, **kw: _Resp())
    r = extract_from_upload(_png_bytes(), "cert.png", provider="upstage")
    assert r.status == "failed"
    assert r.error_code == "OCR_AUTH"


# --- gemini provider -------------------------------------------------------

def test_gemini_requires_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = extract_from_upload(_png_bytes(), "cert.png", provider="gemini")
    assert r.status == "failed"
    assert r.error_code == "OCR_UNAVAILABLE"


def test_gemini_single_call(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class _Resp:
        status_code = 200
        text = ""
        def json(self):
            return {
                "candidates": [
                    {"content": {"parts": [{"text": _full_json()}]}}
                ]
            }

    captured = {}

    def _fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs.get("json")
        return _Resp()

    monkeypatch.setattr(gemini_provider.httpx, "post", _fake_post)
    r = extract_from_upload(_png_bytes(), "cert.png", provider="gemini")
    assert r.status == "ok"
    assert r.provider == "gemini"
    assert "generativelanguage.googleapis.com" in captured["url"]
    # image is inline base64
    parts = captured["json"]["contents"][0]["parts"]
    assert any("inline_data" in p for p in parts)


def test_gemini_rate_limit(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class _Resp:
        status_code = 429
        text = "rate limited"
        def json(self): return {}

    monkeypatch.setattr(gemini_provider.httpx, "post", lambda *a, **kw: _Resp())
    r = extract_from_upload(_png_bytes(), "cert.png", provider="gemini")
    assert r.error_code == "OCR_RATE_LIMIT"


# --- health ----------------------------------------------------------------

def test_health():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    # all three providers reported
    for key in ("upstage", "codex", "gemini"):
        assert key in body


# --- HTTP /extract end-to-end (provider form field) ------------------------

def test_extract_endpoint_provider_form(monkeypatch):
    monkeypatch.setenv("UPSTAGE_API_KEY", "test-key")
    monkeypatch.setattr(
        upstage_provider, "run_upstage_ocr",
        lambda image_path, image_bytes: _full_json(),
    )
    client = TestClient(app)
    resp = client.post(
        "/extract",
        files={"file": ("cert.png", _png_bytes(), "image/png")},
        data={"provider": "upstage"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["provider"] == "upstage"


def test_extract_endpoint_rejects_unknown_provider():
    client = TestClient(app)
    resp = client.post(
        "/extract",
        files={"file": ("cert.png", _png_bytes(), "image/png")},
        data={"provider": "claude"},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"]["code"] == "BAD_PROVIDER"
