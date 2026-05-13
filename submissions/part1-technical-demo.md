# Part 1 · Technical Demo Preparation

> Submission for the Upstage internship assignment.
> Live demo: **<https://totaload-frontend.onrender.com>**
> Repository: **<https://github.com/Richie-Kang/totaload-erp>**

---

## TL;DR

I built **Totaload OCR**, a working web app that uses an **Upstage Document Parse → Solar Chat** pipeline to extract structured data from a real-world Korean enterprise document — the **vehicle registration certificate (자동차등록증)** — and auto-fills the corresponding **government deregistration application (말소등록 신청서)** PDF. The same image is also processed by **OpenAI Codex (CLI vision)** and **Google Gemini 2.5 Flash** through the same UI for direct comparison.

The product target is the operator at a Korean used-car exporter who, today, hand-keys 12 fields from a paper cert into a PDF form, dozens of times per day. The Upstage pipeline cuts that to a 4-second auto-fill plus a review pass.

**Workflows tested (3):**

1. Personal owner, clean phone photo — happy path.
2. Corporate owner with dealership branch suffix, address+name printed on one row — the LLM-confusion case.
3. PDF scan upload (multi-page, first-page render only) — production-typical input.

**One product improvement I'd ship:** a unified `schema_extract` endpoint that takes an image plus a user-defined JSON schema and returns the populated, layout-grounded object in one call — replacing the current `Document Parse → Solar Chat` two-step. Reasoning in §4.

