from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from app.schemas.schemas import CVProcessRequest, CVProcessResult
from app.dao.jobs_dao import get_job_by_id
from app.services.cv_service import extract_text_generic_from_bytes
from app.services.cv_matching_service import build_cv_analysis
from app.core.deps import get_current_user

router = APIRouter(prefix="/cv", tags=["cv"])


@router.post("/process", response_model=CVProcessResult)
def process_cv(payload: CVProcessRequest, current_user: dict = Depends(get_current_user)):
    _ = current_user  # authentication enforced via dependency
    cv_text = (payload.cv_text or "").strip()
    job = get_job_by_id(payload.job_id) if payload.job_id else None

    if not cv_text:
        raise HTTPException(status_code=400, detail="Missing cv_text")

    return build_cv_analysis(cv_text, job)


@router.post("/process-file", response_model=CVProcessResult)
def process_cv_file(
    file: UploadFile = File(...),
    job_id: int | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    _ = current_user  # authentication enforced via dependency
    try:
        data = file.file.read()
    finally:
        try:
            file.file.close()
        except Exception:
            pass
    raw_text = extract_text_generic_from_bytes(file.filename or "", data or b"")
    job = get_job_by_id(job_id) if job_id else None
    return build_cv_analysis(raw_text, job)
