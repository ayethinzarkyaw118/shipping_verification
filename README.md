# Shipping Document Verification

Backend API for the Averis x Monash SDOC hackathon use case.

The system classifies shipping-related emails, reads Shipping Instruction (SI) and draft Bill of Lading (BL) attachments, extracts important shipment fields, compares SI vs BL values, and sends uncertain cases to a human-review queue.

## Submission Documentation

### 1. Technical Architecture

The project is deployed as one combined web application:

```text
User
  |
  v
React + Vite Frontend
  |
  | same-origin API requests
  v
FastAPI Backend
  |
  +--> Email Classifier
  |      +--> deterministic rules for obvious BL comparison / invoice cases
  |      `--> Groq LLM for remaining classification
  |
  +--> SI / BL Attachment Finder
  |
  +--> Document Reader
  |      TXT / PDF / DOCX / XLSX
  |
  +--> Groq Field Extraction
  |
  +--> Python Normalization
  |
  +--> Python SI-vs-BL Comparison
  |
  +--> Validation
  |      OK / MISMATCH / NEEDS_REVIEW
  |
  +--> Supabase
         email_results + review_queue

Deployment: Vercel
```

The frontend and backend live in the same GitHub repository. The React/Vite frontend uses relative routes such as `/emails`, `/results/{email_id}`, and `/review-queue`, while Vercel routes those API paths to the FastAPI application.

### 2. Implementation Details

The implementation is designed so AI is used where interpretation is useful, while deterministic Python logic handles decisions that should be repeatable.

- **Email classification:** each message is classified as `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL`, or `SPAM`. Clear BL-comparison and invoice-query patterns are detected before the LLM to reduce avoidable misclassification.
- **Attachment identification:** SI and BL files are first identified by filename keywords. When filenames are ambiguous, a short document snippet can be sent to the LLM to identify which file is the SI and which is the BL.
- **Document reading:** the backend supports TXT, PDF, DOCX, and XLSX attachments and converts them into text before extraction.
- **Field extraction:** Groq extracts seven canonical shipment fields: shipper, consignee, notify party, port of loading, port of discharge, container count, and gross weight.
- **Normalization:** Python converts values into comparable forms, for example extracting a numeric container count and standardizing gross weight.
- **Comparison:** normalized SI and BL values are compared field by field. Differences are returned as structured mismatch records.
- **Validation and human review:** uncertain cases are routed to `NEEDS_REVIEW` with one of the supported reasons: `wrong_doc_type`, `missing_attachment`, `unreadable`, or `missing_value`.
- **Persistence:** processed results and unresolved review cases are stored in Supabase when configured.
- **Frontend workflow:** inbox emails are shown individually. The operator checks one email at a time, and a BL-comparison result opens the existing verification view for side-by-side SI/BL review.
- **Submission generation:** `build_submission.py` creates the required submission JSON and validates the email IDs and output schema against `sample_submission.json` before writing the final file.

### 3. Challenges Faced

Several integration issues had to be solved during development:

- **LLM fallback behavior:** an early classifier failure could incorrectly turn a valid SI/BL comparison request into `GENERAL`. Deterministic rules and clearer error logging were added so obvious comparison requests are handled reliably.
- **Supabase authentication and Row Level Security:** the first backend configuration used the wrong key type and caused write failures. The server-side integration was updated to support Supabase secret keys while keeping credentials out of the frontend.
- **Frontend/backend integration:** the original frontend was created separately from the FastAPI service. The final project combines both in one repository and one Vercel deployment without redesigning the existing interface.
- **Document variability:** shipping documents use different labels and value formats for the same fields. A normalization layer was added so values such as container counts and weights can be compared consistently.
- **Safe uncertainty handling:** the system must avoid guessing when attachments are missing, unreadable, the wrong type, or contain missing values. These situations are explicitly routed to human review instead of being forced into an OK/MISMATCH decision.

### 4. Future Roadmap

Planned improvements include:

- Add OCR/vision support for scanned or image-only shipping documents.
- Add retry/backoff and stronger observability for LLM and external-service failures.
- Persist operator corrections from the human-review screen, not only review resolution status.
- Add authentication and role-based access for operators and administrators.
- Add background/batch processing for large inboxes while keeping the one-email-at-a-time review workflow in the UI.
- Add richer dashboards for classification accuracy, mismatch trends, review volume, and processing latency.
- Expand normalization for additional shipping-document label variants, units, and carrier-specific formats.
- Add automated regression tests using representative SI/BL cases before every deployment.

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
shipping_verification/
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
|-- frontend/                    # Original React/Vite ShipCheck frontend
|   |-- src/
|   |-- public/
|   |-- package.json
|   `-- vite.config.js
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
git clone https://github.com/ayethinzarkyaw118/shipping_verification.git
cd shipping_verification
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

## Frontend

The original React/Vite frontend is included in `frontend/` and is deployed together with the FastAPI backend.

The frontend keeps the existing ShipCheck design and uses same-origin API routes:

```javascript
fetch("/health")
fetch("/emails")
fetch("/results/email_001")
fetch("/review-queue")
```

Emails are checked individually through `/results/{email_id}`; the frontend does not automatically process the whole inbox.

## Important Notes

- Keep `GROQ_API_KEY` and `SUPABASE_KEY` private.
- Never commit API keys to GitHub.
- Keep the 5-email demo dataset for quick testing.
- Use the participant bundle for full hackathon testing.
- Do not deploy the organizer scoring package or ground-truth files.
- Scanned/image-only PDFs currently require additional OCR or vision support.
