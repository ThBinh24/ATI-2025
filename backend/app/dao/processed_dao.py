from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.core.db import get_connection


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def list_by_job(job_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM processed WHERE job_id = ? ORDER BY id DESC", (int(job_id),)
    )
    return [dict(r) for r in cur.fetchall()]


def get_by_id(applicant_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM processed WHERE id = ?", (int(applicant_id),))
    row = cur.fetchone()
    return dict(row) if row else None


def insert_processed(data: Dict[str, Any]) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO processed
        (name,email,uploaded_filename,job_id,jd_summary,coverage,similarity,missing,passed,hr_email,sent_email,
         predicted_role,company_name,job_title,hr_name,interview_mode,schedule_link,created_at,
         invite_sent_at,invite_subject,invite_message,cv_text,uploaded_file_path)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?, datetime('now')),?,?,?,?,?)
        """,
        (
            data.get("name", ""),
            data.get("email", ""),
            data.get("uploaded_filename", ""),
            int(data.get("job_id")) if data.get("job_id") is not None else None,
            data.get("jd_summary", ""),
            float(data.get("coverage", 0.0)),
            float(data.get("similarity", 0.0)),
            data.get("missing", ""),
            int(data.get("passed", 0)),
            data.get("hr_email", ""),
            int(data.get("sent_email", 0)),
            data.get("predicted_role", ""),
            data.get("company_name", ""),
            data.get("job_title", ""),
            data.get("hr_name", ""),
            data.get("interview_mode", ""),
            data.get("schedule_link", ""),
            data.get("created_at"),
            data.get("invite_sent_at"),
            data.get("invite_subject", ""),
            data.get("invite_message", ""),
            data.get("cv_text", ""),
            data.get("uploaded_file_path", ""),
        ),
    )
    conn.commit()
    return cur.lastrowid


def mark_invite_sent(
    applicant_id: int,
    subject: str,
    message: str,
    sent: bool = True,
    invite_sent_at: Optional[str] = None,
) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    timestamp = invite_sent_at or _utc_now_iso()
    cur.execute(
        """
        UPDATE processed
        SET sent_email = ?, invite_sent_at = ?, invite_subject = ?, invite_message = ?
        WHERE id = ?
        """,
        (1 if sent else 0, timestamp, subject, message, int(applicant_id)),
    )
    conn.commit()
    return cur.rowcount > 0


def list_by_email(email: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT processed.*, jobs.title AS job_title_full, jobs.company_name AS job_company,
               jobs.hr_email AS job_hr_email, jobs.coverage_threshold AS job_threshold,
               jobs.jd_text AS job_jd_text, jobs.jd_file_name AS job_jd_file_name,
               jobs.jd_file_path AS job_jd_file_path, jobs.created_at AS job_created_at,
               jobs.status AS job_status, jobs.published AS job_published
        FROM processed
        LEFT JOIN jobs ON jobs.id = processed.job_id
        WHERE processed.email = ?
        ORDER BY processed.created_at DESC
        """,
        (email,),
    )
    return [dict(r) for r in cur.fetchall()]


def get_application_for_user(applicant_id: int, email: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT processed.*, jobs.title AS job_title_full, jobs.company_name AS job_company,
               jobs.hr_email AS job_hr_email, jobs.coverage_threshold AS job_threshold,
               jobs.jd_text AS job_jd_text, jobs.jd_file_name AS job_jd_file_name,
               jobs.jd_file_path AS job_jd_file_path, jobs.created_at AS job_created_at,
               jobs.status AS job_status, jobs.published AS job_published
        FROM processed
        LEFT JOIN jobs ON jobs.id = processed.job_id
        WHERE processed.id = ? AND processed.email = ?
        """,
        (int(applicant_id), email),
    )
    row = cur.fetchone()
    return dict(row) if row else None
