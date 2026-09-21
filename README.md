# Shipping Document Verification

Backend API for the Averis x Monash SDOC hackathon use case.

The system classifies shipping-related emails, reads Shipping Instruction (SI) and draft Bill of Lading (BL) attachments, extracts important shipment fields, compares SI vs BL values, and sends uncertain cases to a human-review queue.

## Tech Stack

- **FastAPI** — REST API
- **Groq** — LLM classification and document-field extraction
- **Supabase** — stores results and human-review cases
- **Vercel** — production deployment
- **Python** — deterministic normalization, comparison, and validation

## What the System Does

Each email is classified into one of these categories:

- `BL_COMPARISON`
- `SI_REQUEST`
- `INVOICE_QUERY`
- `GENERAL`
- `SPAM`

Only `BL_COMPARISON` emails continue to the SI/BL document-comparison workflow.

For a BL comparison, the backend:

1. Identifies the SI and BL attachments.
2. Reads TXT, PDF, DOCX, or XLSX files.
3. Extracts shipment fields with the LLM.
4. Normalizes the extracted values.
5. Compares SI values against BL values.
6. Returns `OK`, `MISMATCH`, or `NEEDS_REVIEW`.
7. Saves the result to Supabase when Supabase is configured.

## Processing Flow

```text
Email
  |
  v
Classifier
  |
  +--> SI_REQUEST / INVOICE_QUERY / GENERAL / SPAM
  |        -> stop after classification
  |
  +--> BL_COMPARISON
           |
           v
     Attachment Finder
           |
           v
     Document Reader
     TXT / PDF / DOCX / XLSX
           |
           v
     Field Extraction
           |
           v
      Normalization
           |
           v
       Comparison
           |
           v
       Validation
        /       \
       /         \
      v           v
 OK / MISMATCH   NEEDS_REVIEW
```

## Fields Compared

The comparison currently checks:

- Shipper
- Consignee
- Notify party
- Port of loading
- Port of discharge
- Container count
- Gross weight in kilograms

## Human Review

The system uses `NEEDS_REVIEW` when it cannot safely make a final comparison.

Supported review reasons:

- `wrong_doc_type`
- `missing_attachment`
- `unreadable`
- `missing_value`

These cases are stored in the Supabase `review_queue` table when Supabase is configured.

## Project Structure

```text
shipping_verification_backend/
|
|-- api/
|   `-- index.py                 # Vercel FastAPI entry point
|
|-- app/
|   |-- main.py                  # API routes
|   |-- config.py                # Environment variables and constants
|   |-- loader.py                # Reads demo, full ZIP, folder, or HTTP dataset
|   |-- classifier.py            # Email classification
|   |-- attachment_finder.py     # Finds SI and BL files
|   |-- document_reader.py       # TXT/PDF/DOCX/XLSX -> text
|   |-- extractor.py             # LLM field extraction
|   |-- normalizer.py            # Cleans and standardizes values
|   |-- comparator.py            # SI vs BL comparison
|   |-- validator.py             # OK/MISMATCH/NEEDS_REVIEW decision
|   |-- pipeline.py              # Full processing workflow
|   |-- models.py                # Pydantic models
|   |-- llm_client.py            # Groq client
|   `-- supabase_client.py      # Result and review-queue persistence
|
|-- demo_data/                   # 5-email demo dataset
|
|-- data/
|   |-- README.md
|   `-- sdoc-hackathon-bundle.zip   # Full participant dataset (add this file)
|
|-- build_submission.py          # Builds hackathon submission output
|-- supabase_schema.sql          # Supabase tables
|-- requirements.txt
|-- Dockerfile
|-- vercel.json
`-- README.md
```

## Environment Variables

Create the following environment variables locally or in Vercel.

### Required for AI processing

```text
GROQ_API_KEY=your_groq_api_key
```

Optional model override:

```text
GROQ_MODEL=openai/gpt-oss-120b
```

If `GROQ_MODEL` is not set, the backend uses `openai/gpt-oss-120b`.

### Supabase

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=sb_secret_YOUR_SECRET_KEY
```

Use a backend **secret key** such as `sb_secret_...` (or a legacy service-role key).

Do not put the secret key in frontend code or commit it to GitHub.

### Dataset

```text
INBOX_SOURCE=./demo_data
```

`INBOX_SOURCE` is optional.

If it is not set, the backend checks for:

```text
./data/sdoc-hackathon-bundle.zip
```

If that ZIP exists, it is used automatically. Otherwise the backend falls back to:

```text
./demo_data
```

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/ayethinzarkyaw118/shipping_verification_backend.git
cd shipping_verification_backend
```

