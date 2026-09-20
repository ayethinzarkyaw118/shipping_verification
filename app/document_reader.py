"""
Converts a raw attachment (bytes) into plain text, regardless of its format.
This sits in front of the extraction stage so extractor.py only ever has to
deal with plain text, no matter whether the source was a .txt, .pdf, .docx,
or .xlsx file (the "advanced stage" formats from the use-case brief).

Raises UnreadableDocument on anything it can't parse - the pipeline treats
that as review_reason "unreadable" rather than guessing.
"""
from __future__ import annotations

import io


class UnreadableDocument(Exception):
    pass


def read_as_text(filename: str, raw_bytes: bytes) -> str:
    lower = filename.lower()
    try:
        if lower.endswith(".txt"):
            return raw_bytes.decode("utf-8", errors="replace")
        if lower.endswith(".pdf"):
            return _read_pdf(raw_bytes)
        if lower.endswith(".docx"):
            return _read_docx(raw_bytes)
        if lower.endswith(".xlsx"):
            return _read_xlsx(raw_bytes)
        # Unknown extension - best-effort decode.
        return raw_bytes.decode("utf-8", errors="replace")
    except UnreadableDocument:
        raise
    except Exception as exc:
        raise UnreadableDocument(f"Could not read {filename}: {exc}") from exc


def _read_pdf(raw_bytes: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    text = "\n".join(pages).strip()
    if not text:
        raise UnreadableDocument("PDF produced no extractable text (likely a scanned/image-only page)")
    return text


def _read_docx(raw_bytes: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(raw_bytes))
    parts = [p.text for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text for cell in row.cells))
    text = "\n".join(parts).strip()
    if not text:
        raise UnreadableDocument("DOCX produced no extractable text")
    return text


def _read_xlsx(raw_bytes: bytes) -> str:
    import openpyxl

    workbook = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
    lines = []
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) for c in row if c is not None]
            if cells:
                lines.append(" | ".join(cells))
    text = "\n".join(lines).strip()
    if not text:
        raise UnreadableDocument("XLSX produced no extractable text")
    return text
