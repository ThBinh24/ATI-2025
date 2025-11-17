from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.db import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_cached_match(user_id: int, job_id: int, cv_hash: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT score, coverage, similarity, analysis_json, created_at
        FROM profile_match_history
        WHERE user_id=? AND job_id=? AND cv_hash=?
        ORDER BY datetime(created_at) DESC
        LIMIT 1
        """,
        (user_id, job_id, cv_hash),
    )
    row = cur.fetchone()
    if not row:
        return None
    analysis = json.loads(row["analysis_json"] or "{}")
    analysis["score"] = row["score"]
    analysis["coverage"] = row["coverage"]
    analysis["similarity"] = row["similarity"]
    analysis["matched_at"] = row["created_at"]
    return analysis


def save_match(
    user_id: int,
    job_id: int,
    cv_hash: str,
    score: float,
    coverage: float,
    similarity: float,
    analysis: Dict[str, Any],
    cv_source: str = "",
    cv_label: str = "",
) -> None:
    conn = get_connection()
    cur = conn.cursor()
    payload = json.dumps(analysis)
    cur.execute(
        """
        INSERT INTO profile_match_history
        (user_id, job_id, cv_hash, score, coverage, similarity, analysis_json, created_at, cv_source, cv_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            job_id,
            cv_hash,
            float(score),
            float(coverage),
            float(similarity),
            payload,
            _now(),
            cv_source or "",
            cv_label or "",
        ),
    )
    conn.commit()


def list_history(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT h.job_id, h.score, h.coverage, h.similarity, h.analysis_json, h.created_at,
               h.cv_source, h.cv_label,
               j.title, j.company_name, j.jd_text, j.status, j.published
        FROM profile_match_history h
        JOIN jobs j ON j.id = h.job_id
        WHERE h.user_id=?
        ORDER BY datetime(h.created_at) DESC
        LIMIT ?
        """,
        (user_id, limit),
    )
    rows = cur.fetchall()
    history: List[Dict[str, Any]] = []
    for row in rows:
        row_dict = dict(row)
        analysis = json.loads(row_dict.get("analysis_json") or "{}")
        analysis["score"] = row_dict["score"]
        analysis["coverage"] = row_dict["coverage"]
        analysis["similarity"] = row_dict["similarity"]
        history.append(
            {
                "job": {
                    "id": row_dict["job_id"],
                    "title": row_dict["title"],
                    "company_name": row_dict["company_name"],
                    "jd_text": row_dict["jd_text"],
                    "status": row_dict["status"],
                    "published": row_dict["published"],
                },
                "match": analysis,
                "matched_at": row_dict["created_at"],
                "cv_source": row_dict.get("cv_source") or "",
                "cv_label": row_dict.get("cv_label") or "",
            }
        )
    return history


def clear_history(user_id: int) -> None:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM profile_match_history WHERE user_id=?", (user_id,))
    conn.commit()