### 2. Create a virtual environment

Windows:

```bash
python -m venv .venv
.venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Set environment variables

Windows PowerShell:

```powershell
$env:GROQ_API_KEY="your_groq_key"
$env:SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
$env:SUPABASE_KEY="sb_secret_YOUR_SECRET_KEY"
```

macOS/Linux:

```bash
export GROQ_API_KEY="your_groq_key"
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export SUPABASE_KEY="sb_secret_YOUR_SECRET_KEY"
```

### 5. Start the API

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://localhost:8000/docs
```

## Demo Dataset

The repository contains five demo emails in `demo_data/`.

The demo set is useful for quick checks of the five email categories without loading the full hackathon bundle.

To force demo mode:

```text
INBOX_SOURCE=./demo_data
```

## Full Hackathon Dataset

Use the participant bundle:

```text
sdoc-hackathon-bundle.zip
```

Place it at:

```text
data/sdoc-hackathon-bundle.zip
```

The loader can read the ZIP directly, so extraction is not required.

Do **not** put the organizer Docker/scoring package or `ground_truth.json` into the production application.

To explicitly use the full ZIP locally:

Windows PowerShell:

```powershell
$env:INBOX_SOURCE="./data/sdoc-hackathon-bundle.zip"
```

macOS/Linux:

```bash
export INBOX_SOURCE="./data/sdoc-hackathon-bundle.zip"
```

## Supabase Setup

Run the SQL in:

```text
supabase_schema.sql
```

This creates:

### `email_results`

Stores processed email results.

### `review_queue`

Stores unresolved `NEEDS_REVIEW` cases.

For the backend, use a Supabase secret/service-role key so server-side inserts are not blocked by Row Level Security.

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health check, Supabase status, and dataset email count |
| GET | `/emails` | List emails from the active dataset |
| GET | `/results/{email_id}` | Process one email |
| GET | `/results` | Process every email in the active dataset |
| GET | `/submission` | Build the hackathon submission JSON |
| GET | `/review-queue` | Get unresolved human-review cases |
| POST | `/review-queue/{email_id}/resolve` | Mark a review case as resolved |
| GET | `/docs` | FastAPI Swagger documentation |

### Example

```text
GET /results/email_001
```

Example response shape:

```json
{
  "email_id": "email_001",
  "category": "BL_COMPARISON",
  "mismatch_found": false,
  "mismatches": [],
  "summary": "No mismatch detected.",
  "needs_review": false,
  "escalation": null
}
```

## Health Check

Call:

```text
GET /health
```

Example with the five-email demo dataset:

```json
{
  "status": "ok",
  "supabase_configured": true,
  "email_count": 5
}
```

When the full participant bundle is correctly installed, `email_count` should reflect the full dataset.

## Building the Submission

To build a submission JSON file from the full dataset:

```bash
python build_submission.py ./data/sdoc-hackathon-bundle.zip --out submission.json
```

If you are using the organizer Docker scoring server locally:

```bash
python build_submission.py ./data/sdoc-hackathon-bundle.zip --submit http://localhost:8080
```

Keep the Docker/scoring package local. It should not be deployed with the production backend.

## Vercel Deployment

The project uses:

```text
api/index.py
```

as the Vercel FastAPI entry point.

Add these environment variables in **Vercel -> Project -> Settings -> Environment Variables**:

```text
GROQ_API_KEY
SUPABASE_URL
SUPABASE_KEY
```

Optional:

```text
GROQ_MODEL
INBOX_SOURCE
```

After changing an environment variable, redeploy the Production deployment.

## Frontend Integration

This repository currently exposes the backend API.

An existing frontend can connect to it by using the deployed backend URL as its API base URL.

For example:

```javascript
fetch(`${API_BASE_URL}/emails`)
fetch(`${API_BASE_URL}/results/email_001`)
fetch(`${API_BASE_URL}/review-queue`)
```

The frontend should process individual emails with `/results/{email_id}` instead of automatically running all emails through `/results`, especially when using the full dataset.

## Important Notes

- Keep `GROQ_API_KEY` and `SUPABASE_KEY` private.
- Never commit API keys to GitHub.
- Keep the 5-email demo dataset for quick testing.
- Use the participant bundle for full hackathon testing.
- Do not deploy the organizer scoring package or ground-truth files.
- Scanned/image-only PDFs currently require additional OCR or vision support.
