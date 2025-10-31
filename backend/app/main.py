from fastapi import FastAPI
from app.core.cors import add_cors
from app.api.v1.routes_health import router as health_router
from app.api.v1.routes_jobs import router as jobs_router
from app.api.v1.routes_cv import router as cv_router
from app.api.v1.routes_auth import router as auth_router
from app.api.v1.routes_applicants import router as applicants_router
from app.api.v1.routes_email import router as email_router
from app.api.v1.routes_interview import router as interview_router

from app.core.db import get_connection, migrate
_conn = get_connection()
migrate(_conn)

app = FastAPI(title="ATI Backend API", version="1.0.0")
add_cors(app)

app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")
app.include_router(cv_router, prefix="/api/v1")
app.include_router(applicants_router, prefix="/api/v1")
app.include_router(email_router, prefix="/api/v1")
app.include_router(interview_router, prefix="/api/v1")
