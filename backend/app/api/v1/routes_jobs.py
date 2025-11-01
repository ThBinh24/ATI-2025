from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status, Response
from fastapi.responses import FileResponse

from app.core import config
from app.core.deps import get_current_user, require_roles
from app.schemas.schemas import JobUpdateStatus
from app.dao.jobs_dao import (
    create_job,
    get_job_by_id,
    get_pending_jobs,
    list_jobs,
    list_review_history,
    update_job,
    update_job_status,
    delete_job as delete_job_record,
)
from app.services.cv_service import extract_text_generic_from_bytes
from app.services.gemini_service import (
    gemini_available,
    generate_interview_questions_from_gemini,
    summarize_jd_for_prompt,
)
from app.services.skills_service import extract_skills

router = APIRouter(prefix="/jobs", tags=["jobs"])

UPLOAD_DIR = Path(config.JD_UPLOAD_DIR)
ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".zip"}


def serialize_job(job: dict | None) -> dict | None:
    if not job:
        return None
    job = dict(job)
    attachment_path = job.pop("jd_file_path", None)
    attachment_name = job.pop("jd_file_name", None)
    job["has_attachment"] = bool(attachment_path)
    job["attachment_name"] = attachment_name or None
    job["attachment_path"] = (
        f"/jobs/{job['id']}/attachment" if attachment_path else None
    )
    return job


def save_attachment(upload: UploadFile | None) -> tuple[str | None, str | None]:
    if upload is None or not upload.filename:
        return None, None
    ext = Path(upload.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported JD attachment type. Allowed: PDF, Word, ZIP.",
        )
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid4().hex}{ext}"
    destination = UPLOAD_DIR / unique_name
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    upload.file.close()
    original_name = Path(upload.filename).name
    return str(destination.resolve()), original_name


@router.get("")
def get_jobs(current_user: dict = Depends(get_current_user)):
    role = current_user.get("role")
    if role == "employer":
        jobs = list_jobs(published_only=False, employer_id=current_user["id"])
    elif role == "student":
        jobs = list_jobs(published_only=True)
    else:
        jobs = list_jobs(published_only=False)
    return [serialize_job(job) for job in jobs]


@router.get("/history")
def get_history(_: dict = Depends(require_roles("admin"))):
    return [serialize_job(job) for job in list_review_history()]


@router.get("/pending")
def get_pending(_: dict = Depends(require_roles("admin"))):
    return [serialize_job(job) for job in get_pending_jobs()]


@router.get("/{job_id}")
def get_job(job_id: int):
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return serialize_job(job)


