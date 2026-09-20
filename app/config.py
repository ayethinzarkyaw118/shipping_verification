import os

# Groq (free-tier LLM API, OpenAI-compatible)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL_NAME = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# Supabase (stores pipeline results + the human-review queue)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # use the service_role key on the backend

# Dataset source: defaults to the small bundled demo_data/ (5 real emails,
# one per category) so the app works out of the box. Point this at the full
# hackathon bundle (or the Docker server) for real scoring:
#   export INBOX_SOURCE=./data              (extracted hackathon bundle)
#   export INBOX_SOURCE=http://localhost:8080  (their Docker server)
INBOX_SOURCE = os.environ.get("INBOX_SOURCE", "./demo_data")

# The seven fields the comparator checks, and the label variants seen across
# real-world SI/BL documents. Extend this if the real dataset uses other labels.
FIELD_LABEL_VARIANTS = {
    "shipper": ["shipper", "shipper name", "shipper (exporter)"],
    "consignee": ["consignee", "consignee name"],
    "notify_party": ["notify party", "notify", "notify party (if not consignee)"],
    "port_of_loading": ["port of loading", "load port", "pol", "port of loading (pol)"],
    "port_of_discharge": ["port of discharge", "discharge port", "pod", "port of discharge (pod)"],
    "container_count": ["container count", "no. of containers", "number of containers", "containers"],
    "gross_weight_kg": ["gross weight", "gross weight (kg)", "gross weight in kg", "weight"],
}

EMAIL_CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
COMPARISON_CATEGORY = "BL_COMPARISON"

# Matches the hackathon's ground_truth.json vocabulary exactly.
STATUS_OK = "OK"
STATUS_MISMATCH = "MISMATCH"
STATUS_NEEDS_REVIEW = "NEEDS_REVIEW"

REVIEW_REASONS = ["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]
