import json
from pathlib import Path
from typing import Dict, List

_JOB_TITLE_MAP: Dict[str, List[str]] = {}
ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

def _find_job_titles_json() -> Path | None:
    candidates = [
        ASSETS_DIR / "job_titles.json",
        Path(__file__).resolve().parent.parent.parent / "job_titles.json",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None

def load_job_title_map() -> Dict[str, List[str]]:
    global _JOB_TITLE_MAP
    if _JOB_TITLE_MAP:
        return _JOB_TITLE_MAP
    path = _find_job_titles_json()
    if not path:
        _JOB_TITLE_MAP = {}
        return _JOB_TITLE_MAP
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        _JOB_TITLE_MAP = {k: [s for s in v if s] for k, v in data.items()}
    except Exception:
        _JOB_TITLE_MAP = {}
    return _JOB_TITLE_MAP



