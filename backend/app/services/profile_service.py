from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.db import get_connection
from app.services import gemini_service, profile_templates
from app.services.cv_service import extract_text_generic_from_bytes

PROFILE_SCHEMA_VERSION = "2.0.0"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fallback(field: str, position: str) -> Dict[str, Any]:
    title = position or "Candidate"
    return {
        "name": title or "Candidate Name",
        "headline": f"{title} | {field.title()}",
        "contact_block": "Email • Phone • Location",
        "summary": f"Motivated {field} professional seeking {position} opportunities with a collaborative mindset and ownership attitude.",
        "experiences": [
            {
                "title": f"{title} Specialist",
                "company": "Company Name",
                "period": "2021 - Present",
                "achievements": [
                    "Drove measurable KPIs by combining data insight with stakeholder partnership.",
                    "Shipped customer-facing releases while mentoring teammates and improving rituals.",
                    "Improved efficiency by refining workflows and documenting reusable playbooks.",
                ],
            }
        ],
        "projects": [
            {
                "name": "Flagship Initiative",
                "description": "Led cross-functional effort delivering a feature used by thousands of users.",
            }
        ],
        "skills": [
            "Communication",
            "Leadership",
            "Problem Solving",
            "Agile Delivery",
            "Stakeholder Engagement",
            "Continuous Improvement",
        ],
        "education": [
            {
                "school": "University / Bootcamp",
                "degree": "B.S. or Certification",
                "period": "2017 - 2021",
            }
        ],
        "certifications": [
            {
                "name": "Certification Name",
                "issuer": "Organization",
                "period": "2023",
            }
        ],
    }


def generate_profile_payload(field: str, position: str, style: str, language: str, notes: str) -> Dict[str, Any]:
    data = gemini_service.generate_profile_blueprint(field, position, style, language, notes)
    if not data:
        data = _fallback(field, position)
    return data


