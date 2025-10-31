# CV Matcher Platform

CV Matcher is an AI-assisted recruitment platform that streamlines hiring for administrators, employers, and students. The project is split into a FastAPI backend and a React (Vite) frontend. Gemini 2.5 Flash powers interview preparation, CV feedback, and employer question generation, while SentenceTransformer embeddings provide deterministic coverage scoring.

## Features

### Admin
- Review, approve, or reject job postings with rejection reasons.
- View user directory with roles and created dates.
- Inspect job moderation history.

### Employer
- Create, edit, and delete job listings with optional JD attachments and coverage thresholds.
- View applicants, download submitted CVs, and send interview invites via Gmail.
- Generate five tailored interview questions (behavioural or technical) with Gemini 2.5 Flash.

### Student
- Browse published jobs with rich JD detail.
- Run "Run AI Check" to obtain coverage, similarity, missing skills, quality warnings, and course suggestions.
- Submit applications with file upload or pasted CV text and review past submissions.
- Practise interviews through an AI chat that delivers concise feedback on each answer.

## Architecture

```
ATI-main/
+-- backend/
   +-- app/                 # FastAPI application (routers, services, dao, schemas)
   +-- assets/              # skills.csv, job_titles.json used for extraction
   +-- uploads/             # Stored JD and CV files
   +-- requirements.txt
   +-- seed_admin.py        # Optional script to create an admin user
   +-- test_gemini.py       # Smoke test for Gemini connectivity
+-- frontend/
   +-- src/                 # React SPA (Vite + Tailwind)
   +-- package.json
   +-- tailwind.config.js
+-- README.md
```

- Database: SQLite (`backend/jobs.db`) for easy demos.
- Backend: FastAPI, Pydantic v2, SentenceTransformers, Gemini 2.5 Flash.
- Frontend: React 19, Vite 7, TailwindCSS.

## Prerequisites

- Python 3.10+
- Node.js 18+
- Git
- Google AI Studio API key with access to Gemini 2.5 Flash
- (Optional) Gmail account with App Password for invite emails

## Backend Setup

```bash
cd backend
python -m venv .venv
# PowerShell: .\.venv\Scripts\Activate.ps1
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Create `backend/.env` (see the next section) and start the API:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The development server runs at http://localhost:5173 by default.

## Environment Variables

`backend/.env`

```
# Required
GOOGLE_API_KEY=your_gemini_api_key
JWT_SECRET=replace_with_random_string

# Optional (recommended)
GMAIL_USER=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password
ACCESS_TOKEN_EXPIRE_MINUTES=60
JD_UPLOAD_DIR=absolute_path_to_backend\uploads\jd
CV_UPLOAD_DIR=absolute_path_to_backend\uploads\cv
GEMINI_MODEL_INTERVIEW=gemini-2.5-flash
```

- `test_gemini.py` can verify connectivity: `python test_gemini.py`.
- `seed_admin.py` inserts a sample admin user: `python seed_admin.py`.

## Using the Platform

1. Start backend and frontend as described above.
2. Register a user or run the seed script for the admin account.
3. Log in:
   - Admin: visit `/admin` to moderate jobs and inspect users.
   - Employer: create or edit jobs, view applicants, and open `/interview/questions` for AI-generated question sets.
   - Student: explore jobs, run the AI check, apply for positions, and practise interviews at `/interview`.

## AI and ML Pipeline

- Skill extraction uses regex heuristics and the curated list in `backend/app/assets/skills.csv`.
- Coverage scoring relies on SentenceTransformer embeddings with caching; string overlap is used as a safety net.
- Gemini 2.5 Flash provides:
  - Interview question generation for employers.
  - Concise interview feedback for students.
  - Enhanced CV analysis (skills, gaps, quality warnings, course suggestions).
- Email invites are sent through Gmail SMTP via `yagmail` when credentials are provided.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Missing GOOGLE_API_KEY` | Confirm `backend/.env` exists, contains the key, and restart `uvicorn`. |
| Gemini falls back to defaults | Check internet access, quota, or update `google-generativeai`. Run `python test_gemini.py` to verify. |
| Gmail invite fails | Create a Gmail App Password and set both `GMAIL_USER` and `GMAIL_APP_PASSWORD`. |
| Files not downloadable | Ensure `JD_UPLOAD_DIR` and `CV_UPLOAD_DIR` exist and are writable. |
| Frontend cannot reach backend | Update Axios base URL in `frontend/src/lib/api.ts` if the API port or host differs. |

## Roadmap

- Move from SQLite to PostgreSQL with Alembic migrations.
- Add automated API and UI tests.
- Provide Docker Compose for easier local onboarding.
- Expose feature flags for alternate AI providers when Gemini quota is limited.

Happy building!
