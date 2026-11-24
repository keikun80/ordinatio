from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from app.db.session import get_db
from app.models.system_setting import SystemSetting
from app.schemas.system_setting import (
    SystemSettingCreate,
    SystemSettingUpdate,
    SystemSettingResponse
)
from app.models.user import User
from app.api.deps import require_permission, get_current_user

router = APIRouter()

@router.get("/system-settings", response_model=List[SystemSettingResponse])
def list_system_settings(
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("system:read"))
):
    """List all registered system settings with optional category filtering."""
    query = db.query(SystemSetting)
    if category:
        query = query.filter(SystemSetting.category == category)
    return query.order_by(SystemSetting.key.asc()).all()

@router.get("/system-settings/public")
def list_public_settings(
    db: Session = Depends(get_db)
):
    """
    Read-only public settings required for UI initialization (LLM providers, templates).
    Does not expose sensitive credentials.
    """
    rows = db.query(SystemSetting).all()
    result = {}
    for r in rows:
        result[r.key] = r.value
    return result

@router.get("/system-settings/{key}", response_model=SystemSettingResponse)
def get_system_setting(
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("system:read"))
):
    """Get a single system setting by key."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"설정 키 '{key}'를 찾을 수 없습니다."
        )
    return setting

@router.post("/system-settings", response_model=SystemSettingResponse, status_code=status.HTTP_201_CREATED)
def create_system_setting(
    payload: SystemSettingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("system:write"))
):
    """Create a new business domain system setting."""
    existing = db.query(SystemSetting).filter(SystemSetting.key == payload.key).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"설정 키 '{payload.key}'가 이미 존재합니다."
        )
    row = SystemSetting(
        key=payload.key,
        category=payload.category,
        description=payload.description,
        value=payload.value
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/system-settings/{key}", response_model=SystemSettingResponse)
def update_system_setting(
    key: str,
    payload: SystemSettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("system:write"))
):
    """Update an existing system setting value."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        # Auto-create if updating via key
        setting = SystemSetting(
            key=key,
            category=payload.category or "general",
            description=payload.description or "",
            value=payload.value
        )
        db.add(setting)
    else:
        if payload.category is not None:
            setting.category = payload.category
        if payload.description is not None:
            setting.description = payload.description
        setting.value = payload.value

    db.commit()
    db.refresh(setting)
    return setting

@router.delete("/system-settings/{key}", status_code=status.HTTP_204_NO_CONTENT)
def delete_system_setting(
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("system:write"))
):
    """Delete a custom system setting."""
    setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"설정 키 '{key}'를 찾을 수 없습니다."
        )
    db.delete(setting)
    db.commit()
    return None
