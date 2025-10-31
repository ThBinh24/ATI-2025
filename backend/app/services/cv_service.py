import io
from typing import Optional

try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None

try:
    import docx  # python-docx
except Exception:
    docx = None

def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    if not pdfplumber:
        return ""
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(pages)
    except Exception:
        return ""

def extract_text_from_docx_bytes(file_bytes: bytes) -> str:
    if not docx:
        return ""
    try:
        bio = io.BytesIO(file_bytes)
        d = docx.Document(bio)
        return "\n".join([p.text for p in d.paragraphs])
    except Exception:
        return ""

def extract_text_generic_from_bytes(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return extract_text_from_pdf_bytes(data)
    if name.endswith(".docx"):
        return extract_text_from_docx_bytes(data)
    try:
        return data.decode("utf-8", errors="ignore")
    except Exception:
        return ""