![Totaload OCR — three OCR providers from one upload screen](https://github.com/Richie-Kang/totaload-erp/raw/main/assets/screenshots/01-hero.png)

*The deployed app. The operator drops a registration certificate onto the dropzone; the OCR engine is chosen from the segmented control in the top-right (Upstage is the default and listed first). Everything else — the form schema, the downstream PDF — is identical across the three providers, so the only variable in the comparison is the OCR engine.*

---

## 1. The document and why it's "complex"

The Korean vehicle registration certificate is a one-page government form. To deregister an exported vehicle, an operator transcribes **12 fields** from it into the official "말소등록 신청서" AcroForm PDF (별지 제17호서식). That's the production pipeline.

What makes this document hard:

| Property | Detail |
|---|---|
| Mixed scripts | Hangul labels, Latin VIN, Arabic numerals, full-width punctuation on the same line. |
| Dense PII | The cert prints the full **resident-registration number** (`주민등록번호` — 6 + 7 digits, the Korean equivalent of a SSN), the home or registered-office address, and the legal-entity registration number for corporate owners. Any naive PII-blocking heuristic flags every certificate. |
| Variants | Personal vs. corporate owner (with branch suffixes like `(상품용)`), pre/post-2014 form designs, scanned vs. phone-camera input, occasional 90° rotation. |
| Brittle downstream contract | The destination PDF has 12 AcroForm fields including one whose name has a literal trailing space (`vehicle_year `), a VIN field that appears on both pages and must hold identical strings, and a "WEIGHT KG" box on page 2 that must receive the same value as a different-named field on page 1. Mis-named extraction = blank cells in the printed form. |
| Throughput | One operator processes 20–40 certs/day. A 60-second OCR is functionally unusable; a 4-second OCR feels live. |

---

## 2. The workflow I set up

A two-step Upstage pipeline runs inside `ocr-service/app/providers/upstage.py`:

```
phone photo or PDF
   │
   ├─ ocr-service rasterizes page 1 (pypdfium2), downscales long side to 2000 px,
   │   re-encodes as JPEG q90 → multipart upload
   │
   ▼
POST https://api.upstage.ai/v1/document-digitization      ← Document Parse
   model=document-parse  →  layout-aware text blob
   │
   ▼
POST https://api.upstage.ai/v1/chat/completions           ← Solar Chat
   model=solar-pro
   response_format=json_object
   temperature=0
   system: 9-key extraction prompt (see providers/prompt.py)
   user: the Document Parse output
   │
   ▼
JSON: { owner_name, owner_ssn, owner_address,
        vehicle_reg_no, vehicle_vin, vehicle_model, vehicle_year,
        vehicle_mileage, vehicle_weight }
   │
   ▼
defensive normalization (VIN upper+alnum, address single-line,
year → 4-digit, numeric coercion, owner_name/address split)
   │
   ▼
Postgres `vehicles` row + filled PDF via pypdf
```

The same prompt and the same `_parse_and_normalize` post-processing run for all three providers (Upstage, Codex, Gemini), so accuracy differences are attributable to the model, not the surrounding code.

![Upstage two-step pipeline result — all nine fields populated, owner name and address split correctly](https://github.com/Richie-Kang/totaload-erp/raw/main/assets/screenshots/02-upstage-result.png)

*Result on a real Korean vehicle registration certificate. Document Parse + Solar Chat returned populated values for every field in roughly 3.5 seconds; the "(by Upstage)" tag in the green banner makes the provider explicit so the operator can compare against Codex/Gemini side by side. Notice that the owner name and the address are split correctly even though they're printed on a single row on the source document — the defensive post-processing described in §3.2 catches that case.*

---

## 3. What worked, what didn't, how I addressed it

### 3.1 What worked

- **Korean field-label OCR is reliable.** `자동차등록번호`, `차대번호`, `주행거리`, `차량총중량`, `소유자` were all found on the first attempt in three test images. Document Parse's layout output preserved row boundaries enough that Solar Chat didn't have to guess where one field ended and the next began.
- **Solar Chat respects `response_format: json_object`.** Across the test runs the model returned a clean dict every time — no JSON fences, no leading "Sure! Here is …", no trailing chatter. This is rare among LLM JSON-modes and was the single biggest reason I kept Upstage as the primary path.
- **End-to-end latency is well inside the operator threshold.** Median ~3.5 s per cert on a Render free-tier container (no GPU). That's slow enough to show a spinner, fast enough that an operator doesn't context-switch away.
- **Korean addresses survive normalization.** Document Parse keeps `경기도 이천시 장호원읍 경충대로718번길 53` as a contiguous string with predictable whitespace — the downstream `_norm_address` pass only has to collapse newlines, not reassemble tokens.

![Generated official deregistration application PDF, page 1, with the 12 fields filled in](https://github.com/Richie-Kang/totaload-erp/raw/main/assets/screenshots/03-pdf-preview.png)

*The deliverable. pypdf fills the 12 AcroForm fields of the government 별지 제17호서식 template — including the `vehicle_year ` field whose name has a literal trailing space, the `vehicle_vin_1` / `vehicle_vin_2` duplicated VIN that must hold identical strings across both pages, and the page-2 weight box that receives the same value as the page-1 weight row. The operator reviews the filled PDF, then downloads or prints.*

### 3.2 What didn't work, and the fix

**Issue 1 — Owner field swallowed the address.**
On a corporate cert, the "소유자" row prints `[full address] [legal-entity name]` on a single line, e.g. `경기도 이천시 장호원읍 경충대로718번길 53 (주)카비드 이천지점(상품용)`. Solar Chat treated the whole string as `owner_name`, leaving `owner_address` null. The operator saw an obviously-wrong "name" with the address embedded.

*Root cause.* The 2-step pipeline flattens Document Parse's spatial information before Solar sees it. Solar gets `소유자: 경기도 이천시 … (주)카비드 …` and naturally captures everything that follows the label.

*Fix, two layers:*
- **Prompt** — rewrote `providers/prompt.py` to enumerate each of 9 keys with explicit constraints, and to call out this specific failure mode verbatim: `owner_name 에는 주소를 절대 포함하지 마라; 한 줄에 [주소][회사명] 형태로 적혀 있어도 행정구역·도로명·번지를 빼고 회사명만 추출하라`.
- **Defensive post-processing in `extract.py`** — if `owner_name` contains a corporate prefix (`(주)`, `(유)`, `(재)`, `주식회사`, `유한회사`) preceded by address tokens (`특별시·광역시·도/시/구/읍/면/동/리/로/길/번지/번길`), split there. The company portion stays as `owner_name`; the address portion fills `owner_address` only if it's empty. A `"주소를 분리"` warning is recorded in `raw_ocr.warnings` so the operator can audit the split. Coverage: `ocr-service/tests/test_ocr.py::test_owner_name_splits_address_and_company`.

This is a generic pattern — two layers of defense (prompt + deterministic post-processing) — that I'd recommend for any production extraction pipeline because LLM compliance with prompt rules is probabilistic, not guaranteed.

**Issue 2 — Multi-page PDFs aren't accepted by Document Parse.**
The endpoint takes images, not multi-page PDFs. Some operators upload PDF scans where page 1 is the cert and page 2+ are sales documents.

*Fix.* The OCR service renders page 1 only with `pypdfium2` at `scale=2.0`, downscales to 2000 px long side, and JPEG-encodes at q90 before sending. The 4 MB → ~600 KB compression keeps us inside both Upstage's upload limits and our own 60-second timeout, and the q90 quality is empirically lossless for OCR purposes. Documented in ADR-010.

**Issue 3 — Cold-start latency on a free-tier deploy.**
The first request after a 15-minute idle period takes 30–60 s while three Render containers warm up. Upstage's own latency is unaffected; the cold-start cost is on our side.

*Fix.* The frontend banner says "Analyzing — this can take ~30s on the first request" so the operator doesn't perceive it as a hang. A production deployment would either keep the backend warm on a Starter plan ($7/mo) or ping `/api/health` every 5 minutes via UptimeRobot.

**Issue 4 — PII handling is on the application, not the provider.**
The resident-registration number Upstage extracts is the actual national-ID equivalent. Treating that responsibly is a downstream concern (encryption-at-rest, access logs, never appearing in search responses). Not a Document Parse issue — but worth flagging because the assignment specifically called out masking.

*Fix on the application side.* In Totaload OCR, `owner_ssn` is **never returned by `GET /api/malso/search`** (verified by `backend/test/api.test.ts::owner_ssn never in search results`); the detail view shows it only on the explicit form. The PDF that gets printed uses the plaintext value because the government form requires it. This is the smallest blast-radius design.

---

## 4. One product improvement I would ship

### Add a `schema_extract` endpoint: image + JSON schema → populated object, in one call.

**The proposal**

```http
POST https://api.upstage.ai/v1/document/schema-extract
Authorization: Bearer ${UPSTAGE_API_KEY}

multipart/form-data:
  document: <image | pdf>
  schema: {
    "type": "object",
    "properties": {
      "owner_name": {
        "type": "string",
        "description": "법인명 또는 개인명. 주소는 포함하지 않음."
      },
      "owner_ssn": { "type": "string", "pattern": "^\\d{6}-?\\d{7}$" },
      "owner_address": { "type": "string" },
      "vehicle_vin": { "type": "string", "pattern": "^[A-HJ-NPR-Z0-9]{17}$" },
      "vehicle_mileage": { "type": ["integer", "null"], "minimum": 0 }
    },
    "required": ["vehicle_vin"]
  }

→ 200 OK
{
  "fields": { "owner_name": "(주)카비드 이천지점", "owner_ssn": "…", … },
  "confidence": { "owner_name": 0.94, "owner_ssn": 0.99, … },
  "regions":    { "owner_name": { "page": 1, "bbox": [x,y,w,h] }, … },
  "warnings":   []
}
```

**Why this is the single biggest win for Korean enterprise customers**

1. **The schema is the contract.** Today the customer writes a Solar prompt *and* a separate validator/regex/coercer in their backend. Both can drift. A JSON Schema unifies them — the same artifact validates the request and constrains the model. Schemas are diffable, versionable, and lint-able; prompts are not.

2. **Layout information stays inside Upstage.** The current 2-step flow flattens Document Parse's spatial output before the LLM sees it. That's exactly why "[address] [company]" on one row breaks: Solar gets a flat string and has to re-infer field boundaries that Document Parse already knew. A unified endpoint can run extraction with full spatial context, eliminating an entire class of customer bugs at the source.

3. **Per-field confidence + region are a sales feature for compliance-heavy verticals.** Korean banks, insurers, dealerships, and government processors all need an audit trail per field, especially for PII. Returning `confidence` and `regions` next to each value lets a customer build a "review-on-low-confidence" UI in an afternoon. Right now the customer would need a separate bounding-box API call and would still not get confidence at all.

4. **Halves the latency and the billing for high-volume customers.** Two round trips become one; two model passes become one; two line items become one. For a customer doing 10,000 documents/day this is the difference between two SKUs and one. Same accuracy, half the cost.

5. **Generalizes Studio's "Agent" abstraction into a primitive API.** Upstage Studio already wraps multi-step extraction behind a single agent name — this is that pattern formalized as a stable, versionable primitive that direct-API customers can use without ever touching the Studio dashboard. Studio itself can use it under the hood; nothing has to break.

The closest existing primitive is Information Extraction in Document Parse, but it requires the document type to be pre-registered in the dashboard and doesn't support arbitrary per-call schemas with `pattern` / `enum` / `format` validators. The proposal generalizes that into a per-call primitive that any backend engineer can adopt without leaving their codebase.

---

## 5. Artifacts

| Artifact | Where |
|---|---|
| Live web app | <https://totaload-frontend.onrender.com> |
| Repository | <https://github.com/Richie-Kang/totaload-erp> |
| Upstage provider source | [`ocr-service/app/providers/upstage.py`](https://github.com/Richie-Kang/totaload-erp/blob/main/ocr-service/app/providers/upstage.py) |
| Shared extraction prompt | [`ocr-service/app/providers/prompt.py`](https://github.com/Richie-Kang/totaload-erp/blob/main/ocr-service/app/providers/prompt.py) |
| Defensive owner/address split | [`ocr-service/app/extract.py`](https://github.com/Richie-Kang/totaload-erp/blob/main/ocr-service/app/extract.py) (`_split_name_from_address`) |
| Pytest coverage (30 cases incl. Upstage 2-step) | [`ocr-service/tests/test_ocr.py`](https://github.com/Richie-Kang/totaload-erp/blob/main/ocr-service/tests/test_ocr.py) |
| Architecture decision record (multi-OCR) | [`docs/ADR.md` § ADR-012](https://github.com/Richie-Kang/totaload-erp/blob/main/docs/ADR.md) |
| Competitor comparison (this submission) | `submissions/competitor-comparison.html` |

> All credentials (Upstage API key, Gemini API key, database password, Codex auth) are injected at deploy time as `sync: false` environment variables in `render.yaml`. No keys are committed to the repository.
