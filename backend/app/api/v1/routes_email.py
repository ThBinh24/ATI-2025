from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.services.email_service import send_email
from app.core.deps import require_roles

router = APIRouter(prefix="/email", tags=["email"])

class EmailRequest(BaseModel):
    to_email: EmailStr
    subject: str
    body: str
    attachment_name: Optional[str] = None
    attachment_b64: Optional[str] = None

@router.post("/send")
def email_send(
    payload: EmailRequest,
    current_user: dict = Depends(require_roles("admin", "employer")),
):
    ok, msg = send_email(
        to_email=payload.to_email,
        subject=payload.subject,
        body=payload.body,
        attachment_name=payload.attachment_name,
        attachment_b64=payload.attachment_b64,
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"ok": True, "message": msg}
