from __future__ import annotations

import json
from typing import List, Optional
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user, require_roles
from app.schemas.schemas import (
    ProfileDraftOut,
    ProfileDraftSummary,
    ProfileGenerateRequest,
    ProfileRenderResponse,
    ProfileTemplateOut,
    ProfileUpdateRequest,
)
from app.services import pdf_service, profile_service, profile_templates

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _draft_to_out(row: dict) -> ProfileDraftOut:
    blocks_raw = row.get("blocks_json") or "[]"
    try:
        blocks = json.loads(blocks_raw)
    except json.JSONDecodeError:
        blocks = []
    normalized_blocks = profile_templates.merge_blocks_with_contract(blocks, row["template_id"])
    return ProfileDraftOut(
        id=row["id"],
        template_id=row["template_id"],
        template_version=row["template_version"],
        schema_version=row["schema_version"],
        data=json.loads(row["data_json"] or "{}"),
        blocks=normalized_blocks,
    )


def _draft_to_summary(row: dict) -> ProfileDraftSummary:
    data = json.loads(row.get("data_json") or "{}")
    return ProfileDraftSummary(
        id=row["id"],
        template_id=row["template_id"],
        template_version=row.get("template_version", ""),
        name=data.get("name", ""),
        headline=data.get("headline", ""),
        created_at=row.get("created_at"),
        updated_at=row.get("updated_at"),
    )


@router.get("/templates", response_model=List[ProfileTemplateOut])
def get_templates(_: dict = Depends(get_current_user)):
    templates = profile_templates.list_templates()
    if not templates:
        raise HTTPException(status_code=404, detail="No templates available.")
    return templates


@router.get("/drafts", response_model=List[ProfileDraftSummary])
def list_my_drafts(current_user: dict = Depends(get_current_user)):
    drafts = profile_service.list_drafts(current_user["id"])
    return [_draft_to_summary(row) for row in drafts]


@router.post("/generate", response_model=ProfileDraftOut)
def generate_profile(
    request: ProfileGenerateRequest,
    current_user: dict = Depends(require_roles("student", "admin", "employer")),
):
    templates = profile_templates.list_templates()
    if not templates:
        raise HTTPException(status_code=400, detail="No templates available.")
    template_id = request.template_id or templates[0]["id"]
    template_version = profile_templates.get_template_version(template_id)
    if not request.field.strip() or not request.position.strip():
        raise HTTPException(status_code=400, detail="Field and position are required.")

    data = profile_service.generate_profile_payload(
        request.field.strip(),
        request.position.strip(),
        request.style.strip() or "modern",
        request.language.strip() or "English",
        (request.notes or "").strip(),
    )

    blocks = profile_templates.build_default_blocks(template_id)
    draft_id = profile_service.insert_draft(
        user_id=current_user["id"],
        field=request.field.strip(),
        position=request.position.strip(),
        style=request.style.strip() or "modern",
        language=request.language.strip() or "English",
        template_id=template_id,
        template_version=template_version,
        data=data,
        blocks=blocks,
    )
    draft = profile_service.get_draft(draft_id, current_user["id"])
    if not draft:
        raise HTTPException(status_code=500, detail="Failed to save profile draft.")
    return _draft_to_out(draft)


@router.get("/{draft_id}", response_model=ProfileDraftOut)
def fetch_profile(
    draft_id: int,
    current_user: dict = Depends(get_current_user),
):
    draft = profile_service.get_draft(draft_id, current_user["id"])
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")
    return _draft_to_out(draft)


@router.put("/{draft_id}", response_model=ProfileDraftOut)
def update_profile(
    draft_id: int,
    request: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    updated = profile_service.update_draft(
        draft_id,
        current_user["id"],
        data=request.data,
        template_id=request.template_id,
        blocks=request.blocks,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Draft not found.")
    return _draft_to_out(updated)


@router.post("/{draft_id}/render", response_model=ProfileRenderResponse)
def render_profile(
    draft_id: int,
    template_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    draft = profile_service.get_draft(draft_id, current_user["id"])
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")
    rendered = profile_service.render_draft(draft, template_id)
    return ProfileRenderResponse(**rendered)


@router.get("/{draft_id}/export/pdf")
def export_profile_pdf(
    draft_id: int,
    template_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    draft = profile_service.get_draft(draft_id, current_user["id"])
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")
    rendered = profile_service.render_draft(draft, template_id)
    pdf_bytes = pdf_service.render_pdf_from_html(rendered["html"], rendered.get("css"))
    filename = f"profile_{draft_id}.pdf"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf", headers=headers)


@router.delete("/{draft_id}")
def delete_profile_draft(
    draft_id: int,
    current_user: dict = Depends(get_current_user),
):
    removed = profile_service.delete_draft(draft_id, current_user["id"])
    if not removed:
        raise HTTPException(status_code=404, detail="Draft not found.")
    return {"status": "deleted"}
