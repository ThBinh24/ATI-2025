from typing import Dict

_ROLE_KEYWORDS: Dict[str, str] = {
    "Data Analyst": "pandas sql excel tableau power bi",
    "ML Engineer": "machine learning deep learning pytorch tensorflow",
    "Content Writer (Marketing)": "content seo canva wordpress",
    "Virtual Assistant": "scheduling email sheets support",
}

def predict_cv_category(cv_text: str) -> str:
    """Stub nhanh: đoán vai trò dựa trên keyword đơn giản.
    Có thể thay bằng SBERT hoặc classifier sau.
    """
    if not cv_text:
        return "Unknown"
    low = cv_text.lower()
    best = "Unknown"
    best_hits = 0
    for role, kws in _ROLE_KEYWORDS.items():
        hits = sum(1 for k in kws.split() if k in low)
        if hits > best_hits:
            best_hits = hits
            best = role
    return best


