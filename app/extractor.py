
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

SYSTEM_PROMPT = """
Extract the shipment details from a Shipping Instruction (SI) or Bill of
Lading (BL) document.

The same information may have different labels in different documents.
For example, "Port of Loading", "Load Port", and "POL" all refer to the
same field. Similarly, "Gross Weight" and "Gross Weight (kg)" refer to
the same field. Match these different labels to the standard field names
below.

Extract exactly these 7 fields:

* shipper
* consignee
* notify_party
* port_of_loading
* port_of_discharge
* container_count
* gross_weight_kg

Return the values exactly as they appear in the document. won't clean,
convert, or calculate anything. For example, keep "3 x 40ft" as
"3 x 40ft" and "22,000 kg" as "22,000 kg".

If a field is not found in the document, return null for that field.

Respond with ONLY a JSON object and no extra text:
{"shipper": "...", "consignee": "...", "notify_party": "...",
"port_of_loading": "...", "port_of_discharge": "...",
"container_count": "...", "gross_weight_kg": "..."}
"""



def extract_fields(document_text: str) -> dict:
    """
Returns the 7 required fields as raw text, or None if a field is missing.

If the AI call fails, it raises an LLMError so the program can handle the
problem properly instead of making up or guessing a value.
"""

    result = call_json(SYSTEM_PROMPT, document_text)
    return {field: result.get(field) for field in FIELDS}
