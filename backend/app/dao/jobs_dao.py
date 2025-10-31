from typing import List, Optional, Dict, Any
from app.core.db import get_connection
from datetime import datetime, timezone


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def create_job(data: Dict[str, Any], employer_id: Optional[int]) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO jobs (
            title,
            company_name,
            jd_text,
            hr_email,
            created_at,
            status,
            published,
            coverage_threshold,
            employer_id,
            jd_file_path,
            jd_file_name
        )
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
        """,
        (
            data.get("title", ""),
            data.get("company_name", ""),
            data.get("jd_text", ""),
            data.get("hr_email", ""),
            _utc_now_iso(),
            float(data.get("coverage_threshold", 0.6)),
            employer_id,
            data.get("jd_file_path"),
            data.get("jd_file_name", ""),
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_job_by_id(job_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM jobs WHERE id = ?", (int(job_id),))
    row = cur.fetchone()
    return dict(row) if row else None


def get_pending_jobs() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM jobs WHERE status = 'pending' ORDER BY id DESC")
    return [dict(r) for r in cur.fetchall()]


def update_job_status(
    job_id: int, status: str, rejection_reason: Optional[str], admin_id: Optional[int]
) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    published = 1 if status == "approved" else 0
    reviewed_at = _utc_now_iso()
    cur.execute(
        """
        UPDATE jobs
        SET status = ?, published = ?, admin_approved_by = ?, rejection_reason = ?, reviewed_at = ?
        WHERE id = ?
        """,
        (status, published, admin_id, rejection_reason, reviewed_at, int(job_id)),
    )
    conn.commit()
    return cur.rowcount > 0


def update_job(job_id: int, updates: Dict[str, Any]) -> bool:
    if not updates:
        return False
    conn = get_connection()
    cur = conn.cursor()
    fields = []
    params: List[Any] = []
    for key, value in updates.items():
        fields.append(f"{key} = ?")
        params.append(value)
    params.append(int(job_id))
    cur.execute(
        f"UPDATE jobs SET {', '.join(fields)} WHERE id = ?",
        params,
    )
    conn.commit()
    return cur.rowcount > 0


def delete_job(job_id: int) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM jobs WHERE id = ?", (int(job_id),))
    conn.commit()
    return cur.rowcount > 0


def list_jobs(published_only: bool = False, employer_id: Optional[int] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    query = "SELECT * FROM jobs"
    clauses = []
    params = []
    if published_only:
        clauses.append("published = 1")
    if employer_id is not None:
        clauses.append("employer_id = ?"); params.append(int(employer_id))
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY id DESC"
    cur.execute(query, params)
    return [dict(r) for r in cur.fetchall()]


def list_review_history(limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT jobs.*, admins.name AS admin_name, admins.email AS admin_email
        FROM jobs
        LEFT JOIN users AS admins ON admins.id = jobs.admin_approved_by
        WHERE jobs.status IN ('approved', 'rejected')
        ORDER BY COALESCE(jobs.reviewed_at, jobs.created_at) DESC
        LIMIT ?
        """,
        (limit,),
    )
    return [dict(r) for r in cur.fetchall()]
