import os

# Groq (free-tier LLM API, OpenAI-compatible)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
MODEL_NAME = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

# Supabase (stores pipeline results + the human-review queue)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # secret/service-role key on backend only

# Dataset source.
#
# If INBOX_SOURCE is explicitly set, that always wins. Otherwise the deployed
# app automatically uses the full participant bundle when it is present in
# data/sdoc-hackathon-bundle.zip, and falls back to the 5-email demo dataset.
#
# Supported values:
#   ./data/sdoc-hackathon-bundle.zip  (original participant ZIP; no extraction)
#   ./data                            (extracted participant bundle)
#   ./demo_data                       (small 5-email demo)
#   http://localhost:8080             (organizers' Docker server)
FULL_BUNDLE_PATH = "./data/sdoc-hackathon-bundle.zip"
if "INBOX_SOURCE" in os.environ:
    INBOX_SOURCE = os.environ["INBOX_SOURCE"]
elif os.path.exists(FULL_BUNDLE_PATH):
    INBOX_SOURCE = FULL_BUNDLE_PATH
else:
    INBOX_SOURCE = "./demo_data"

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
