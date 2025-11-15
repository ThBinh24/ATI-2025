from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    created_at: Optional[str] = None
    is_banned: Optional[bool] = None
    banned_reason: Optional[str] = None
    banned_at: Optional[str] = None


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "student"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class BanUserRequest(BaseModel):
    reason: str

class JobCreate(BaseModel):
    title: str
    company_name: str = ""
    jd_text: Optional[str] = ""
    hr_email: str = ""
    coverage_threshold: float = 0.6

class JobUpdateStatus(BaseModel):
    status: str
    rejection_reason: Optional[str] = None

class Job(BaseModel):
    id: int
    title: str
    company_name: str = ""
    jd_text: str = ""
    hr_email: str = ""
    created_at: str = ""
    status: str = "pending"
    published: int = 0
    coverage_threshold: float = 0.6
    employer_id: Optional[int] = None
    rejection_reason: Optional[str] = None
    has_attachment: bool = False
    attachment_name: Optional[str] = None
    attachment_path: Optional[str] = None

class CVProcessRequest(BaseModel):
    cv_text: Optional[str] = None
    job_id: Optional[int] = None

class CVWarning(BaseModel):
    issue: str
    severity: str
    recommendation: Optional[str] = None

class CourseSuggestion(BaseModel):
    skill: str
    title: str
    provider: Optional[str] = None
    url: Optional[str] = None

class CVProcessResult(BaseModel):
    cv_skills: List[str]
    jd_skills: List[str]
    matched: List[str]
    missing: List[str]
    coverage: float
    similarity: float
    passed: bool
    predicted_role: str
    quality_warnings: List[CVWarning]
    course_suggestions: List[CourseSuggestion]


class JobDescriptionRequest(BaseModel):
    title: str
    experience_level: Optional[str] = None
    core_skills: Optional[List[str]] = None
    responsibilities: Optional[str] = None
    benefits: Optional[str] = None
    company_name: Optional[str] = None
    tone: Optional[str] = None


class JobDescriptionResponse(BaseModel):
    jd_text: str
    source: str = "gemini"


class ProfileTemplateOut(BaseModel):
    id: str
    name: str
    version: str
    style: str
    description: Optional[str] = ""
    contract: Dict[str, Any] = {}


class ProfileGenerateRequest(BaseModel):
    field: str
    position: str
    style: str = "modern"
    language: str = "English"
    template_id: Optional[str] = None
    notes: Optional[str] = ""


class ProfileDraftOut(BaseModel):
    id: int
    template_id: str
    template_version: str
    schema_version: str
    data: Dict[str, Any]
    blocks: List[Dict[str, Any]]


class ProfileUpdateRequest(BaseModel):
    template_id: Optional[str] = None
    data: Dict[str, Any]
    blocks: Optional[List[Dict[str, Any]]] = None


class ProfileRenderResponse(BaseModel):
    html: str
    css: str
    template_version: str


class ProfileDraftSummary(BaseModel):
    id: int
    template_id: str
    template_version: str
    name: Optional[str] = ""
    headline: Optional[str] = ""
    updated_at: Optional[str] = None
    created_at: Optional[str] = None
