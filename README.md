# Shipping Document Verification — Backend

Classifies inbox emails, extracts shipment fields from SI/BL attachments (txt, PDF, DOCX,
XLSX), compares them, and routes anything uncertain to human review — matching the SDOC
hackathon's exact scoring schema.

**Stack:** FastAPI + Groq (LLM inference) + Supabase (persistence) + Vercel (deployment)

## Architecture
inbox (JSON records)
    │
    ▼
 loader                (app/loader.py)
    │
    ▼
 classifier             AI    (app/classifier.py)
    │                                     -> BL_COMPARISON / SI_REQUEST / INVOICE_QUERY / GENERAL / SPAM
    ▼
 attachment finder      AI, if needed   (app/attachment_finder.py)
    │
    ▼
 document reading      (txt/pdf/docx/xlsx -> text)  (app/document_reader.py)
    │
    ▼
 document extraction    AI    (app/extractor.py)
    │
    ▼
 normalization         (Python logic)    (app/normalizer.py)
    │
    ▼
 comparison            (Python logic)    (app/comparator.py)
    │
    ▼
 validation            (Python logic)    (app/validator.py)
    │
  ┌─┴──────────┐
  ▼            ▼
CONFIDENT   UNCERTAIN
  │            │
  ▼            ▼
OK/MISMATCH  NEEDS_REVIEW (wrong_doc_type / missing_attachment / unreadable / missing_value)
```

This was tested against the participant bundle (520 emails) — `email_004`'s
consignee/notify_party mismatch was reproduced exactly against the organizers'
`ground_truth.json`, and all four attachment formats (txt/pdf/docx/xlsx) read correctly.
The deliberately broken test cases (a corrupted PDF, a commercial invoice mislabeled as a
BL, a literal "N/A" weight value) are all caught by the `unreadable` / `wrong_doc_type` /
`missing_value` paths respectively.

## Project structure

```
api/index.py          Vercel entry point
build_submission.py   run the pipeline over a dataset and produce/score submission.json
demo_data/            5 real emails (one per category) bundled for the live public demo
app/
  main.py               FastAPI app
  pipeline.py           orchestrates every stage above
  loader.py             Inbox class (matches the hackathon's own loader.py interface)
  classifier.py         AI email classification
  attachment_finder.py  finds SI/BL files; AI fallback if filenames are ambiguous
  document_reader.py    converts txt/pdf/docx/xlsx into plain text
  extractor.py           AI extraction of raw field values
  normalizer.py          deterministic parsing/cleanup ("3 x 40ft" -> 3)
  comparator.py          deterministic field-by-field comparison
  validator.py           OK/MISMATCH/NEEDS_REVIEW decision + review_reason
  supabase_client.py     persists results + review queue
  models.py              Pydantic models, incl. the exact submission schema
  config.py              env vars, categories, status/review_reason constants
supabase_schema.sql
vercel.json
Dockerfile
requirements.txt
```

## Setup

```bash
pip install -r requirements.txt
export GROQ_API_KEY=your_groq_key
export SUPABASE_URL=https://your-project.supabase.co   # optional
export SUPABASE_KEY=your_service_role_key                # optional
uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs`. Works out of the box against the bundled `demo_data/`
(5 real emails). Missing keys doesn't crash anything — results just come back
`needs_review: true` with a clear reason instead.

## Using the FULL real dataset (for actual scoring)

1. Put the participant bundle at `data/sdoc-hackathon-bundle.zip`. The app can read
   the ZIP directly; extraction is not required. When this file exists and
   `INBOX_SOURCE` is not explicitly set, the deployed API automatically uses all
   520 emails. The 5-email `demo_data/` folder is still kept for quick testing.
2. Run:
   ```bash
   export INBOX_SOURCE=./data/sdoc-hackathon-bundle.zip
   export GROQ_API_KEY=your_groq_key
   python build_submission.py ./data/sdoc-hackathon-bundle.zip --out submission.json
   ```
3. To score it against their Docker server (`docker compose up --build` in their
   provided docker package, then):
   ```bash
   python build_submission.py ./data --submit http://localhost:8080
   ```
   This prints the scoreboard directly.

## API endpoints

| Method | Path                          | What it does                                               |
|--------|-------------------------------|-------------------------------------------------------------|
| GET    | `/health`                     | Liveness check + whether Supabase is configured             |
| GET    | `/emails`                     | Raw inbox records (from `INBOX_SOURCE`, demo_data by default)|
| GET    | `/results`                    | Runs the pipeline over every email, persists each to Supabase|
| GET    | `/results/{email_id}`         | Runs the pipeline for one email                              |
| GET    | `/submission`                 | The exact `{email_id: {...}}` shape for self-evaluation      |
| GET    | `/review-queue`                | Unresolved escalated cases (from Supabase)                    |
| POST   | `/review-queue/{id}/resolve`  | Marks an escalated case as resolved                          |

## Not yet implemented (advanced stage, from the use-case brief)

- OCR / vision-model reading of scanned (image-only) PDFs — text-based PDFs already work
- A UI for the review queue (currently just a JSON endpoint)
