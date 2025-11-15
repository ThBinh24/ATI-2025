from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from playwright.sync_api import sync_playwright


@dataclass
class PdfOptions:
    format: str = "A4"
    print_background: bool = True
    margin: Dict[str, str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.margin is None:
            self.margin = {
                "top": "15mm",
                "bottom": "15mm",
                "left": "12mm",
                "right": "12mm",
            }


def render_pdf_from_html(
    html: str,
    css: Optional[str] = None,
    options: Optional[PdfOptions] = None,
    page_style: Optional[str] = None,
) -> bytes:
    """Render the provided HTML + CSS into a PDF using headless Chromium."""

    document = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        '<meta charset="utf-8" />',
    ]
    if css:
        document.append("<style>" + css + "</style>")
    base_style = ["body{margin:0;padding:0;}"]
    if page_style:
        base_style.append(page_style)
    document.append("<style>" + "".join(base_style) + "</style>")
    document.append("</head>")
    document.append("<body>")
    document.append(html)
    document.append("</body></html>")
    final_html = "".join(document)

    pdf_opts = options or PdfOptions()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.set_content(final_html, wait_until="networkidle")
        pdf_bytes = page.pdf(
            format=pdf_opts.format,
            print_background=pdf_opts.print_background,
            margin=pdf_opts.margin,
        )
        browser.close()
    return pdf_bytes
