from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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


def _get_manifest_entry(template_id: str) -> Optional[Dict[str, Any]]:
    manifest = _load_manifest()
    return next((item for item in manifest if item["id"] == template_id), None)


def get_template_contract(template_id: str) -> Dict[str, Any]:
    entry = _get_manifest_entry(template_id)
    if not entry:
        raise TemplateNotFound(template_id)
    return entry.get("contract", {})


def _resolve_template(template_id: str) -> Tuple[str, List[str], str, Dict[str, Any], Dict[str, Any]]:
    target = _get_manifest_entry(template_id)
    if not target:
        raise TemplateNotFound(template_id)
    html_path = target["html"]
    css_paths = target.get("css", [])
    contract = target.get("contract", {})
    css_texts: List[str] = []
    for rel in css_paths:
        css_file = TEMPLATE_DIR / rel
        if css_file.exists():
            css_texts.append(css_file.read_text(encoding="utf-8"))
    pdf_settings = target.get("pdf", {})
    return html_path, css_texts, target.get("version", "1.0.0"), contract, pdf_settings


def _default_block_entry(block: Dict[str, Any], order: int) -> Dict[str, Any]:
    entry = {
        "id": block["id"],
        "label": block.get("label", block["id"].title()),
        "type": block.get("type", "single"),
        "placement": block.get("placement", "main"),
        "enabled": not block.get("optional", False),
        "order": order,
        "config": block,
    }
    return entry


def build_default_blocks(template_id: str) -> List[Dict[str, Any]]:
    contract = get_template_contract(template_id)
    blocks: List[Dict[str, Any]] = contract.get("blocks", [])
    default_order = contract.get("default_order") or [block["id"] for block in blocks]
    order_map = {block_id: idx for idx, block_id in enumerate(default_order)}
    ordered_blocks: List[Tuple[int, Dict[str, Any]]] = []
    for idx, block in enumerate(blocks):
        weight = order_map.get(block["id"], len(order_map) + idx)
        ordered_blocks.append((weight, block))
    ordered_blocks.sort(key=lambda item: item[0])
    normalized: List[Dict[str, Any]] = []
    for idx, (_, block) in enumerate(ordered_blocks):
        normalized.append(_default_block_entry(block, idx))
    return normalized


def merge_blocks_with_contract(
    blocks: Optional[List[Dict[str, Any]]],
    template_id: str,
) -> List[Dict[str, Any]]:
    current = blocks or []
    defaults = build_default_blocks(template_id)
    default_lookup = {block["id"]: block for block in defaults}
    result: List[Dict[str, Any]] = []
    seen = set()
    for entry in current:
        block_id = entry.get("id")
        if not block_id or block_id not in default_lookup or block_id in seen:
            continue
        merged = {**default_lookup[block_id]}
        merged.update(
            {
                key: value
                for key, value in entry.items()
                if key not in {"config", "order"} and value is not None
            }
        )
        merged["config"] = default_lookup[block_id]["config"]
        result.append(merged)
        seen.add(block_id)
    for block in defaults:
        if block["id"] not in seen:
            result.append(block)
    for idx, block in enumerate(result):
        block["order"] = idx
    return result


def render_template(template_id: str, payload: Dict[str, Any]) -> Dict[str, str]:
    html_rel, css_texts, version, _contract, pdf_settings = _resolve_template(template_id)
    env = _jinja_env()
    template = env.get_template(html_rel)
    html = template.render(**payload)
    css = "\n".join(css_texts)
    return {"html": html, "css": css, "template_version": version, "pdf": pdf_settings}


def get_template_version(template_id: str) -> str:
    _, _, version, _, _ = _resolve_template(template_id)
    return version
