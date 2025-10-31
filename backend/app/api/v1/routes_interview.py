from __future__ import annotations

import random
from typing import Dict, List
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    File,
    Form,
    Request,
    UploadFile,
)
from pydantic import BaseModel, Field

from app.core.deps import require_roles
from app.services.skills_service import extract_skills
from app.services.cv_service import extract_text_generic_from_bytes
from app.services.gemini_service import (
    gemini_available,
    generate_interview_feedback_with_gemini,
    generate_interview_questions_from_gemini,
    summarize_jd_for_prompt,
)

router = APIRouter(prefix="/interview", tags=["interview"])


QUESTION_BANK: Dict[str, List[str]] = {
    "behavioral": [
        "Tell me about a time you handled a difficult stakeholder. How did you approach it?",
        "Describe a situation where you made a mistake. What did you learn?",
        "Give an example of how you motivated a teammate or your team.",
        "Share a time you had to deliver under a tight deadline. What was the outcome?",
    ],
    "technical": [
        "Explain a recent technical project you worked on. What was your role?",
        "How would you optimize a slow database query?",
        "Describe the difference between synchronous and asynchronous processing.",
        "How do you ensure code quality in a production environment?",
    ],
}


class InterviewStartRequest(BaseModel):
    domain: str = Field(default="behavioral", description="behavioral or technical")
    jd_text: str = Field(
        default="",
        description="Job description text pasted by the student.",
        min_length=0,
    )


class InterviewStartResponse(BaseModel):
    session_id: str
    domain: str
    question: str


class InterviewMessageRequest(BaseModel):
    answer: str


class InterviewFeedback(BaseModel):
    rating: str
    comment: str
    tips: List[str]


class InterviewMessageResponse(BaseModel):
    session_id: str
    question: str
    answer: str
    feedback: InterviewFeedback
    next_question: str | None = None
    completed: bool = False
    history: List[Dict[str, str]] = []


_SESSIONS: Dict[str, Dict[str, object]] = {}


def _generate_feedback(answer: str, domain: str, focus: str | None = None) -> InterviewFeedback:
    clean = (answer or '').strip()
    length = len(clean.split())
    tips: List[str] = []
    rating = 'average'

    if length < 40:
        tips.append('Try elaborating more - aim for 2-3 concise paragraphs.')
    else:
        tips.append('Good level of detail. Keep emphasizing impact.')

    lower_answer = clean.lower()
    if domain == 'behavioral':
        if 'learn' not in lower_answer:
            tips.append('Highlight what you learned or the outcome.')
        if 'team' not in lower_answer and 'stakeholder' not in lower_answer:
            tips.append('Mention collaboration or how you worked with others.')
    else:
        if any(keyword in lower_answer for keyword in ['complexity', 'big-o', 'optimiz']):
            tips.append('Nice touch explaining the complexity/optimization angle.')
        else:
            tips.append('Consider referencing complexity analysis or concrete metrics.')

    if length < 20:
        rating = 'weak'
    elif length >= 80 and len(tips) <= 2:
        rating = 'strong'

    comment = (
        'Great structure, consider adding impact metrics.'
        if rating == 'strong'
        else 'Decent answer. Expand on impact and lessons learned.'
        if rating == 'average'
        else 'Short answer. Explain context, actions, and results in more depth.'
    )

    if focus and focus not in lower_answer:
        tips.append(f'Reference {focus} explicitly to connect with the JD requirement.')

    return InterviewFeedback(rating=rating.title(), comment=comment, tips=tips)


def _generate_questions_from_jd(jd_text: str, domain: str) -> List[str]:
    text = jd_text or ""
    skills = extract_skills(text, top_n=6)
    lines = [
        line.strip(" •-\t")
        for line in text.splitlines()
        if len(line.strip()) >= 20
    ]
    questions: List[str] = []

    if not skills and not lines:
        return QUESTION_BANK[domain][:5]

    def append_question(q: str):
        if q not in questions:
            questions.append(q)

    for skill in skills[:3]:
        if domain == "technical":
            append_question(
                f"Describe a project where you utilized {skill}. What challenge did you solve and what was the outcome?"
            )
        else:
            append_question(
                f"Tell me about a time you had to collaborate with others while applying {skill}. What did you learn?"
            )

    for line in lines[:3]:
        if domain == "technical":
            append_question(
                f"In the JD it mentions '{line}'. How would you approach this responsibility in a real project?"
            )
        else:
            append_question(
                f"The role expects '{line}'. Share an experience that demonstrates your ability in this area."
            )

    base_templates = QUESTION_BANK[domain]
    idx = 0
    while len(questions) < 5 and idx < len(base_templates):
        append_question(base_templates[idx])
        idx += 1

    return questions[:5]


