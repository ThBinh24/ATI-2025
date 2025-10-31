import re
from pathlib import Path
from typing import List

_SKILLS_LIST: List[str] = []
ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

def _find_skills_csv() -> Path | None:
    candidates = [
        ASSETS_DIR / "skills.csv",
        Path(__file__).resolve().parent.parent.parent / "skills.csv",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None

def _load_skills():
    global _SKILLS_LIST
    path = _find_skills_csv()
    skills: List[str] = []
    if path:
        try:
            with path.open(encoding="utf-8") as f:
                for ln in f:
                    s = ln.strip()
                    if s:
                        skills.append(s)
        except Exception:
            skills = []
    # unique, preserve longer first
    seen = set()
    out = []
    for s in skills:
        k = s.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(s)
    _SKILLS_LIST = sorted(out, key=lambda x: -len(x))

if not _SKILLS_LIST:
    _load_skills()

_NOISE = {
    "position", "location", "company", "address", "cv", "resume",
    "hanoi", "vietnam"
}

def extract_skills(text: str, top_n: int = 20) -> List[str]:
    """Rút gọn: trích 'kỹ năng' bằng regex đơn giản và lọc nhiễu.
    Backend skeleton dùng stub này để server khởi động được.
    """
    if not text:
        return []
    txt = re.sub(r"\s+", " ", text.replace("\n", " ").replace("\r", " ")).strip()
    # Loại email/sđt/ngày tháng cơ bản
    txt = re.sub(r"[\w\.-]+@[\w\.-]+\.[a-zA-Z]{2,}", " ", txt)
    txt = re.sub(r"\+?\d[\d\s\-]{8,}", " ", txt)
    tokens = re.findall(r"[A-Za-z+#]+(?:\s+[A-Za-z+#]+){0,2}", txt)
    out: List[str] = []
    seen = set()
    for t in tokens:
        t0 = re.sub(r"[^a-z0-9\s\+#/\.-]", " ", t.lower()).strip()
        if not t0 or len(t0) <= 2:
            continue
        if any(w in t0 for w in _NOISE):
            continue
        # prioritize dictionary skills exact match if available
        if _SKILLS_LIST:
            low = t0.strip()
            # try full phrase exact
            if any(low == s.lower() for s in _SKILLS_LIST):
                key = next(s for s in _SKILLS_LIST if s.lower() == low)
            else:
                key = t0.title() if " " in t0 else (t0.upper() if t0.isalpha() and len(t0) <= 5 else t0.title())
        else:
            key = t0.title() if " " in t0 else (t0.upper() if t0.isalpha() and len(t0) <= 5 else t0.title())
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
        if len(out) >= top_n:
            break
    return out

