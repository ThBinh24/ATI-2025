from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.db import get_connection


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _row_to_dict(row) -> Dict[str, Any]:
    return dict(row) if row else {}


def create_user(data: Dict[str, Any]) -> int:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO users (name, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        ( 
            data.get("name", ""),
            data.get("email", "").lower(),
            data.get("password_hash", ""),
            data.get("role", "student"),
            data.get("created_at", _utc_now_iso()),
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    if not email:
        return None
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE lower(email) = ?", (email.lower(),))
    row = cur.fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE id = ?", (int(user_id),))
    row = cur.fetchone()
    return dict(row) if row else None


def list_users() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, email, role, created_at, is_banned, banned_reason, banned_at FROM users ORDER BY id DESC",
    )
    return [dict(r) for r in cur.fetchall()]


def ban_user(user_id: int, reason: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE users
        SET is_banned = 1,
            banned_reason = ?,
            banned_at = ?
        WHERE id = ?
        """,
        (reason, _utc_now_iso(), int(user_id)),
    )
    conn.commit()
    return cur.rowcount > 0


def list_banned_users() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, name, email, role, banned_reason, banned_at
        FROM users
        WHERE is_banned = 1
        ORDER BY banned_at DESC
        """
    )
    return [dict(r) for r in cur.fetchall()]