@router.post("/session", response_model=InterviewStartResponse)
async def start_session(
    request: Request,
    domain: str | None = Form(default=None),
    jd_text: str = Form(default=""),
    jd_file: UploadFile | None = File(default=None),
    current_user: dict = Depends(require_roles("student", "admin")),
):
    parsed_payload: InterviewStartRequest | None = None
    if domain is None:
        try:
            data = await request.json()
            parsed_payload = InterviewStartRequest.model_validate(data)
        except Exception:
            parsed_payload = InterviewStartRequest()
        domain = parsed_payload.domain
        jd_text = parsed_payload.jd_text

    domain = (domain or "behavioral").lower()
    if domain not in QUESTION_BANK:
        raise HTTPException(status_code=400, detail="Unsupported interview domain.")

    combined_jd_text = jd_text or ""
    if jd_file is not None:
        try:
            file_bytes = await jd_file.read()
        except Exception:
            file_bytes = b""
        extracted_text = extract_text_generic_from_bytes(
            jd_file.filename or "jd_file",
            file_bytes,
        )
        if extracted_text:
            combined_jd_text = (
                f"{combined_jd_text}\n\n{extracted_text}"
                if combined_jd_text
                else extracted_text
            )
    if not combined_jd_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Provide job description text or upload a JD file.",
        )

    questions = _generate_questions_from_jd(combined_jd_text, domain)
    if gemini_available():
        jd_summary = summarize_jd_for_prompt(combined_jd_text)
        llm_questions = generate_interview_questions_from_gemini(
            jd_summary, domain, num_questions=5
        )
        if llm_questions:
            questions = llm_questions
    jd_summary = summarize_jd_for_prompt(combined_jd_text)
    session_id = uuid4().hex
    _SESSIONS[session_id] = {
        "domain": domain,
        "index": 0,
        "questions": questions,
        "history": [],
        "focus": [s.lower() for s in extract_skills(combined_jd_text, top_n=6)],
        "jd_text": jd_summary,
    }
    first_question = questions[0]
    return InterviewStartResponse(session_id=session_id, domain=domain, question=first_question)


@router.post("/session/{session_id}/message", response_model=InterviewMessageResponse)
def send_message(
    session_id: str,
    payload: InterviewMessageRequest,
    current_user: dict = Depends(require_roles("student", "admin")),
):
    session = _SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    questions: List[str] = session["questions"]  # type: ignore[assignment]
    index: int = session["index"]  # type: ignore[assignment]

    if index >= len(questions):
        return InterviewMessageResponse(
            session_id=session_id,
            question="Session completed",
            answer=payload.answer,
            feedback=InterviewFeedback(
                rating="Completed",
                comment="You've already answered all questions in this session.",
                tips=["Restart the session for more practice."],
            ),
            next_question=None,
            completed=True,
            history=session["history"],  # type: ignore[arg-type]
        )

    current_question = questions[index]
    focus_terms: List[str] = session.get("focus", [])  # type: ignore[assignment]
    focus = None
    for term in focus_terms:
        if term and term in current_question.lower():
            focus = term
            break

    jd_summary = session.get("jd_text", "")  # type: ignore[assignment]

    feedback_data = (
        generate_interview_feedback_with_gemini(
            current_question,
            payload.answer,
            jd_summary,
            session["domain"],  # type: ignore[arg-type]
        )
        if gemini_available()
        else None
    )

    if feedback_data:
        feedback = InterviewFeedback(
            rating=str(feedback_data.get("rating", "Average")).title(),
            comment=str(
                feedback_data.get("comment", "Consider elaborating further.")
            ),
            tips=[
                str(tip)
                for tip in feedback_data.get("tips", [])
                if isinstance(tip, str) and tip.strip()
            ],
        )
    else:
        feedback = _generate_feedback(payload.answer, session["domain"], focus)  # type: ignore[arg-type]

    history_entry = {
        "question": current_question,
        "answer": payload.answer,
        "rating": feedback.rating,
        "comment": feedback.comment,
    }
    session["history"].append(history_entry)  # type: ignore[arg-type]
    session["index"] = index + 1  # type: ignore[assignment]

    completed = session["index"] >= len(questions)  # type: ignore[operator]
    next_question = (
        questions[session["index"]] if not completed else None  # type: ignore[index]
    )

    return InterviewMessageResponse(
        session_id=session_id,
        question=current_question,
        answer=payload.answer,
        feedback=feedback,
        next_question=next_question,
        completed=completed,
        history=session["history"],  # type: ignore[arg-type]
    )
