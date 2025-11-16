from __future__ import annotations

from typing import Dict, Optional

from app.schemas.schemas import CVProcessResult
from app.services.skills_service import extract_skills
from app.services.embedding_service import coverage_score, semantic_similarity
from app.services.matching_service import predict_cv_category
from app.services.feedback_service import analyse_cv_quality, suggest_courses
from app.services.gemini_service import analyze_cv_with_gemini


def build_cv_analysis(cv_text: str, job: Optional[Dict[str, object]] = None) -> CVProcessResult:
    jd_text = (job.get("jd_text", "") if job else "").strip()  # type: ignore[arg-type]
    cv_skills = extract_skills(cv_text)
    jd_skills = extract_skills(jd_text) if jd_text else []
    coverage, missing, matched = coverage_score(cv_skills, jd_skills)
    similarity = semantic_similarity(cv_text, jd_text) if jd_text else 0.0
    coverage = max(0.0, min(1.0, float(coverage)))
    similarity = max(0.0, min(1.0, float(similarity)))
    threshold = float(job.get("coverage_threshold", 0.6)) if job else 0.6  # type: ignore[arg-type]
    passed = bool(coverage >= threshold) if jd_skills else False
    predicted_role = predict_cv_category(cv_text)
    quality_warnings = analyse_cv_quality(cv_text, cv_skills)
    course_suggestions = suggest_courses(missing)

    gemini_result = analyze_cv_with_gemini(
        cv_text=cv_text,
        jd_text=jd_text,
        fallback_cv_skills=cv_skills,
        fallback_jd_skills=jd_skills,
    )
    if gemini_result:
        cv_skills = list(gemini_result.get("cv_skills", cv_skills) or cv_skills)
        jd_skills = list(gemini_result.get("jd_skills", jd_skills) or jd_skills)
        matched = list(gemini_result.get("matched", matched) or matched)
        missing = list(gemini_result.get("missing", missing) or missing)
        coverage = gemini_result.get("coverage", coverage) or coverage
        similarity = gemini_result.get("similarity", similarity) or similarity
        coverage = max(0.0, min(1.0, float(coverage)))
        similarity = max(0.0, min(1.0, float(similarity)))
        predicted_role = (
            gemini_result.get("predicted_role") or predicted_role or "Unknown"
        )
        quality_warnings = list(gemini_result.get("quality_warnings") or quality_warnings)
        course_suggestions = list(
            gemini_result.get("course_suggestions") or course_suggestions
        )
        if jd_skills:
            passed = bool(coverage >= threshold)

    return CVProcessResult(
        cv_skills=cv_skills,
        jd_skills=jd_skills,
        matched=matched,
        missing=missing,
        coverage=coverage,
        similarity=similarity,
        passed=passed,
        predicted_role=predicted_role,
        quality_warnings=quality_warnings,
        course_suggestions=course_suggestions,
    )
