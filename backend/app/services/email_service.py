import base64
from typing import Optional, Tuple
import yagmail
from app.core.config import GMAIL_USER, GMAIL_APP_PASSWORD

def send_email(
    to_email: str,
    subject: str,
    body: str,
    attachment_name: Optional[str] = None,
    attachment_b64: Optional[str] = None
) -> Tuple[bool, str]:
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        return False, "Missing Gmail credentials (GMAIL_USER/GMAIL_APP_PASSWORD)."

    try:
        yag = yagmail.SMTP(GMAIL_USER, GMAIL_APP_PASSWORD)
        attachments = None
        if attachment_name and attachment_b64:
            file_bytes = base64.b64decode(attachment_b64)
            attachments = [(attachment_name, file_bytes)]
        yag.send(to=to_email, subject=subject, contents=body, attachments=attachments)
        return True, "Email sent"
    except Exception as e:
        return False, str(e)