import re
from typing import Dict, List, Tuple, Optional
import numpy as np
from app.core.config import MODEL_LOCAL_PATH, MODEL_FALLBACK_NAME

_MODEL = None  # SentenceTransformer | None
_EMB_CACHE: Dict[str, np.ndarray] = {}

def _try_load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
    except Exception:
        _MODEL = None
        return None
    # Try local path first
    try:
        _MODEL = SentenceTransformer(MODEL_LOCAL_PATH)
        return _MODEL
    except Exception:
        pass
    # Fallback by name
    try:
        _MODEL = SentenceTransformer(MODEL_FALLBACK_NAME)
    except Exception:
        _MODEL = None
    return _MODEL

def _encode_texts(texts: List[str]) -> Optional[np.ndarray]:
    model = _try_load_model()
    if model is None:
        return None
    # Use simple cache per full string
    results: List[np.ndarray] = []
    to_compute: List[str] = []
    for t in texts:
        key = t.strip() if t else ""
        if key in _EMB_CACHE:
            results.append(_EMB_CACHE[key])
        else:
            to_compute.append(key)
    if to_compute:
        embs = model.encode(to_compute, show_progress_bar=False)
        # ensure np.ndarray list
        if isinstance(embs, np.ndarray):
            seq = [embs[i] for i in range(embs.shape[0])]
        else:
            seq = list(embs)
        for k, e in zip(to_compute, seq):
            arr = np.asarray(e)
            _EMB_CACHE[k] = arr
            results.append(arr)
    return np.stack(results) if results else np.zeros((0, 384), dtype=float)

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)

def coverage_score(cv_skills: List[str], req_skills: List[str], threshold: float = 0.6) -> Tuple[float, List[str], List[str]]:
    """Nếu có SBERT: match theo cosine > threshold, ngược lại: giao chuỗi."""
    if not req_skills:
        return 1.0, [], []
    # Try embedding path
    cv_embs = _encode_texts(cv_skills)
    req_embs = _encode_texts(req_skills)
    if cv_embs is not None and req_embs is not None and cv_embs.size and req_embs.size:
        matched_idx: List[int] = []
        for i in range(req_embs.shape[0]):
            r = req_embs[i]
            sims = [ _cosine(r, c) for c in cv_embs ]
            if sims and max(sims) >= threshold:
                matched_idx.append(i)
        matched = [req_skills[i] for i in matched_idx]
        missing = [req_skills[i] for i in range(len(req_skills)) if i not in matched_idx]
        cov = len(matched) / max(1, len(req_skills))
        return cov, missing, matched
    # Fallback: string intersection
    cv_set = set(cv_skills or [])
    req_set = set(req_skills or [])
    matched = list(cv_set & req_set)
    missing = list(req_set - cv_set)
    coverage = len(matched) / max(1, len(req_skills))
    return coverage, missing, matched

def semantic_similarity(text1: str, text2: str) -> float:
    if not text1 or not text2:
        return 0.0
    embs = _encode_texts([text1, text2])
    if embs is not None and embs.shape[0] == 2:
        return _cosine(embs[0], embs[1])
    # Fallback Jaccard
    s1 = set(re.findall(r"\w+", text1.lower()))
    s2 = set(re.findall(r"\w+", text2.lower()))
    if not s1 or not s2:
        return 0.0
    return float(len(s1 & s2) / max(1, len(s1 | s2)))


