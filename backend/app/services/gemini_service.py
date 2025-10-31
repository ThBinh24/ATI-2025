from __future__ import annotations

import json
from typing import Dict, List, Optional, Sequence

from app.core.config import GEMINI_MODEL_INTERVIEW, GOOGLE_API_KEY
from app.services.skills_service import extract_skills

try:
    import google.generativeai as genai  # type: ignore
except ImportError:  # pragma: no cover
    genai = None  # type: ignore

_MODEL = None
_ENABLED = False

if genai and GOOGLE_API_KEY:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        _MODEL = genai.GenerativeModel(model_name=GEMINI_MODEL_INTERVIEW)
        _ENABLED = True
    except Exception:  # pragma: no cover - configuration failure
        _MODEL = None
        _ENABLED = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def gemini_available() -> bool:
    return _ENABLED and _MODEL is not None


def _clean_json_text(raw: str) -> str:
    cleaned = raw.strip("` \n\t")
    if cleaned.lower().startswith("json"):
        cleaned = cleaned[4:].strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        cleaned = cleaned.strip("`")
    return cleaned.strip()


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _normalise_list(values: Sequence[str] | None) -> List[str]:
    if not values:
        return []
    return [str(v).strip() for v in values if str(v).strip()]


def summarize_text_for_prompt(text: str, max_length: int = 1200) -> str:
    stripped = text.strip()
    if len(stripped) <= max_length:
        return stripped
    summary = stripped[:max_length]
    skills = extract_skills(stripped, top_n=10)
    if skills:
        summary += "\nKey skills: " + ", ".join(skills)
    return summary


def summarize_jd_for_prompt(jd_text: str, max_length: int = 1200) -> str:
    return summarize_text_for_prompt(jd_text, max_length=max_length)


def summarize_cv_for_prompt(cv_text: str, max_length: int = 1600) -> str:
    return summarize_text_for_prompt(cv_text, max_length=max_length)


# ---------------------------------------------------------------------------
# Interview helpers
# ---------------------------------------------------------------------------

def generate_interview_questions_from_gemini(
    jd_text: str,
    domain: str,
    num_questions: int = 5,
) -> Optional[List[str]]:
    if not gemini_available():
        return None

    prompt = f"""
You are an experienced interviewer. Given the job description below, return a JSON array of exactly {num_questions} concise interview questions.
- Focus on the "{domain}" competencies.
- Tailor the questions to the responsibilities and required skills in the job description.
- Output only valid JSON in the format ["question 1", "question 2", ...] with no surrounding text.
Job Description:
\"\"\"
{jd_text.strip()}
\"\"\"
"""
    try:
        result = _MODEL.generate_content(prompt)  # type: ignore[attr-defined]
    except Exception:
        return None
    raw_text = _clean_json_text((getattr(result, "text", "") or ""))
    if raw_text:
        try:
            data = json.loads(raw_text)
            if isinstance(data, list):
                cleaned = [str(item).strip() for item in data if str(item).strip()]
                if cleaned:
                    return cleaned[:num_questions]
        except Exception:
            pass

    text = raw_text or (getattr(result, "text", "") or "").strip()
    if not text:
        return None
    lines: List[str] = []
    for raw in text.splitlines():
        candidate = raw.strip()
        if not candidate:
            continue
        if candidate[0].isdigit():
            candidate = candidate.split(".", 1)[-1].strip() if "." in candidate else candidate
            candidate = candidate.split(")", 1)[-1].strip() if ")" in candidate else candidate
        lines.append(candidate)
    return lines[:num_questions] if lines else None


def generate_interview_feedback_with_gemini(
    question: str,
    answer: str,
    jd_text: str,
    domain: str,
) -> Optional[dict]:
    if not gemini_available():
        return None

    prompt = f"""
You are an interview coach. Evaluate the candidate's answer and respond in JSON only.
Keep the response concise to preserve tokens.
JSON format:
{{
  "rating": "Weak|Average|Strong",
  "comment": "overall feedback (max 50 words)",
  "tips": ["tip1", "tip2", ... up to 3 items, each <= 12 words]
}}

Interview domain: {domain}
Job description:
\"\"\"
{jd_text.strip()}
\"\"\"

Question: {question}
Candidate answer:
\"\"\"
{answer}
\"\"\"
"""
    try:
        result = _MODEL.generate_content(prompt)  # type: ignore[attr-defined]
    except Exception:
        return None
    raw = _clean_json_text((getattr(result, "text", "") or ""))
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return None
    rating = str(data.get("rating") or "Average")
    comment = str(data.get("comment") or "")
    tips_raw = data.get("tips") or []
    tips = _normalise_list(tips_raw if isinstance(tips_raw, list) else [tips_raw])
    return {
        "rating": rating,
        "comment": comment,
        "tips": tips,
    }


