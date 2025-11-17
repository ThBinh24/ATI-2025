import sqlite3
from typing import Iterator
from app.core.config import DB_PATH

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def migrate(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT,
        created_at TEXT,
        is_banned INTEGER DEFAULT 0,
        banned_reason TEXT DEFAULT '',
        banned_at TEXT
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        company_name TEXT DEFAULT '',
        jd_text TEXT DEFAULT '',
        hr_email TEXT DEFAULT '',
        created_at TEXT,
        status TEXT DEFAULT 'pending',
        admin_approved_by INTEGER,
        published INTEGER DEFAULT 0,
        coverage_threshold REAL DEFAULT 0.6,
        employer_id INTEGER,
        rejection_reason TEXT DEFAULT '',
        reviewed_at TEXT,
        jd_file_path TEXT,
        jd_file_name TEXT DEFAULT ''
    )""")
    try:
        cur.execute("ALTER TABLE jobs ADD COLUMN rejection_reason TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE jobs ADD COLUMN reviewed_at TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE jobs ADD COLUMN jd_file_path TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE jobs ADD COLUMN jd_file_name TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN banned_reason TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN banned_at TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN active_profile_draft_id INTEGER")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN active_uploaded_cv_id INTEGER")
    except sqlite3.OperationalError:
        pass
    cur.execute("""
    CREATE TABLE IF NOT EXISTS profile_match_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        job_id INTEGER NOT NULL,
        cv_hash TEXT NOT NULL,
        score REAL,
        coverage REAL,
        similarity REAL,
        analysis_json TEXT,
        created_at TEXT,
        cv_source TEXT DEFAULT '',
        cv_label TEXT DEFAULT ''
    )""")
    try:
        cur.execute("ALTER TABLE profile_match_history ADD COLUMN cv_source TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE profile_match_history ADD COLUMN cv_label TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    cur.execute("CREATE INDEX IF NOT EXISTS idx_match_history_user ON profile_match_history(user_id)")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS processed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        uploaded_filename TEXT,
        job_id INTEGER,
        jd_summary TEXT,
        coverage REAL,
        similarity REAL,
        missing TEXT,
        passed INTEGER,
        hr_email TEXT,
        sent_email INTEGER DEFAULT 0,
        predicted_role TEXT,
        company_name TEXT,
        job_title TEXT,
        hr_name TEXT,
        interview_mode TEXT,
        schedule_link TEXT,
        created_at TEXT,
        invite_sent_at TEXT,
        invite_subject TEXT DEFAULT '',
        invite_message TEXT DEFAULT '',
        cv_text TEXT DEFAULT '',
        uploaded_file_path TEXT DEFAULT ''
    )""")
    try:
        cur.execute("ALTER TABLE processed ADD COLUMN invite_sent_at TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE processed ADD COLUMN invite_subject TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE processed ADD COLUMN invite_message TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE processed ADD COLUMN cv_text TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE processed ADD COLUMN uploaded_file_path TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    cur.execute("""
    CREATE TABLE IF NOT EXISTS profile_drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        field TEXT DEFAULT '',
        position TEXT DEFAULT '',
        style TEXT DEFAULT '',
        language TEXT DEFAULT '',
        template_id TEXT DEFAULT '',
        schema_version TEXT DEFAULT '',
        template_version TEXT DEFAULT '',
        data_json TEXT,
        blocks_json TEXT,
        created_at TEXT,
        updated_at TEXT
    )""")
    try:
        cur.execute("ALTER TABLE profile_drafts ADD COLUMN language TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE profile_drafts ADD COLUMN blocks_json TEXT")
    except sqlite3.OperationalError:
        pass
    try:
        cur.execute("ALTER TABLE profile_drafts ADD COLUMN draft_title TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS uploaded_cvs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT DEFAULT '',
        mime TEXT DEFAULT '',
        data_json TEXT,
        created_at TEXT,
        updated_at TEXT
    )""")
    conn.commit()