@router.get("/{job_id}/attachment")
def download_job_attachment(job_id: int, _: dict = Depends(get_current_user)):
    job = get_job_by_id(job_id)
    if not job or not job.get("jd_file_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    file_path = Path(job["jd_file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    filename = job.get("jd_file_name") or file_path.name
    return FileResponse(file_path, media_type="application/octet-stream", filename=filename)


@router.post("", status_code=status.HTTP_201_CREATED)
async def post_job(
    title: str = Form(...),
    company_name: str = Form(""),
    jd_text: str = Form(""),
    hr_email: str = Form(""),
    coverage_threshold: float = Form(config.COVERAGE_THRESHOLD_DEFAULT),
    jd_file: UploadFile | None = File(None),
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    employer_id = current_user["id"] if current_user["role"] == "employer" else None
    file_path, file_name = save_attachment(jd_file)
    job_data = {
        "title": title,
        "company_name": company_name,
        "jd_text": jd_text,
        "hr_email": hr_email,
        "coverage_threshold": coverage_threshold,
        "jd_file_path": file_path,
        "jd_file_name": file_name,
    }
    job_id = create_job(job_data, employer_id=employer_id)
    return {"id": job_id}


@router.put("/{job_id}")
async def put_job(
    job_id: int,
    title: str = Form(...),
    company_name: str = Form(""),
    jd_text: str = Form(""),
    hr_email: str = Form(""),
    coverage_threshold: float = Form(config.COVERAGE_THRESHOLD_DEFAULT),
    remove_attachment: bool = Form(False),
    jd_file: UploadFile | None = File(None),
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if current_user["role"] == "employer" and job.get("employer_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to modify this job.")

    new_file_path, new_file_name = save_attachment(jd_file)
    updates = {
        "title": title,
        "company_name": company_name,
        "jd_text": jd_text,
        "hr_email": hr_email,
        "coverage_threshold": float(coverage_threshold),
    }
    cleanup_paths: list[Path] = []

    if new_file_path:
        updates["jd_file_path"] = new_file_path
        updates["jd_file_name"] = new_file_name or ""
        if job.get("jd_file_path"):
            cleanup_paths.append(Path(job["jd_file_path"]))
    elif remove_attachment and job.get("jd_file_path"):
        updates["jd_file_path"] = None
        updates["jd_file_name"] = ""
        cleanup_paths.append(Path(job["jd_file_path"]))

    try:
        updated = update_job(job_id, updates)
    except Exception:
        if new_file_path:
            try:
                Path(new_file_path).unlink(missing_ok=True)
            except OSError:
                pass
        raise

    if not updated:
        if new_file_path:
            try:
                Path(new_file_path).unlink(missing_ok=True)
            except OSError:
                pass
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update job.")

    for path in cleanup_paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass

    updated_job = get_job_by_id(job_id)
    return serialize_job(updated_job)


@router.patch("/{job_id}/status")
def patch_job_status(
    job_id: int,
    payload: JobUpdateStatus,
    current_user: dict = Depends(require_roles("admin")),
):
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    new_status = payload.status.lower()
    if new_status not in {"approved", "rejected"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'approved' or 'rejected'.",
        )
    rejection_reason = payload.rejection_reason.strip() if payload.rejection_reason else ""
    if new_status == "rejected" and not rejection_reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rejection reason is required when rejecting a job.",
        )
    if new_status == "approved":
        rejection_reason = ""

    updated = update_job_status(
        job_id,
        status=new_status,
        rejection_reason=rejection_reason,
        admin_id=current_user["id"],
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update job status.",
        )
    return {"status": new_status}


def _fallback_questions(jd_text: str, domain: str) -> list[str]:
    jd_text = (jd_text or "").strip()
    skills = extract_skills(jd_text, top_n=6)
    base_behavioral = [
        "Can you walk me through a challenging project related to this role and how you handled it?",
        "What motivates you to join our team for this position?",
        "Describe a time you had to learn a new skill quickly to deliver results.",
    ]
    base_technical = [
        "What would be your approach to the core technical responsibilities highlighted in this JD?",
        "Describe a project that best shows your expertise with the stated tech stack.",
        "How do you keep your skills aligned with evolving industry practices?",
    ]
    templates = base_behavioral if domain == "behavioral" else base_technical
    questions: list[str] = []
    for skill in skills[:3]:
        if domain == "technical":
            questions.append(
                f"What experience do you have applying {skill} in production settings?"
            )
        else:
            questions.append(
                f"Tell us about a situation where you leveraged {skill} to drive impact."
            )
    questions.extend(templates)
    return questions[:5]


@router.post("/{job_id}/interview-questions")
async def generate_job_interview_questions(
    job_id: int,
    domain: str = Form("behavioral"),
    jd_text: str = Form(""),
    jd_file: UploadFile | None = File(None),
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    domain = (domain or "behavioral").lower()
    if domain not in {"behavioral", "technical"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Domain must be 'behavioral' hoặc 'technical'.",
        )
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if current_user["role"] == "employer" and job.get("employer_id") != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to generate questions for this job.",
        )

    combined_parts: list[str] = []
    stored_jd = (job.get("jd_text") or "").strip()
    if stored_jd:
        combined_parts.append(stored_jd)
    if jd_text and jd_text.strip():
        combined_parts.append(jd_text.strip())
    if jd_file is not None:
        try:
            file_bytes = await jd_file.read()
        except Exception:
            file_bytes = b""
        extracted = extract_text_generic_from_bytes(
            jd_file.filename or "uploaded_jd",
            file_bytes,
        )
        if extracted.strip():
            combined_parts.append(extracted.strip())
    combined_text = "\n\n".join(part for part in combined_parts if part)
    if not combined_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chưa có mô tả JD nào để tạo câu hỏi. Vui lòng nhập nội dung hoặc upload file.",
        )

    questions: list[str] | None = None
    source = "fallback"
    if gemini_available():
        try:
            summary = summarize_jd_for_prompt(combined_text)
            ai_questions = generate_interview_questions_from_gemini(
                summary,
                domain=domain,
                num_questions=5,
            )
            if ai_questions:
                questions = ai_questions[:5]
                source = "gemini"
        except Exception:
            questions = None

    if not questions:
        questions = _fallback_questions(combined_text, domain)

    return {
        "questions": questions,
        "source": source,
    }


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if current_user["role"] == "employer" and job.get("employer_id") != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to delete this job.")

    deleted = delete_job_record(job_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete job.")

    file_path = job.get("jd_file_path")
    if file_path:
        try:
            Path(file_path).unlink(missing_ok=True)
        except OSError:
            pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
