import os
from dotenv import load_dotenv

load_dotenv()

DB_CANDIDATES = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "jobs.db")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "jobs.db")),
]

DB_PATH = next((p for p in DB_CANDIDATES if os.path.exists(p)), DB_CANDIDATES[0])
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
MODEL_LOCAL_PATH = os.getenv(
    "MODEL_LOCAL_PATH",
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "assets", "models", "cv_jd_matcher")
    ),
)
MODEL_FALLBACK_NAME = os.getenv("MODEL_FALLBACK_NAME", "all-MiniLM-L6-v2")
COVERAGE_THRESHOLD_DEFAULT = float(os.getenv("COVERAGE_THRESHOLD_DEFAULT", "0.6"))
JWT_SECRET = os.getenv("JWT_SECRET", "")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
JD_UPLOAD_DIR = os.getenv(
    "JD_UPLOAD_DIR",
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "jd")
    ),
)
CV_UPLOAD_DIR = os.getenv(
    "CV_UPLOAD_DIR",
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "cv")
    ),
)
GEMINI_MODEL_INTERVIEW = os.getenv("GEMINI_MODEL_INTERVIEW", "gemini-2.5-flash")
