import base64
import shutil
from pathlib import Path
from typing import Any, Dict, List, Tuple
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.core import config
from app.core.deps import get_current_user, require_roles
from app.dao.jobs_dao import get_job_by_id
from app.dao.processed_dao import (
    get_application_for_user,
    get_by_id as get_applicant_by_id,
    insert_processed,
    list_by_email,
    list_by_job,
    mark_invite_sent,
    delete_application_for_user,
)
from app.services.email_service import send_email

router = APIRouter(prefix="/applicants", tags=["applicants"])


@router.get("")
def get_applicants(
    job_id: int = Query(..., description="Job ID"),
    current_user: dict = Depends(require_roles("admin", "employer")),
) -> List[Dict[str, Any]]:
    job = get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user["role"] == "employer" and job.get("employer_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed to view this job.")
    return list_by_job(job_id)


@router.post("/log")
def log_applicant(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    job_id = payload.get("job_id")
    if job_id:
        job = get_job_by_id(int(job_id))
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if current_user["role"] == "employer" and job.get("employer_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not allowed to log for this job.")
    new_id = insert_processed(payload)
    return {"id": new_id}


class InviteRequest(BaseModel):
    subject: str
    body: str
    attach_jd: bool = False


@router.post("/{applicant_id}/invite")
def invite_applicant(
    applicant_id: int,
    payload: InviteRequest,
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    applicant = get_applicant_by_id(applicant_id)
    if not applicant:
        raise HTTPException(status_code=404, detail="Applicant not found")

    job_id = applicant.get("job_id")
    if job_id is None:
        raise HTTPException(
            status_code=400, detail="Applicant is not associated with a job."
        )

    job = get_job_by_id(int(job_id))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_user["role"] == "employer" and job.get("employer_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed to invite for this job.")

    to_email = applicant.get("email")
    if not to_email:
        raise HTTPException(status_code=400, detail="Applicant email is missing.")

    subject = payload.subject.strip()
    body = payload.body.strip()
    if not subject or not body:
        raise HTTPException(status_code=400, detail="Subject and body are required.")

    attachment_name = None
    attachment_b64 = None
    if payload.attach_jd and job.get("jd_file_path"):
        file_path = Path(job["jd_file_path"])
        if file_path.exists() and file_path.is_file():
            attachment_name = job.get("jd_file_name") or file_path.name
            try:
                attachment_b64 = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            except OSError:
                raise HTTPException(
                    status_code=500, detail="Failed to read JD attachment for emailing."
                )

    ok, msg = send_email(
        to_email=to_email,
        subject=subject,
        body=body,
        attachment_name=attachment_name,
        attachment_b64=attachment_b64,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    if not mark_invite_sent(applicant_id, subject, body):
        raise HTTPException(
            status_code=500, detail="Email sent but failed to update applicant log."
        )

    updated_applicant = get_applicant_by_id(applicant_id)
    return {"ok": True, "message": msg, "applicant": updated_applicant}


CV_DIR = Path(config.CV_UPLOAD_DIR)
CV_DIR.mkdir(parents=True, exist_ok=True)
CV_ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx"}


def _save_cv_file(upload: UploadFile) -> Tuple[str, str]:
    filename = upload.filename or ""
    ext = Path(filename).suffix.lower()
    if ext not in CV_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported CV file type. Allowed: PDF, DOC, DOCX.",
        )
    unique_name = f"{uuid4().hex}{ext}"
    destination = CV_DIR / unique_name
    try:
        with destination.open("wb") as buffer:
            shutil.copyfileobj(upload.file, buffer)
    finally:
        try:
            upload.file.close()
        except Exception:
            pass
    return unique_name, Path(filename).name


@router.post("/upload-cv")
def upload_cv_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_roles("student", "admin")),
):
    stored_path, original_name = _save_cv_file(file)
    return {"path": stored_path, "filename": original_name}


@router.get("/my")
def get_my_applications(current_user: dict = Depends(require_roles("student", "admin"))):
    email = current_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Current user email missing.")
    return list_by_email(email)


@router.get("/my/{application_id}")
def get_my_application_detail(
    application_id: int,
    current_user: dict = Depends(require_roles("student", "admin")),
):
    email = current_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Current user email missing.")
    record = get_application_for_user(application_id, email)
    if not record:
        raise HTTPException(status_code=404, detail="Application not found.")
    return record


@router.get("/my/{application_id}/cv")
def download_my_cv(
    application_id: int,
    current_user: dict = Depends(require_roles("student", "admin")),
):
    email = current_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Current user email missing.")
    record = get_application_for_user(application_id, email)
    if not record or not record.get("uploaded_file_path"):
        raise HTTPException(status_code=404, detail="CV file not found.")
    raw_path = record["uploaded_file_path"]
    file_path = Path(raw_path)
    if not file_path.is_absolute():
        file_path = CV_DIR / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="CV file not found.")
    filename = record.get("uploaded_filename") or file_path.name
    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=filename,
    )


@router.delete("/my/{application_id}")
def delete_my_application(
    application_id: int,
    current_user: dict = Depends(require_roles("student", "admin")),
):
    email = current_user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Current user email missing.")
    record = get_application_for_user(application_id, email)
    if not record:
        raise HTTPException(status_code=404, detail="Application not found.")
    if not delete_application_for_user(application_id, email):
        raise HTTPException(status_code=500, detail="Failed to delete application.")
    raw_path = record.get("uploaded_file_path")
    if raw_path:
        file_path = Path(raw_path)
        if not file_path.is_absolute():
            file_path = CV_DIR / file_path
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError:
            pass
    return {"status": "deleted"}

@router.get("/{applicant_id}/cv")
def download_applicant_cv(
    applicant_id: int,
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    applicant = get_applicant_by_id(applicant_id)
    if not applicant or not applicant.get("uploaded_file_path"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV file not found.")

    job_id = applicant.get("job_id")
    if current_user["role"] == "employer":
        job = get_job_by_id(int(job_id)) if job_id else None
        if not job or job.get("employer_id") != current_user["id"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed to view this CV.")

    raw_path = applicant["uploaded_file_path"]
    file_path = Path(raw_path)
    if not file_path.is_absolute():
        file_path = CV_DIR / file_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV file not found.")
    filename = applicant.get("uploaded_filename") or file_path.name
    return FileResponse(file_path, media_type="application/octet-stream", filename=filename)
