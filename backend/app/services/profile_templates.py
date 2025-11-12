from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import CV_TEMPLATE_DIR

TEMPLATE_DIR = Path(CV_TEMPLATE_DIR)
MANIFEST_PATH = TEMPLATE_DIR / "manifest.json"


class TemplateNotFound(Exception):
    pass


@lru_cache()
def _load_manifest() -> List[Dict[str, Any]]:
    if not MANIFEST_PATH.exists():
        return []
    with MANIFEST_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache()
def _jinja_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def list_templates() -> List[Dict[str, Any]]:
    templates: List[Dict[str, Any]] = []
    for entry in _load_manifest():
        templates.append(
            {
                "id": entry["id"],
                "name": entry.get("name", entry["id"]),
                "version": entry.get("version", "1.0.0"),
                "style": entry.get("style", "custom"),
                "description": entry.get("description", ""),
                "contract": entry.get("contract", {}),
            }
        )
    return templates


def _resolve_template(template_id: str) -> Tuple[str, List[str], str]:
    manifest = _load_manifest()
    target = next((item for item in manifest if item["id"] == template_id), None)
    if not target:
        raise TemplateNotFound(template_id)
    html_path = target["html"]
    css_paths = target.get("css", [])
    css_texts: List[str] = []
    for rel in css_paths:
        css_file = TEMPLATE_DIR / rel
        if css_file.exists():
            css_texts.append(css_file.read_text(encoding="utf-8"))
    return html_path, css_texts, target.get("version", "1.0.0")


def render_template(template_id: str, payload: Dict[str, Any]) -> Dict[str, str]:
    html_rel, css_texts, version = _resolve_template(template_id)
    env = _jinja_env()
    template = env.get_template(html_rel)
    html = template.render(**payload)
    css = "\n".join(css_texts)
    return {"html": html, "css": css, "template_version": version}


def get_template_version(template_id: str) -> str:
    _, _, version = _resolve_template(template_id)
    return version
