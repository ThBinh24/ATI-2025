import re
from typing import Dict, List


CVWarning = Dict[str, str]
CourseSuggestion = Dict[str, str]

_COURSE_LIBRARY: Dict[str, List[CourseSuggestion]] = {
    "python": [
        {
            "skill": "Python",
            "title": "Python for Everybody",
            "provider": "Coursera",
            "url": "https://www.coursera.org/specializations/python",
        },
        {
            "skill": "Python",
            "title": "Automate the Boring Stuff with Python",
            "provider": "Udemy",
            "url": "https://www.udemy.com/course/automate/",
        },
    ],
    "sql": [
        {
            "skill": "SQL",
            "title": "SQL for Data Analysis",
            "provider": "Mode",
            "url": "https://mode.com/sql-tutorial/",
        },
        {
            "skill": "SQL",
            "title": "Advanced SQL for Data Scientists",
            "provider": "DataCamp",
            "url": "https://www.datacamp.com/courses/advanced-sql-for-data-scientists",
        },
    ],
    "javascript": [
        {
            "skill": "JavaScript",
            "title": "JavaScript Algorithms and Data Structures",
            "provider": "freeCodeCamp",
            "url": "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/",
        }
    ],
    "machine learning": [
        {
            "skill": "Machine Learning",
            "title": "Machine Learning Specialization",
            "provider": "Coursera",
            "url": "https://www.coursera.org/specializations/machine-learning-introduction",
        }
    ],
    "excel": [
        {
            "skill": "Excel",
            "title": "Excel Skills for Business",
            "provider": "Coursera",
            "url": "https://www.coursera.org/specializations/excel",
        }
    ],
    "communication": [
        {
            "skill": "Communication",
            "title": "Improving Communication Skills",
            "provider": "Coursera",
            "url": "https://www.coursera.org/learn/wharton-communication-skills",
        }
    ],
}


def analyse_cv_quality(cv_text: str, cv_skills: List[str]) -> List[CVWarning]:
    warnings: List[CVWarning] = []
    text = cv_text or ""
    lowered = text.lower()

    if not re.search(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}\b", text):
        warnings.append(
            {
                "issue": "Missing email address",
                "severity": "high",
                "recommendation": "Add a professional email so recruiters can reach you.",
            }
        )

    if not re.search(r"\+?\d[\d\s\-]{7,}", text):
        warnings.append(
            {
                "issue": "Missing phone number",
                "severity": "medium",
                "recommendation": "Include a reachable phone number at the top of your CV.",
            }
        )

    word_count = len(re.findall(r"\w+", text))
    if word_count < 150:
        warnings.append(
            {
                "issue": "CV may be too short",
                "severity": "medium",
                "recommendation": "Expand on your responsibilities and achievements. Aim for at least one page.",
            }
        )

    if "experience" not in lowered:
        warnings.append(
            {
                "issue": "Experience section not detected",
                "severity": "high",
                "recommendation": "Add a section detailing your work or project experience.",
            }
        )

    if "education" not in lowered:
        warnings.append(
            {
                "issue": "Education section not detected",
                "severity": "medium",
                "recommendation": "Include your education history with degrees, institutions, and graduation dates.",
            }
        )

    if "skill" not in lowered and not cv_skills:
        warnings.append(
            {
                "issue": "Skills section not detected",
                "severity": "medium",
                "recommendation": "Add a dedicated skills section highlighting your technical and soft skills.",
            }
        )

    if not cv_skills:
        warnings.append(
            {
                "issue": "No skills extracted",
                "severity": "medium",
                "recommendation": "List your core skills explicitly using bullet points.",
            }
        )

    return warnings


def suggest_courses(missing_skills: List[str]) -> List[CourseSuggestion]:
    suggestions: List[CourseSuggestion] = []
    seen = set()
    for skill in missing_skills:
        key = skill.lower()
        matched_key = None
        if key in _COURSE_LIBRARY:
            matched_key = key
        else:
            for library_key in _COURSE_LIBRARY.keys():
                if library_key in key:
                    matched_key = library_key
                    break
        if not matched_key:
            continue
        for course in _COURSE_LIBRARY[matched_key]:
            marker = (course["title"], course["url"])
            if marker in seen:
                continue
            seen.add(marker)
            suggestions.append(course)
    return suggestions[:10]