def insert_draft(
    *,
    user_id: int,
    field: str,
    position: str,
    style: str,
    language: str,
    template_id: str,
    template_version: str,
    data: Dict[str, Any],
    blocks: List[Dict[str, Any]],
) -> int:
    conn = get_connection()
    cur = conn.cursor()
    now = _now()
    draft_title = data.get("draft_title") or data.get("name") or ""
    cur.execute(
        """
        INSERT INTO profile_drafts
        (user_id, field, position, style, language, template_id, schema_version, template_version, draft_title, data_json, blocks_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            field,
            position,
            style,
            language,
            template_id,
            PROFILE_SCHEMA_VERSION,
            template_version,
            draft_title,
            json.dumps(data),
            json.dumps(blocks),
            now,
            now,
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_draft(draft_id: int, user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM profile_drafts WHERE id=? AND user_id=?",
        (draft_id, user_id),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def list_drafts(user_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, template_id, template_version, draft_title, created_at, updated_at, data_json FROM profile_drafts WHERE user_id=? ORDER BY updated_at DESC",
        (user_id,),
    )
    rows = cur.fetchall()
    return [dict(row) for row in rows]


def delete_draft(draft_id: int, user_id: int) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM profile_drafts WHERE id=? AND user_id=?",
        (draft_id, user_id),
    )
    conn.commit()
    return cur.rowcount > 0


def _load_blocks_for_draft(draft: Dict[str, Any]) -> List[Dict[str, Any]]:
    raw = draft.get("blocks_json") or "[]"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = []
    return profile_templates.merge_blocks_with_contract(parsed, draft["template_id"])


def update_draft(
    draft_id: int,
    user_id: int,
    data: Dict[str, Any],
    blocks: Optional[List[Dict[str, Any]]] = None,
    template_id: Optional[str] = None,
    draft_title: Optional[str] = None,
):
    draft = get_draft(draft_id, user_id)
    if not draft:
        return None
    new_template = template_id or draft["template_id"]
    template_version = draft["template_version"]
    if new_template != draft["template_id"]:
        template_version = profile_templates.get_template_version(new_template)
    existing_blocks = _load_blocks_for_draft(draft)
    next_blocks = profile_templates.merge_blocks_with_contract(blocks or existing_blocks, new_template)
    conn = get_connection()
    cur = conn.cursor()
    previous_data = json.loads(draft.get("data_json") or "{}")
    draft_title_value = (
        draft_title
        or data.get("draft_title")
        or draft.get("draft_title")
        or previous_data.get("name")
        or ""
    )
    cur.execute(
        """
        UPDATE profile_drafts
        SET template_id=?, template_version=?, draft_title=?, data_json=?, blocks_json=?, updated_at=?
        WHERE id=? AND user_id=?
        """,
        (
            new_template,
            template_version,
            draft_title_value,
            json.dumps(data),
            json.dumps(next_blocks),
            _now(),
            draft_id,
            user_id,
        ),
    )
    conn.commit()
    return get_draft(draft_id, user_id)


def render_draft(draft: Dict[str, Any], template_id: Optional[str] = None) -> Dict[str, str]:
    selected_template = template_id or draft["template_id"]
    data = json.loads(draft["data_json"] or "{}")
    blocks = _load_blocks_for_draft({**draft, "template_id": selected_template})
    context = {**data, "blocks": blocks}
    return profile_templates.render_template(selected_template, context)


def set_active_draft(user_id: int, draft_id: int) -> Optional[Dict[str, Any]]:
    draft = get_draft(draft_id, user_id)
    if not draft:
        return None
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET active_profile_draft_id=?, active_uploaded_cv_id=NULL WHERE id=?",
        (draft_id, user_id),
    )
    conn.commit()
    return draft


def clear_active_draft(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET active_profile_draft_id=NULL WHERE id=?",
        (user_id,),
    )
    conn.commit()


def get_active_draft(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT active_profile_draft_id FROM users WHERE id=?",
        (user_id,),
    )
    row = cur.fetchone()
    draft_id = row["active_profile_draft_id"] if row else None
    if not draft_id:
        return None
    return get_draft(int(draft_id), user_id)


def save_uploaded_cv(user_id: int, name: str, mime: str, data_url: str) -> int:
    detected_mime, raw_bytes = _decode_data_url(data_url)
    if not raw_bytes:
        raise ValueError("Invalid CV data.")
    text = extract_text_generic_from_bytes(name or "uploaded_cv", raw_bytes).strip()
    if not text:
        raise ValueError("Unable to extract text from the uploaded CV.")
    conn = get_connection()
    cur = conn.cursor()
    now = _now()
    cur.execute(
        """
        INSERT INTO uploaded_cvs (user_id, name, mime, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            name or "Uploaded CV",
            mime or detected_mime or "",
            json.dumps({"text": text}),
            now,
            now,
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_uploaded_cv(uploaded_id: int, user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM uploaded_cvs WHERE id=? AND user_id=?",
        (uploaded_id, user_id),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def set_active_uploaded_cv(user_id: int, uploaded_id: int) -> Optional[Dict[str, Any]]:
    uploaded = get_uploaded_cv(uploaded_id, user_id)
    if not uploaded:
        return None
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET active_uploaded_cv_id=?, active_profile_draft_id=NULL WHERE id=?",
        (uploaded_id, user_id),
    )
    conn.commit()
    return uploaded


def clear_active_uploaded_cv(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET active_uploaded_cv_id=NULL WHERE id=?",
        (user_id,),
    )
    conn.commit()


def get_active_uploaded_cv(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT active_uploaded_cv_id FROM users WHERE id=?",
        (user_id,),
    )
    row = cur.fetchone()
    uploaded_id = row["active_uploaded_cv_id"] if row else None
    if not uploaded_id:
        return None
    return get_uploaded_cv(int(uploaded_id), user_id)


def uploaded_cv_plaintext(entry: Dict[str, Any]) -> str:
    data = json.loads(entry.get("data_json") or "{}")
    return (data.get("text") or "").strip()


def draft_to_plaintext(draft: Dict[str, Any]) -> str:
    data = json.loads(draft.get("data_json") or "{}")
    parts: List[str] = []
    for key in ("name", "headline", "contact_block", "summary"):
        value = (data.get(key) or "").strip()
        if value:
            parts.append(value)
    for section in data.get("experiences") or []:
        title = section.get("title") or ""
        company = section.get("company") or ""
        period = section.get("period") or ""
        header = " - ".join([part for part in [title, company, period] if part])
        if header:
            parts.append(header)
        for bullet in section.get("achievements") or []:
            bullet = (bullet or "").strip()
            if bullet:
                parts.append(f"* {bullet}")
    for project in data.get("projects") or []:
        line = f"Project: {project.get('name','')} - {project.get('description','')}"
        parts.append(line.strip())
    for edu in data.get("education") or []:
        line = "Education: " + " - ".join(
            [part for part in [edu.get("school"), edu.get("degree"), edu.get("period")] if part]
        )
        parts.append(line.strip())
    for cert in data.get("certifications") or []:
        line = "Certification: " + " - ".join(
            [part for part in [cert.get("name"), cert.get("issuer"), cert.get("period")] if part]
        )
        parts.append(line.strip())
    skills = data.get("skills")
    if isinstance(skills, list):
        normalized = []
        for skill in skills:
            if isinstance(skill, dict):
                normalized.append(skill.get("name") or "")
            else:
                normalized.append(str(skill))
        normalized = [s.strip() for s in normalized if s and s.strip()]
        if normalized:
            parts.append("Skills: " + ", ".join(normalized))
    return "\n".join([p for p in parts if p])


def _decode_data_url(data_url: str) -> tuple[str, bytes]:
    if not data_url:
        return "", b""
    header, sep, b64_data = data_url.partition(",")
    mime = ""
    if header.startswith("data:"):
        parts = header[5:].split(";")
        mime = parts[0] if parts else ""
    if not sep:
        b64_data = header
    try:
        return mime, base64.b64decode(b64_data)
    except Exception:
        raise ValueError("Invalid base64 data.")
