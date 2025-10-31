"""
Utility script to seed an admin account into the local SQLite database.

Usage:
    python scripts/seed_admin.py

Environment:
    - Run from project root so jobs.db is at backend/jobs.db.
    - Adjust USER_NAME, USER_EMAIL, and PASSWORD_HASH as needed.

The password hash was generated using passlib (pbkdf2-sha256). Replace it if you need a different default password.
"""

import datetime
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "backend" / "jobs.db"

USER_NAME = "Thanh Binh"
USER_EMAIL = "thanhbinh@gmail.com"
PASSWORD_HASH = "$pbkdf2-sha256$29000$EGJM6X3P.b9X6l2L8T6H8A$2g/KHQ7F6C/yTw4U1zv16.RWYtXqwJZzDRfAUn8Ii4U"
ROLE = "admin"


def main() -> None:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (
                USER_NAME,
                USER_EMAIL,
                PASSWORD_HASH,
                ROLE,
                datetime.datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()
        print(f"Inserted admin user {USER_EMAIL}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
