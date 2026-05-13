"""Shared OCR extraction prompt — all providers use this so results are comparable."""

EXTRACTION_PROMPT = (
    "당신은 한국 자동차등록증 OCR 추출기다. 첨부 이미지(또는 본문 텍스트)에서 아래 키만 가진 "
    "JSON 객체 하나만 출력하라. 코드펜스·설명·다른 텍스트 금지. 값을 못 읽으면 null. "
    "키: owner_name, owner_ssn, owner_address, vehicle_reg_no, vehicle_vin, "
    "vehicle_model, vehicle_year, vehicle_mileage(정수 km 또는 null), "
    "vehicle_weight(차량총중량 정수 kg, 없으면 차량중량, 둘 다 없으면 null). "
    "vehicle_vin 은 공백 없는 영문 대문자/숫자. owner_address 는 한 줄. "
    "숫자는 콤마 없이 정수만."
)
