from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.core.db import get_connection
from app.services import gemini_service, profile_templates

PROFILE_SCHEMA_VERSION = "1.0.0"


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
) -> int:
    conn = get_connection()
    cur = conn.cursor()
    now = _now()
    cur.execute(
        """
        INSERT INTO profile_drafts
        (user_id, field, position, style, language, template_id, schema_version, template_version, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            json.dumps(data),
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


def update_draft(draft_id: int, user_id: int, data: Dict[str, Any], template_id: Optional[str] = None):
    draft = get_draft(draft_id, user_id)
    if not draft:
        return None
    new_template = template_id or draft["template_id"]
    template_version = draft["template_version"]
    if new_template != draft["template_id"]:
        template_version = profile_templates.get_template_version(new_template)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE profile_drafts
        SET template_id=?, template_version=?, data_json=?, updated_at=?
        WHERE id=? AND user_id=?
        """,
        (
            new_template,
            template_version,
            json.dumps(data),
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
    return profile_templates.render_template(selected_template, data)