# ---------------------------------------------------------------------------
# CV analysis with Gemini
# ---------------------------------------------------------------------------

def analyze_cv_with_gemini(
    cv_text: str,
    jd_text: str,
    fallback_cv_skills: Optional[List[str]] = None,
    fallback_jd_skills: Optional[List[str]] = None,
) -> Optional[Dict[str, object]]:
    """Return enriched CV analysis using Gemini. Falls back to None if generation fails."""
    if not gemini_available():
        return None

    cv_excerpt = summarize_cv_for_prompt(cv_text)
    jd_excerpt = summarize_jd_for_prompt(jd_text)
    fallback_cv_skills = fallback_cv_skills or []
    fallback_jd_skills = fallback_jd_skills or []

    prompt = f"""
You are an AI assistant helping recruiters screen candidates.
Analyse the candidate CV against the job description.
Return JSON ONLY with the following structure:
{{
  "cv_skills": ["skill1", "skill2", ...],               # at most 15 concise skill names
  "jd_skills": ["skillA", "skillB", ...],               # at most 15 concise skill names
  "matched_skills": ["..."],                            # subset of both lists
  "missing_skills": ["..."],                            # JD skills not covered by the CV
  "coverage": 0.0,                                      # ratio 0-1 of JD skills covered by the CV
  "similarity": 0.0,                                    # semantic similarity 0-1 between CV and JD
  "predicted_role": "Likely role that fits the CV",
  "quality_warnings": [
      {{"issue": "Missing contact info", "severity": "high", "recommendation": "Add an email address."}}
  ],
  "course_suggestions": [
      {{"skill": "Python", "title": "Python for Everybody", "provider": "Coursera", "url": "https://..."}}
  ]
}}

- coverage and similarity must be floats between 0 and 1.
- Do not add explanations outside the JSON.
- Use concise phrasing.

Job description:
\"\"\"
{jd_excerpt}
\"\"\"

Candidate CV:
\"\"\"
{cv_excerpt}
\"\"\"

Known CV skills (for reference): {", ".join(fallback_cv_skills) or "None"}
Known JD skills (for reference): {", ".join(fallback_jd_skills) or "None"}
"""
    try:
        result = _MODEL.generate_content(prompt)  # type: ignore[attr-defined]
    except Exception:
        return None

    raw_text = _clean_json_text((getattr(result, "text", "") or ""))
    if not raw_text:
        return None

    try:
        data = json.loads(raw_text)
    except Exception:
        return None

    cv_skills = _normalise_list(data.get("cv_skills"))
    jd_skills = _normalise_list(data.get("jd_skills"))
    matched = _normalise_list(data.get("matched_skills"))
    missing = _normalise_list(data.get("missing_skills"))
    if not cv_skills:
        cv_skills = fallback_cv_skills
    if not jd_skills:
        jd_skills = fallback_jd_skills

    coverage = max(0.0, min(1.0, _safe_float(data.get("coverage"), 0.0)))
    similarity = max(0.0, min(1.0, _safe_float(data.get("similarity"), 0.0)))
    predicted_role = str(data.get("predicted_role") or "").strip()

    warnings_raw = data.get("quality_warnings") or []
    quality_warnings: List[Dict[str, str]] = []
    if isinstance(warnings_raw, list):
        for entry in warnings_raw:
            if not isinstance(entry, dict):
                continue
            issue = str(entry.get("issue") or "").strip()
            severity = str(entry.get("severity") or "").strip()
            recommendation = str(entry.get("recommendation") or "").strip()
            if issue:
                quality_warnings.append(
                    {
                        "issue": issue,
                        "severity": severity or "medium",
                        "recommendation": recommendation or None,
                    }
                )

    courses_raw = data.get("course_suggestions") or []
    course_suggestions: List[Dict[str, str]] = []
    if isinstance(courses_raw, list):
        for entry in courses_raw:
            if not isinstance(entry, dict):
                continue
            skill = str(entry.get("skill") or "").strip()
            title = str(entry.get("title") or "").strip()
            if not title:
                continue
            course_suggestions.append(
                {
                    "skill": skill or "",
                    "title": title,
                    "provider": str(entry.get("provider") or "").strip() or None,
                    "url": str(entry.get("url") or "").strip() or None,
                }
            )

    return {
        "cv_skills": cv_skills,
        "jd_skills": jd_skills,
        "matched": matched,
        "missing": missing,
        "coverage": coverage,
        "similarity": similarity,
        "predicted_role": predicted_role,
        "quality_warnings": quality_warnings,
        "course_suggestions": course_suggestions,
    }
