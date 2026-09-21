"""
Document extraction stage (the "document extraction" box in the pipeline - AI).

Responsibility: read one SI or BL document and pull out the 7 shipment fields,
mapping whatever label the document uses (e.g. "Load Port", "POL", "Port of
Loading") onto the canonical field name. Values are returned AS WRITTEN in the
document - "3 x 40ft", "22,000 kg" - with no cleanup or parsing. Turning those
raw strings into clean comparable values is the normalizer's job, not this
stage's, so this prompt stays focused on one thing: finding the right text.
"""
from app.llm_client import call_json

FIELDS = [
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight_kg",
]

SYSTEM_PROMPT = """You extract shipment fields from a Shipping Instruction (SI) or Bill of Lading (BL) document.

Different documents label the same field differently (e.g. "Port of Loading", "Load Port", and "POL" all
mean the same field; "Gross Weight", "Gross Weight (kg)" mean the same field). Map whatever label is used
in the source text onto the canonical field names below.

Extract exactly these fields, as RAW TEXT exactly as written in the document (do not clean up, convert
units, or parse numbers - just copy the value as it appears):
- shipper
- consignee
- notify_party
- port_of_loading
- port_of_discharge
- container_count   (copy as written, e.g. "3 x 40ft", not converted to a number)
- gross_weight_kg   (copy as written, e.g. "22,000 kg", not converted to a number)

If a field is genuinely missing from the document, use null for its value.

Respond with ONLY a JSON object, no other text:
{"shipper": "...", "consignee": "...", "notify_party": "...", "port_of_loading": "...",
 "port_of_discharge": "...", "container_count": "...", "gross_weight_kg": "..."}
"""


def extract_fields(document_text: str) -> dict:
    """
    Returns a dict of the 7 fields as raw strings (or None if missing).
    Raises LLMError on failure so the caller can escalate rather than guess.
    """
    result = call_json(SYSTEM_PROMPT, document_text)
    return {field: result.get(field) for field in FIELDS}
